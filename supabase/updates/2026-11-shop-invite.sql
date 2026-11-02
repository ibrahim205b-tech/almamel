-- تحديث: رابط خاص لصاحب المحل. انسخ الملف كاملاً وشغّله مرة وحدة في Supabase ← SQL Editor ← Run (آمن لو انعاد).
-- ---------- رابط خاص لصاحب المحل: يفتحه، يسوي حساب، وينربط بمحله تلقائياً ----------
create table if not exists public.shop_invites (
  code        text primary key,
  business_id bigint not null references public.posts(id) on delete cascade,
  created_at  timestamptz not null default now(),
  created_by  uuid,
  used_at     timestamptz,
  used_by     uuid
);
alter table public.shop_invites enable row level security; -- لا سياسات: الوصول عبر الدوال فقط

-- المدير: ينشئ الرابط (أو يرجع نفس الرابط إذا بعده صالح وما انستخدم)
create or replace function public.create_invite(p_business bigint) returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not public.is_admin() then raise exception 'غير مسموح'; end if;
  if not exists (select 1 from posts where id = p_business and type = 'business') then raise exception 'المحل غير موجود'; end if;
  select code into c from shop_invites where business_id = p_business and used_at is null and created_at > now() - interval '30 days' order by created_at desc limit 1;
  if c is null then
    c := substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
    insert into shop_invites (code, business_id, created_by) values (c, p_business, auth.uid());
  end if;
  return c;
end $$;

-- أي زائر عنده الرابط: يعرف اسم المحل حتى تطلعله رسالة الترحيب
create or replace function public.invite_info(p_code text) returns table (business_id bigint, title text)
language sql stable security definer set search_path = public as $$
  select p.id, p.title from shop_invites i join posts p on p.id = i.business_id
  where i.code = p_code and i.used_at is null and i.created_at > now() - interval '30 days';
$$;

-- صاحب المحل بعد ما يسوي حساب أو يسجل دخول: يصير مالك المحل
create or replace function public.accept_invite(p_code text) returns table (business_id bigint, title text)
language plpgsql security definer set search_path = public as $$
declare i shop_invites;
begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولاً'; end if;
  select * into i from shop_invites where code = p_code for update;
  if i.code is null or i.used_at is not null or i.created_at < now() - interval '30 days' then
    raise exception 'الرابط انتهت صلاحيته أو استُخدم. اطلب رابط جديد من الإدارة.'; end if;
  update posts set owner_id = auth.uid() where id = i.business_id and type = 'business';
  update shop_invites set used_at = now(), used_by = auth.uid() where code = p_code;
  insert into moderation_log (post_id, actor_id, action) values (i.business_id, auth.uid(), 'invite_accepted');
  return query select p.id, p.title from posts p where p.id = i.business_id;
end $$;

revoke all on function public.create_invite(bigint), public.invite_info(text), public.accept_invite(text) from public;
grant execute on function public.invite_info(text) to anon, authenticated;
grant execute on function public.create_invite(bigint), public.accept_invite(text) to authenticated;
