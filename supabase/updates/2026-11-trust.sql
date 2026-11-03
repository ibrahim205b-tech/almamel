-- تحديث: الأمان والثقة. انسخ الملف كاملاً وشغّله مرة وحدة في Supabase ← SQL Editor ← Run (آمن لو انعاد).
--
-- ١) الدخول بخطوتين للإدارة: صلاحيات الإدارة ما تشتغل إلا بعد كود تطبيق المصادقة (Google Authenticator).
--    أول ما تفتح لوحة الإدارة بعد هذا التحديث راح تطلعلك خطوات التفعيل (مرة وحدة).
--    إذا ضاع موبايلك: افتح Supabase ← SQL Editor وشغّل هذا السطر (غيّر البريد لبريدك) وبعدها فعّل من جديد:
--      delete from auth.mfa_factors where user_id = (select id from auth.users where email = 'بريدك@هنا');
-- ٢) المشرفين: يراجعون الإعلانات والمنتجات بس، وما يشوفون الهويات ولا الفلوس.

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
