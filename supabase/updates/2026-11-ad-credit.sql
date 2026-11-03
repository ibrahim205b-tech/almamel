-- تحديث: رسوم الإعلانات صارت دين. انسخ الملف كاملاً وشغّله مرة وحدة في Supabase ← SQL Editor ← Run (آمن لو انعاد).
-- الإعلان الأول مجاني، وكل إعلان بعده 1,000 د.ع دين على صاحبه وينشر عادي.
-- إذا وصل الدين 3,000 د.ع ما يكدر ينشر لحد ما يسدد بالواتساب والإدارة تضغط «تم الدفع، تنشيط».
-- الشخص يُعرف بحسابه أو رقمه أو عنوان IP (حتى لو غيّر رقمه).

-- عنوان IP لمن نشر (للإدارة فقط): يعرف الشخص حتى لو غيّر رقمه، لاحتساب رسوم الإعلانات.
alter table public.posts add column if not exists client_ip text;
create index if not exists posts_client_ip on public.posts (client_ip) where client_ip is not null;
create index if not exists posts_phone on public.posts (contact_phone) where contact_phone is not null;

create or replace function public.ad_fee() returns integer language sql immutable as $$ select 1000 $$;
-- إذا وصل الدين لهذا الحد ما يكدر ينشر لحد ما يسدد (٣ إعلانات غير مسددة)
create or replace function public.ad_debt_limit() returns integer language sql immutable as $$ select 3000 $$;

-- عنوان IP الحقيقي للطلب (Supabase يمرره بالرؤوس؛ cf-connecting-ip يضعه Cloudflare ولا يكدر المتصفح يزوّره)
create or replace function public.request_ip() returns text language sql stable as $$
  select nullif(trim(coalesce(h->>'cf-connecting-ip', h->>'x-real-ip', split_part(h->>'x-forwarded-for', ',', 1))), '')
  from (select coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json as h) t
$$;

-- نفس الشخص = نفس الحساب، أو نفس رقم الهاتف، أو نفس IP خلال آخر ٣٠ يوم
create or replace function public.same_poster(q public.posts, uid uuid, phone text, ip text) returns boolean
language sql stable as $$
  select (uid is not null and q.author_id = uid) or (phone is not null and q.contact_phone = phone)
      or (ip is not null and q.client_ip = ip and q.created_at > now() - interval '30 days')
$$;

-- كل منشورات هذا الشخص: المطابقة مباشرة، وكل ما نشره بأي رقم أو IP أو حساب استخدمه بهذي المنشورات
-- (مثلاً غيّر رقمه بس نفس الـIP، أو غيّر الـIP بس نفس الرقم)
create or replace function public.linked_posts(uid uuid, phone text, ip text) returns setof public.posts
language sql stable security definer set search_path = public as $$
  with d as (select * from posts q where public.same_poster(q, uid, phone, ip)),
  k as (select array_agg(distinct d.contact_phone) filter (where d.contact_phone is not null) as phones,
               array_agg(distinct d.client_ip) filter (where d.client_ip is not null and d.created_at > now() - interval '30 days') as ips,
               array_agg(distinct d.author_id) filter (where d.author_id is not null) as uids from d)
  select q.* from posts q, k
  where public.same_poster(q, uid, phone, ip) or q.contact_phone = any(k.phones) or q.author_id = any(k.uids)
     or (q.client_ip = any(k.ips) and q.created_at > now() - interval '30 days')
$$;
revoke all on function public.linked_posts(uuid, text, text) from public, anon, authenticated;

-- دين الإعلانات غير المسددة لهذا الشخص (المرفوض والمحذوف ما ينحسب)
create or replace function public.ad_debt(uid uuid, phone text, ip text) returns integer
language sql stable security definer set search_path = public as $$
  select coalesce(sum(q.fee_due), 0)::integer from public.linked_posts(uid, phone, ip) q
  where q.fee_due > 0 and q.status not in ('rejected', 'removed')
$$;
revoke all on function public.ad_debt(uuid, text, text) from public, anon, authenticated;

