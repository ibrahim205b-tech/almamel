-- تحديث: الأمان والثقة. انسخ الملف كاملاً وشغّله مرة وحدة في Supabase ← SQL Editor ← Run (آمن لو انعاد).
--
-- ١) الدخول بخطوتين للإدارة: صلاحيات الإدارة ما تشتغل إلا بعد كود تطبيق المصادقة (Google Authenticator).
--    أول ما تفتح لوحة الإدارة بعد هذا التحديث راح تطلعلك خطوات التفعيل (مرة وحدة).
--    إذا ضاع موبايلك: افتح Supabase ← SQL Editor وشغّل هذا السطر (غيّر البريد لبريدك) وبعدها فعّل من جديد:
--      delete from auth.mfa_factors where user_id = (select id from auth.users where email = 'بريدك@هنا');
-- ٢) المشرفين: يراجعون الإعلانات والمنتجات بس، وما يشوفون الهويات ولا الفلوس.
-- ٣) الشكاوى، التقييم بالنجوم، عدد المشاهدات، «إعلاناتي» للزائر (حذف وتجديد)، وقائمة الإعلانات الي تنتهي.

-- الأدوار: owner صاحب محل، moderator مشرف (يراجع الإعلانات والمنتجات والشكاوى فقط)، admin المدير (كلشي).
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('owner', 'moderator', 'admin'));

-- الدخول بخطوتين: صلاحيات الإدارة ما تشتغل إلا إذا الجلسة متحققة بكود التطبيق (aal2).
-- حتى لو انسرقت كلمة السر، ما يكدر يشوف الهويات أو يغيّر شي بدون الموبايل.
create or replace function public.mfa_ok() returns boolean language sql stable as $$
  select coalesce(auth.jwt()->>'aal', '') = 'aal2'
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.mfa_ok() and exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- المدير أو المشرف
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select public.mfa_ok() and exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'moderator'));
$$;


drop policy if exists posts_read on public.posts;
create policy posts_read on public.posts for select using (
  author_id = auth.uid() or owner_id = auth.uid() or public.is_staff()
);


