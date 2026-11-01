-- تحديث: الطلب من داخل الموقع وموقع المطعم (/mat3am). انسخ الملف كاملاً وشغّله مرة وحدة في Supabase ← SQL Editor ← Run (آمن لو انعاد).
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
-- أعمدة الطلب من داخل الموقع (status: sent = أُرسل عبر واتساب، new / accepted / rejected / done = من الموقع)
alter table public.orders add column if not exists status text not null default 'sent';
alter table public.orders add column if not exists token uuid not null default gen_random_uuid();
alter table public.orders add column if not exists customer_name text;
alter table public.orders add column if not exists customer_phone text;
alter table public.orders add column if not exists landmark text;
alter table public.orders add column if not exists lat double precision;
alter table public.orders add column if not exists lng double precision;
alter table public.orders add column if not exists note text;
alter table public.orders add column if not exists lines jsonb not null default '[]';
alter table public.orders add column if not exists reason text;
alter table public.orders add column if not exists eta integer;
alter table public.orders add column if not exists decided_at timestamptz;
do $$ begin
  alter table public.orders add constraint orders_status_check check (status in ('sent', 'new', 'accepted', 'rejected', 'done'));
exception when duplicate_object then null; end $$;
create unique index if not exists orders_token on public.orders (token);
create index if not exists orders_status_time on public.orders (business_id, status, created_at);

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
  where o.status in ('sent', 'accepted', 'done')
    and (o.created_at at time zone 'Asia/Baghdad') >= m.d
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

-- ---------- الطلب من داخل الموقع: الزبون يطلب، والمطعم يستلم ويقبل أو يرفض ----------
-- status: sent = طلب أُرسل عبر واتساب (سجل فقط)، new = جديد بانتظار المطعم، accepted = مقبول، rejected = مرفوض، done = تم التوصيل.

