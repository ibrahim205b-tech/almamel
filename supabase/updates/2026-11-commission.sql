-- تحديث: نسبة ٥٪ من طلبات المطاعم. انسخ الملف كاملاً وشغّله مرة وحدة في Supabase ← SQL Editor ← Run (آمن لو انعاد).
-- ---------- نسبة المنصة من طلبات المطاعم ----------
-- كل طلب يُرسل من سلة الموقع يُسجَّل (المبلغ فقط، بلا بيانات الزبون). المطعم يدفع النسبة شهرياً، وسعر الزبون لا يتغير.
create or replace function public.commission_rate() returns numeric language sql immutable as $$ select 0.05 $$;

create table if not exists public.orders (
  id          bigserial primary key,
  business_id bigint not null references public.posts(id) on delete cascade,
  total       bigint not null check (total between 0 and 10000000),
  items       integer not null check (items between 1 and 500),
  created_at  timestamptz not null default now()
);
create index if not exists orders_business_time on public.orders (business_id, created_at);
alter table public.orders enable row level security; -- لا سياسات: الوصول عبر الدوال فقط

create table if not exists public.commission_payments (
  business_id bigint not null references public.posts(id) on delete cascade,
  month       date not null,
  amount      bigint not null,
  paid_at     timestamptz not null default now(),
  paid_by     uuid,
  primary key (business_id, month)
);
alter table public.commission_payments enable row level security;

-- يستدعيها الموقع العام عند ضغط «أرسل الطلب عبر واتساب»
create or replace function public.log_order(p_business bigint, p_total bigint, p_items integer) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_total is null or p_total < 0 or p_total > 10000000 or p_items is null or p_items < 1 or p_items > 500 then
    raise exception 'طلب غير صالح'; end if;
  if not public.is_public_business(p_business) then raise exception 'المحل غير منشور'; end if;
  -- حماية من التكرار والعبث: حد أقصى للطلبات لكل محل بالساعة، وتجاهل نفس الطلب خلال دقيقة
  if (select count(*) from orders where business_id = p_business and created_at > now() - interval '1 hour') >= 60 then return; end if;
  if exists (select 1 from orders where business_id = p_business and total = p_total and items = p_items
             and created_at > now() - interval '1 minute') then return; end if;
  insert into orders (business_id, total, items) values (p_business, p_total, p_items);
end $$;

-- كشف شهر (بتوقيت بغداد): المدير يرى كل المحلات، وصاحب المحل يرى محلاته فقط
create or replace function public.commission_report(p_month date default null)
returns table (business_id bigint, title text, orders bigint, total bigint, commission bigint, paid boolean, paid_amount bigint)
language sql stable security definer set search_path = public as $$
  with m as (select date_trunc('month', coalesce(p_month, (now() at time zone 'Asia/Baghdad')::date))::date as d)
  select o.business_id, p.title, count(*)::bigint, sum(o.total)::bigint,
         round(sum(o.total) * public.commission_rate())::bigint,
         cp.business_id is not null, cp.amount
  from orders o cross join m
  join posts p on p.id = o.business_id
  left join commission_payments cp on cp.business_id = o.business_id and cp.month = m.d
  where (o.created_at at time zone 'Asia/Baghdad') >= m.d
    and (o.created_at at time zone 'Asia/Baghdad') < m.d + interval '1 month'
    and (public.is_admin() or public.can_manage(o.business_id))
  group by o.business_id, p.title, cp.business_id, cp.amount
  order by sum(o.total) desc;
$$;

-- المدير: تأكيد استلام نسبة شهر من محل (المبلغ يُثبَّت كما هو وقت الدفع)
create or replace function public.mark_commission_paid(p_business bigint, p_month date, p_paid boolean default true) returns void
language plpgsql security definer set search_path = public as $$
declare d date := date_trunc('month', p_month)::date; amt bigint;
begin
  if not public.is_admin() then raise exception 'غير مسموح'; end if;
  if not p_paid then delete from commission_payments where business_id = p_business and month = d; return; end if;
  select r.commission into amt from public.commission_report(d) r where r.business_id = p_business;
  if amt is null then raise exception 'لا توجد طلبات لهذا المحل في هذا الشهر'; end if;
  insert into commission_payments (business_id, month, amount, paid_by) values (p_business, d, amt, auth.uid())
    on conflict (business_id, month) do update set amount = excluded.amount, paid_at = now(), paid_by = excluded.paid_by;
  insert into moderation_log (post_id, actor_id, action, reason) values (p_business, auth.uid(), 'commission_paid', to_char(d, 'YYYY-MM') || ' ' || amt);
end $$;

revoke all on function public.log_order(bigint, bigint, integer), public.commission_report(date), public.mark_commission_paid(bigint, date, boolean) from public;
grant execute on function public.log_order(bigint, bigint, integer) to anon, authenticated;
grant execute on function public.commission_report(date), public.mark_commission_paid(bigint, date, boolean) to authenticated;