create or replace function public.can_manage(bid bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_staff() or exists (
    select 1 from posts p where p.id = bid and p.type = 'business' and p.status not in ('removed', 'rejected')
      and (p.owner_id = auth.uid() or (p.owner_id is null and p.author_id = auth.uid())));
$$;


create or replace function public.menu_items_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then new.business_id := old.business_id; end if;
  -- الصورة تُفحص فقط إذا تغيّرت (حتى صاحب المحل يكدر يعدّل صنف صورته رفعتها الإدارة)
  if new.image is not null and (tg_op = 'INSERT' or new.image is distinct from old.image)
     and new.image !~ ('^u/' || auth.uid()::text || '/') and not public.is_staff() then
    raise exception 'مسار صورة غير صالح'; end if;
  if tg_op = 'INSERT' and (select count(*) from menu_items where business_id = new.business_id) >= 300 then
    raise exception 'الحد الأقصى ٣٠٠ صنف'; end if;
  -- منتج جديد من صاحب المحل، أو تغيير اسمه أو وصفه أو صورته: ينتظر موافقة الإدارة.
  -- السعر والقسم والتوفر يتعدلون بدون موافقة. منتجات محل لم يُعتمد بعد تُراجع ويا المحل نفسه.
  if not public.is_staff() then
    if tg_op = 'INSERT' then new.approved := not public.is_public_business(new.business_id);
    elsif new.name is distinct from old.name or new.note is distinct from old.note or new.image is distinct from old.image then new.approved := false;
    else new.approved := old.approved; end if;
  end if;
  new.updated_at := now();
  return new;
end $$;


create or replace function public.moderate_post(p_id bigint, p_action text, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare p posts; days int;
begin
  if not public.is_staff() then raise exception 'غير مسموح'; end if;
  select * into p from posts where id = p_id for update;
  if not found then raise exception 'المنشور غير موجود'; end if;
  if p_action in ('reject', 'hide', 'remove') and char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'اكتب السبب'; end if;
  if p_action = 'approve' then
    if p.status not in ('pending', 'hidden') then raise exception 'لا يمكن نشر منشور بهذه الحالة'; end if;
    days := case p.type when 'job' then 30 when 'property' then 60 when 'market' then 30 when 'offer' then 14
                        when 'community' then 30 when 'help' then 30 when 'service' then 365 else null end;
    update posts set status = 'published', status_reason = null, approved_by = auth.uid(),
      published_at = coalesce(case when p.status = 'hidden' then p.published_at end, now()),
      expires_at = case when p.status = 'hidden' then p.expires_at when days is null then null else now() + make_interval(days => days) end
      where id = p_id;
  elsif p_action = 'reject' then
    if p.status <> 'pending' then raise exception 'المنشور ليس بانتظار المراجعة'; end if;
    update posts set status = 'rejected', status_reason = p_reason where id = p_id;
  elsif p_action = 'hide' then
    if p.status <> 'published' then raise exception 'المنشور غير منشور'; end if;
    update posts set status = 'hidden', status_reason = p_reason where id = p_id;
  elsif p_action = 'remove' then
    update posts set status = 'removed', status_reason = p_reason where id = p_id;
  elsif p_action in ('verify', 'unverify') then
    update posts set verified = (p_action = 'verify') where id = p_id and type in ('business', 'help');
  elsif p_action in ('official', 'unofficial') then
    update posts set is_official = (p_action = 'official') where id = p_id and type = 'community';
  else raise exception 'إجراء غير معروف'; end if;
  insert into moderation_log (post_id, actor_id, action, reason) values (p_id, auth.uid(), p_action, p_reason);
end $$;


-- المدير: يضيف مشرف أو يشيله (بالبريد). المشرف يراجع بس، وما يشوف الهويات والفلوس.
create or replace function public.set_staff_role(p_email text, p_role text) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not public.is_admin() then raise exception 'غير مسموح'; end if;
  if p_role not in ('moderator', 'owner') then raise exception 'دور غير صالح'; end if;
  select id into uid from auth.users where lower(email) = lower(trim(p_email));
  if uid is null then raise exception 'ما كو حساب بهذا البريد. خلي المشرف يسوي حساب من صفحة دخول أصحاب المحلات أول.'; end if;
  if exists (select 1 from profiles where id = uid and role = 'admin') then raise exception 'هذا حساب مدير'; end if;
  update profiles set role = p_role where id = uid;
  return case p_role when 'moderator' then 'صار مشرف' else 'انشال من المشرفين' end;
end $$;
create or replace function public.staff_list() returns table (email text, name text, role text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'غير مسموح'; end if;
  return query select u.email::text, p.name, p.role from profiles p join auth.users u on u.id = p.id where p.role in ('admin', 'moderator') order by p.role, p.name;
end $$;
revoke all on function public.set_staff_role(text, text), public.staff_list() from public, anon;
grant execute on function public.set_staff_role(text, text), public.staff_list() to authenticated;

-- رابط «إعلاناتي» للزائر: المتصفح يرسل بصمة SHA-256 لرمز سري يحتفظ بيه، حتى يحذف أو يجدد إعلانه بدون حساب
alter table public.posts add column if not exists edit_hash text;
create index if not exists posts_edit_hash on public.posts (edit_hash) where edit_hash is not null;

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
  if new.edit_hash is not null and new.edit_hash !~ '^[0-9a-f]{64}$' then new.edit_hash := null; end if;
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

-- ---------- الشكاوى ----------
-- أي زائر يشتكي على إعلان أو محل أو دلفري. الشكوى توصل للإدارة والمشرفين فقط.
create table if not exists public.complaints (
  id          bigint generated always as identity primary key,
  target_type text not null check (target_type in ('post', 'rider')),
  target_id   bigint not null,
  reason      text not null check (reason in ('scam', 'bad_service', 'wrong_info', 'abuse', 'other')),
  details     text check (char_length(details) <= 500),
  phone       text check (phone is null or phone ~ '^07[0-9]{9}$'),
  client_ip   text,
  status      text not null default 'open' check (status in ('open', 'closed')),
  created_at  timestamptz not null default now()
);
alter table public.complaints enable row level security;
drop policy if exists complaints_staff on public.complaints;
create policy complaints_staff on public.complaints for all to authenticated using (public.is_staff()) with check (public.is_staff());

create or replace function public.submit_complaint(p_type text, p_id bigint, p_reason text, p_details text default null, p_phone text default null) returns void
language plpgsql security definer set search_path = public as $$
declare ip text := public.request_ip();
begin
  if p_type = 'post' and not exists (select 1 from posts where id = p_id and status = 'published') then raise exception 'الإعلان غير موجود'; end if;
  if p_type = 'rider' and not exists (select 1 from riders where id = p_id and status = 'approved') then raise exception 'الدلفري غير موجود'; end if;
  if p_type not in ('post', 'rider') then raise exception 'نوع غير صالح'; end if;
  if (select count(*) from complaints where created_at > now() - interval '1 hour' and (client_ip = ip or (ip is null and client_ip is null))) >= 5 then
    raise exception 'وصلتنا شكاوى كثيرة منك هسه. حاول بعد ساعة أو راسلنا على الواتساب.'; end if;
  insert into complaints (target_type, target_id, reason, details, phone, client_ip)
  values (p_type, p_id, p_reason, nullif(trim(p_details), ''), nullif(trim(p_phone), ''), ip);
end $$;
revoke all on function public.submit_complaint(text, bigint, text, text, text) from public;
grant execute on function public.submit_complaint(text, bigint, text, text, text) to anon, authenticated;

-- ---------- التقييم بالنجوم ----------
-- للمحلات والمطاعم والدلفري: تقييم واحد لكل جهاز/IP على كل واحد (يتحدث إذا قيّم مرة ثانية).
-- النجوم تنحسب فوراً، والتعليق يظهر بعد موافقة الإدارة.
create table if not exists public.ratings (
  id          bigint generated always as identity primary key,
  target_type text not null check (target_type in ('post', 'rider')),
  target_id   bigint not null,
  stars       smallint not null check (stars between 1 and 5),
  comment     text check (char_length(comment) <= 300),
  approved    boolean not null default false,
  voter       text not null,
  created_at  timestamptz not null default now(),
  unique (target_type, target_id, voter)
);
alter table public.ratings enable row level security;
drop policy if exists ratings_staff on public.ratings;
create policy ratings_staff on public.ratings for all to authenticated using (public.is_staff()) with check (public.is_staff());

create or replace function public.rate(p_type text, p_id bigint, p_stars integer, p_comment text default null, p_device text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v text := coalesce(public.request_ip(), '') || '|' || coalesce(nullif(p_device, ''), '-');
begin
  if p_type = 'post' and not exists (select 1 from posts where id = p_id and status = 'published' and type = 'business') then raise exception 'المحل غير موجود'; end if;
  if p_type = 'rider' and not exists (select 1 from riders where id = p_id and status = 'approved') then raise exception 'الدلفري غير موجود'; end if;
  if p_type not in ('post', 'rider') then raise exception 'نوع غير صالح'; end if;
  if p_device is not null and p_device !~ '^[0-9a-f]{32}$' then raise exception 'جهاز غير صالح'; end if;
  -- نفس الـIP ما يكدر يقيّم نفس المحل أكثر من ٣ مرات (حتى لو غيّر الجهاز)
  if (select count(*) from ratings where target_type = p_type and target_id = p_id and split_part(voter, '|', 1) = coalesce(public.request_ip(), '')
      and voter <> v) >= 3 then raise exception 'وصلنا تقييمات كافية من شبكتك على هذا.'; end if;
  insert into ratings (target_type, target_id, stars, comment, voter) values (p_type, p_id, p_stars, nullif(trim(p_comment), ''), v)
  on conflict (target_type, target_id, voter) do update
    set stars = excluded.stars, comment = excluded.comment, created_at = now(),
        approved = ratings.approved and ratings.comment is not distinct from excluded.comment;
end $$;
revoke all on function public.rate(text, bigint, integer, text, text) from public;
grant execute on function public.rate(text, bigint, integer, text, text) to anon, authenticated;

create or replace view public.rating_summary with (security_barrier = true) as
  select target_type, target_id, round(avg(stars), 1)::float as avg, count(*)::integer as n from public.ratings group by target_type, target_id;
create or replace view public.public_reviews with (security_barrier = true) as
  select id, target_type, target_id, stars, comment, created_at from public.ratings where approved and comment is not null;
grant select on public.rating_summary, public.public_reviews to anon, authenticated;

-- ---------- عدد المشاهدات ----------
-- عدد زيارات كل صفحة باليوم (بدون أي معلومة عن الزائر). صاحب المحل يشوف أرقامه، والإدارة تشوف الكل.
create table if not exists public.post_views (
  post_id bigint not null,
  day     date not null default current_date,
  n       integer not null default 0,
  primary key (post_id, day)
);
alter table public.post_views enable row level security; -- لا سياسات: الوصول عبر الدوال فقط
create or replace function public.hit(p_id bigint) returns void
language sql security definer set search_path = public as $$
  insert into post_views (post_id, day, n) select p_id, current_date, 1 where exists (select 1 from posts where id = p_id and status = 'published')
  on conflict (post_id, day) do update set n = post_views.n + 1;
$$;
create or replace function public.post_stats(p_id bigint) returns table (day date, n integer)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.can_manage(p_id) then raise exception 'غير مسموح'; end if;
  return query select v.day, v.n from post_views v where v.post_id = p_id and v.day > current_date - 30 order by v.day;
end $$;
create or replace function public.views_30d() returns table (post_id bigint, n integer)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'غير مسموح'; end if;
  return query select v.post_id, sum(v.n)::integer from post_views v where v.day > current_date - 30 group by v.post_id;
end $$;
revoke all on function public.hit(bigint), public.post_stats(bigint), public.views_30d() from public;
grant execute on function public.hit(bigint) to anon, authenticated;
grant execute on function public.post_stats(bigint), public.views_30d() to authenticated;

-- ---------- «إعلاناتي» للزائر: يشوف حالة إعلانه، يحذفه، أو يجدده ----------
create or replace function public.guest_posts(p_tokens text[]) returns table (id bigint, type text, title text, status text, status_reason text, expires_at timestamptz, fee_due integer, token text)
language sql stable security definer set search_path = public as $$
  select p.id, p.type, p.title, p.status, p.status_reason, p.expires_at, p.fee_due, t.tok
  from unnest(p_tokens[1:50]) as t(tok) join posts p on p.edit_hash = encode(sha256(convert_to(t.tok, 'UTF8')), 'hex')
  where t.tok ~ '^[0-9a-f]{32}$';
$$;
create or replace function public.guest_remove_post(p_token text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_token !~ '^[0-9a-f]{32}$' then raise exception 'رابط غير صالح'; end if;
  update posts set status = 'removed', status_reason = 'حذفه صاحبه'
    where edit_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') and status in ('pending', 'published', 'hidden');
  if not found then raise exception 'الإعلان غير موجود أو محذوف'; end if;
end $$;

-- تجديد إعلان منتهي أو قريب ينتهي: يرجع بنفس مدته، ويحسب 1,000 مثل أي إعلان جديد
create or replace function public.private_renew(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare p posts; days int; debt int;
begin
  select * into p from posts where id = p_id for update;
  if not found or p.type = 'business' then raise exception 'الإعلان غير موجود'; end if;
  if p.status <> 'published' then raise exception 'بس الإعلان المنشور يتجدد'; end if;
  if p.expires_at is null or p.expires_at > now() + interval '5 days' then raise exception 'الإعلان بعده ما قرب ينتهي'; end if;
  debt := public.ad_debt(p.author_id, p.contact_phone, p.client_ip);
  if debt >= public.ad_debt_limit() then
    raise exception 'عليك % د.ع رسوم إعلانات سابقة. سدّدها للإدارة على الواتساب وبعدها تكدر تجدد.', to_char(debt, 'FM999,999'); end if;
  days := case p.type when 'job' then 30 when 'property' then 60 when 'market' then 30 when 'offer' then 14
                      when 'community' then 30 when 'help' then 30 when 'service' then 365 else 30 end;
  update posts set expires_at = greatest(now(), expires_at) + make_interval(days => days), fee_due = fee_due + public.ad_fee() where id = p_id;
  insert into moderation_log (post_id, actor_id, action) values (p_id, auth.uid(), 'renew');
end $$;
revoke all on function public.private_renew(bigint) from public, anon, authenticated;
create or replace function public.guest_renew_post(p_token text) returns void
language plpgsql security definer set search_path = public as $$
declare pid bigint;
begin
  if p_token !~ '^[0-9a-f]{32}$' then raise exception 'رابط غير صالح'; end if;
  select id into pid from posts where edit_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  if pid is null then raise exception 'الإعلان غير موجود'; end if;
  perform public.private_renew(pid);
end $$;
create or replace function public.renew_post(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_staff() or exists (select 1 from posts where id = p_id and author_id = auth.uid())) then raise exception 'غير مسموح'; end if;
  perform public.private_renew(p_id);
end $$;
-- الإدارة: الإعلانات الي تنتهي خلال ٣ أيام (حتى تذكّر أصحابها بالواتساب)
create or replace function public.expiring_posts() returns table (id bigint, type text, title text, contact_phone text, name text, expires_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'غير مسموح'; end if;
  return query select p.id, p.type, p.title, p.contact_phone, coalesce(p.guest_name, pr.name), p.expires_at from posts p left join profiles pr on pr.id = p.author_id
    where p.status = 'published' and p.expires_at between now() and now() + interval '3 days' order by p.expires_at;
end $$;
revoke all on function public.guest_posts(text[]), public.guest_remove_post(text), public.guest_renew_post(text), public.renew_post(bigint), public.expiring_posts() from public;
grant execute on function public.guest_posts(text[]), public.guest_remove_post(text), public.guest_renew_post(text) to anon, authenticated;
grant execute on function public.renew_post(bigint), public.expiring_posts() to authenticated;