-- الزبون: يرسل الطلب. الأسعار تُحسب هنا من قائمة المطعم، لا من المتصفح.
-- p_items: [{"name": "تكة لحم", "q": 2}, ...]
create or replace function public.place_order(p_business bigint, p_items jsonb, p_phone text, p_name text, p_landmark text,
  p_lat double precision default null, p_lng double precision default null, p_note text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare it jsonb; m menu_items; q int; tot bigint := 0; cnt int := 0; out_lines jsonb := '[]'; t uuid;
begin
  if not public.is_public_business(p_business) then raise exception 'المطعم غير متاح'; end if;
  if p_phone is null or p_phone !~ '^07[0-9]{9}$' then raise exception 'رقم الهاتف غير صحيح'; end if;
  if p_landmark is null or length(trim(p_landmark)) < 3 or length(p_landmark) > 300 then raise exception 'اكتب أقرب نقطة دالة'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 60 then raise exception 'السلة فارغة'; end if;
  if (select count(*) from orders where customer_phone = p_phone and created_at > now() - interval '10 minutes') >= 5 then
    raise exception 'طلبات كثيرة من هذا الرقم. انتظر شوية وحاول مرة ثانية.'; end if;
  if (select count(*) from orders where business_id = p_business and created_at > now() - interval '1 hour') >= 80 then
    raise exception 'المطعم مشغول حالياً. حاول بعد قليل.'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    q := least(greatest(coalesce((it->>'q')::int, 0), 0), 50);
    if q = 0 then continue; end if;
    select * into m from menu_items where business_id = p_business and name = it->>'name' and available order by id limit 1;
    if not found then raise exception 'الصنف «%» غير متوفر حالياً', it->>'name'; end if;
    out_lines := out_lines || jsonb_build_object('name', m.name, 'price', m.price, 'q', q);
    tot := tot + coalesce(m.price, 0) * q; cnt := cnt + q;
  end loop;
  if cnt = 0 then raise exception 'السلة فارغة'; end if;
  -- البيانات الشخصية للطلبات القديمة تُمسح بعد ٣٠ يوماً (يبقى المبلغ للحساب الشهري)
  update orders set customer_name = null, customer_phone = null, landmark = null, lat = null, lng = null, note = null
    where created_at < now() - interval '30 days' and customer_phone is not null;
  insert into orders (business_id, total, items, status, customer_name, customer_phone, landmark, lat, lng, note, lines)
  values (p_business, least(tot, 10000000), least(cnt, 500), 'new', nullif(left(trim(coalesce(p_name, '')), 60), ''), p_phone, left(trim(p_landmark), 300),
          case when p_lat between 29 and 38 and p_lng between 38 and 49 then p_lat end,
          case when p_lat between 29 and 38 and p_lng between 38 and 49 then p_lng end,
          nullif(left(trim(coalesce(p_note, '')), 300), ''), out_lines)
  returning token into t;
  return t;
end $$;

-- الزبون: يتابع حالة طلبه بالرمز اللي استلمه (بدون حساب)
create or replace function public.order_status(p_token uuid)
returns table (id bigint, status text, reason text, eta integer, created_at timestamptz, decided_at timestamptz, total bigint, lines jsonb,
               business_id bigint, title text, business_phone text)
language sql stable security definer set search_path = public as $$
  select o.id, o.status, o.reason, o.eta, o.created_at, o.decided_at, o.total, o.lines, o.business_id, p.title,
         case when p.show_phone then p.contact_phone end
  from orders o join posts p on p.id = o.business_id
  where o.token = p_token and o.created_at > now() - interval '2 days';
$$;

-- المطعم: طلبات محلاته (آخر يومين)
create or replace function public.kitchen_orders()
returns table (id bigint, business_id bigint, title text, status text, created_at timestamptz, decided_at timestamptz, total bigint, items integer,
               lines jsonb, customer_name text, customer_phone text, landmark text, lat double precision, lng double precision, note text, reason text, eta integer)
language sql stable security definer set search_path = public as $$
  select o.id, o.business_id, p.title, o.status, o.created_at, o.decided_at, o.total, o.items, o.lines,
         o.customer_name, o.customer_phone, o.landmark, o.lat, o.lng, o.note, o.reason, o.eta
  from orders o join posts p on p.id = o.business_id
  where o.status <> 'sent' and o.created_at > now() - interval '2 days'
    and (p.owner_id = auth.uid() or (p.owner_id is null and p.author_id = auth.uid()) or public.is_admin())
  order by o.created_at desc
  limit 300;
$$;

-- المطعم: قبول (مع وقت التجهيز) أو رفض (مع السبب) أو «تم التوصيل»
create or replace function public.decide_order(p_id bigint, p_status text, p_reason text default null, p_eta integer default null) returns void
language plpgsql security definer set search_path = public as $$
declare o orders;
begin
  select * into o from orders where id = p_id;
  if o.id is null or not public.can_manage(o.business_id) then raise exception 'غير مسموح'; end if;
  if not ((o.status = 'new' and p_status in ('accepted', 'rejected')) or (o.status = 'accepted' and p_status in ('done', 'rejected'))) then
    raise exception 'لا يمكن تغيير حالة هذا الطلب'; end if;
  if p_status = 'rejected' and length(trim(coalesce(p_reason, ''))) < 2 then raise exception 'اكتب سبب الرفض'; end if;
  update orders set status = p_status, decided_at = now(),
    reason = case when p_status = 'rejected' then left(trim(p_reason), 200) else reason end,
    eta = case when p_status = 'accepted' and p_eta between 5 and 180 then p_eta else eta end
  where id = p_id;
end $$;

-- المدير: ربط حساب صاحب المطعم بمطعم أضافته الإدارة (حتى يستلم الطلبات ويدير القائمة)
create or replace function public.assign_owner(p_business bigint, p_email text) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not public.is_admin() then raise exception 'غير مسموح'; end if;
  select id into uid from auth.users where lower(email) = lower(trim(p_email));
  if uid is null then raise exception 'ماكو حساب بهذا البريد. خلي صاحب المطعم يسوي حساب من موقع المطعم أولاً.'; end if;
  update posts set owner_id = uid where id = p_business and type = 'business';
  if not found then raise exception 'المحل غير موجود'; end if;
  insert into moderation_log (post_id, actor_id, action, reason) values (p_business, auth.uid(), 'assign_owner', p_email);
  return 'تم ربط الحساب بالمطعم';
end $$;

revoke all on function public.place_order(bigint, jsonb, text, text, text, double precision, double precision, text), public.order_status(uuid),
  public.kitchen_orders(), public.decide_order(bigint, text, text, integer), public.assign_owner(bigint, text) from public;
grant execute on function public.place_order(bigint, jsonb, text, text, text, double precision, double precision, text), public.order_status(uuid) to anon, authenticated;
grant execute on function public.kitchen_orders(), public.decide_order(bigint, text, text, integer), public.assign_owner(bigint, text) to authenticated;

revoke all on function public.log_order(bigint, bigint, integer), public.commission_report(date), public.mark_commission_paid(bigint, date, boolean) from public;
grant execute on function public.log_order(bigint, bigint, integer) to anon, authenticated;
grant execute on function public.commission_report(date), public.mark_commission_paid(bigint, date, boolean) to authenticated;