-- كل منشور جديد يدخل «بانتظار المراجعة» مهما أرسل المتصفح. الحقول الحساسة تُفرض هنا.
create or replace function public.posts_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); p text;
begin
  new.status := 'pending'; new.status_reason := null; new.approved_by := null;
  new.published_at := null; new.expires_at := null; new.verified := false; new.is_official := false;
  new.owner_id := null; new.open_state := 'unknown'; new.featured_until := null;
  -- الشعار: للمحلات فقط ومن مجلد صاحب الحساب نفسه
  if new.logo is not null and (uid is null or new.type <> 'business' or not valid_media_path(new.logo, uid)) then new.logo := null; end if;
  new.author_id := uid; new.created_at := now(); new.updated_at := now();
  -- الإعلان الأول لكل شخص مجاني، وكل إعلان بعده دين عليه بـ ad_fee() يسدده للإدارة.
  -- إذا وصل دينه ad_debt_limit() ما يكدر ينشر لحد ما الإدارة تأكد الدفع. طلب تسجيل المحل نفسه ما ينحسب.
  new.client_ip := public.request_ip();
  new.fee_due := 0;
  if new.type <> 'business' then
    if public.ad_debt(uid, new.contact_phone, new.client_ip) >= public.ad_debt_limit() then
      raise exception 'عليك % د.ع رسوم إعلانات سابقة. سدّدها للإدارة على الواتساب وبعدها تكدر تنشر.', to_char(public.ad_debt(uid, new.contact_phone, new.client_ip), 'FM999,999');
    end if;
    if exists (select 1 from posts q where q.type <> 'business' and q.status <> 'rejected' and public.same_poster(q, uid, new.contact_phone, new.client_ip)) then
      new.fee_due := public.ad_fee();
    end if;
  end if;
  if uid is null then
    if new.type = 'business' then raise exception 'المحلات تُضاف من حساب صاحب المحل'; end if;
    if new.guest_name is null or new.contact_phone is null then raise exception 'الاسم ورقم التواصل مطلوبان'; end if;
    if cardinality(new.images) > 3 then raise exception 'الحد الأقصى ٣ صور'; end if;
    if (select count(*) from posts where author_id is null and created_at > now() - interval '1 hour') >= 30 then
      raise exception 'وصلت إعلانات كثيرة الآن. حاول بعد ساعة.'; end if;
  else
    new.guest_name := null;
    if (select count(*) from posts where author_id = uid and created_at > now() - interval '1 day') >= 15 then
      raise exception 'وصلت للحد اليومي للمنشورات.'; end if;
  end if;
  foreach p in array new.images loop
    if not valid_media_path(p, uid) then raise exception 'مسار صورة غير صالح'; end if;
  end loop;
  if new.business_id is not null and not exists (
      select 1 from posts b where b.id = new.business_id and b.type = 'business' and b.status = 'published' and b.owner_id = uid) then
    new.business_id := null;
  end if;
  if new.type = 'help' and coalesce((new.details->>'consent')::boolean, false) is not true then
    raise exception 'يجب تأكيد موافقة صاحب الحالة على النشر'; end if;
  return new;
end $$;

-- المدير: «تم الدفع، تنشيط»: يصفّر كل ديون هذا الشخص (حسابه ورقمه وعنوان IP مالته)
create or replace function public.settle_debt(p_id bigint) returns integer
language plpgsql security definer set search_path = public as $$
declare r posts; n integer;
begin
  if not public.is_admin() then raise exception 'غير مسموح'; end if;
  select * into r from posts where id = p_id;
  if not found then raise exception 'المنشور غير موجود'; end if;
  select coalesce(sum(fee_due), 0) into n from public.linked_posts(r.author_id, r.contact_phone, r.client_ip) q where q.fee_due > 0;
  update posts set fee_due = 0 where fee_due > 0 and id in (select l.id from public.linked_posts(r.author_id, r.contact_phone, r.client_ip) l);
  insert into moderation_log (post_id, actor_id, action, reason) values (p_id, auth.uid(), 'debt_settled', n::text);
  return n;
end $$;

-- المدير: قائمة المديونين (كل حساب أو IP بسطر: الاسم، الأرقام، عناوين IP، عدد الإعلانات غير المسددة، المبلغ)
create or replace function public.admin_debts() returns table (post_id bigint, name text, phones text[], ips text[], ads integer, total integer, blocked boolean, last_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'غير مسموح'; end if;
  return query
    select max(q.id), max(coalesce(q.guest_name, pr.name)), array_remove(array_agg(distinct q.contact_phone), null), array_remove(array_agg(distinct q.client_ip), null),
           count(*)::integer, sum(q.fee_due)::integer, sum(q.fee_due) >= public.ad_debt_limit(), max(q.created_at)
    from posts q left join profiles pr on pr.id = q.author_id
    where q.fee_due > 0 and q.status not in ('rejected', 'removed')
    group by coalesce(q.author_id::text, q.client_ip, q.contact_phone)
    order by sum(q.fee_due) desc, max(q.created_at) desc;
end $$;
revoke all on function public.settle_debt(bigint), public.admin_debts() from public, anon;
grant execute on function public.settle_debt(bigint), public.admin_debts() to authenticated;

-- الإعلانات القديمة المسجلة بـ 3,000 تصير بالسعر الجديد
update public.posts set fee_due = public.ad_fee() where fee_due > public.ad_fee() and type <> 'business';
