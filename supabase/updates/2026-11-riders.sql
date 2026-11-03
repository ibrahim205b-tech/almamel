-- تحديث: «دلفري حر» وتسعيرة الكروة. انسخ الملف كاملاً وشغّله في Supabase ← SQL Editor ← Run (آمن لو انعاد، حتى لو شغّلته قبل).
-- ---------- أصحاب الدراجات والتوصيل الحر ----------
-- العام (بعد موافقة الإدارة): الاسم، الرقم، المركبة، مناطق التوصيل، الأوقات، ملاحظة.
-- الخاص (للإدارة فقط، ما يطلع لأي أحد): العنوان بالضبط وصورتي الهوية الوطنية بمخزن proofs الخاص.
create table if not exists public.riders (
  id          bigint generated always as identity primary key,
  name        text not null check (char_length(name) between 2 and 60),
  phone       text not null check (phone ~ '^07[0-9]{9}$'),
  whatsapp    boolean not null default true,
  vehicle     text not null check (vehicle in ('دراجة نارية', 'ستوتة', 'سيارة', 'دراجة هوائية')),
  areas       text not null check (char_length(areas) between 2 and 200),
  hours       text check (char_length(hours) <= 80),
  note        text check (char_length(note) <= 300),
  address     text not null check (char_length(address) between 5 and 300),
  id_front    text not null check (id_front ~ '^rider/[0-9a-f]{32}\.webp$'),
  id_back     text not null check (id_back ~ '^rider/[0-9a-f]{32}\.webp$'),
  status      text not null default 'pending' check (status in ('pending', 'approved', 'suspended')),
  created_at  timestamptz not null default now(),
  decided_at  timestamptz
);
alter table public.riders enable row level security;
-- رقم واحد = تسجيل واحد
create unique index if not exists riders_phone on public.riders (phone);

-- أي زائر يسجّل (بانتظار المراجعة فقط)؛ القراءة والتعديل والحذف للإدارة فقط
drop policy if exists riders_insert on public.riders;
create policy riders_insert on public.riders for insert to anon, authenticated with check (status = 'pending' and decided_at is null);
drop policy if exists riders_admin_read on public.riders;
create policy riders_admin_read on public.riders for select using (public.is_admin());
drop policy if exists riders_admin_update on public.riders;
create policy riders_admin_update on public.riders for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists riders_admin_delete on public.riders;
create policy riders_admin_delete on public.riders for delete to authenticated using (public.is_admin());


-- صور الهوية: الزائر يرفع لمجلد rider/ باسم عشوائي، وما يكدر يقرأها. الإدارة فقط تشوفها وتحذفها.
drop policy if exists rider_id_upload on storage.objects;
create policy rider_id_upload on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'proofs' and name ~ '^rider/[0-9a-f]{32}\.webp$');
drop policy if exists proofs_admin_delete on storage.objects;
create policy proofs_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'proofs' and public.is_admin());

-- ---------- تسعيرة الدلفري (الكروة) ----------
-- جدول تسعيرة واحد يشوفه الكل، والإدارة تعدّله من لوحتها. kind: zone = حسب المسافة، extra = إضافات.
create table if not exists public.delivery_fares (
  id     bigint generated always as identity primary key,
  kind   text not null check (kind in ('zone', 'extra')),
  label  text not null check (char_length(label) between 2 and 80),
  price  integer check (price between 0 and 100000),
  sort   integer not null default 0
);
alter table public.delivery_fares enable row level security;
drop policy if exists fares_read on public.delivery_fares;
create policy fares_read on public.delivery_fares for select using (true);
-- التسعيرة المقترحة أول مرة فقط
insert into public.delivery_fares (kind, label, price, sort)
select * from (values
  ('zone', 'مسافة قريبة جداً (نفس المحلة)', null, 1), ('zone', 'أقل كروة: داخل المعامل', 3000, 2),
  ('zone', 'من المعامل للحسينية والمناطق المجاورة', 4000, 3), ('zone', 'أبعد من هيج', 5000, 4),
  ('extra', 'بالليل بعد الساعة ١٢', 1000, 1), ('extra', 'غرض ثقيل أو ستوتة', 1500, 2),
  ('extra', 'إذا الدلفري يشتري الغرض من فلوسه', 500, 3)) v(kind, label, price, sort)
where not exists (select 1 from public.delivery_fares);

-- الإدارة: تستبدل التسعيرة كلها دفعة وحدة
create or replace function public.set_delivery_fares(p_rows jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'غير مسموح'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 30 then raise exception 'تسعيرة غير صالحة'; end if;
  delete from delivery_fares where true;
  insert into delivery_fares (kind, label, price, sort)
  select r->>'kind', trim(r->>'label'), nullif(r->>'price', '')::integer, (ord)::integer
  from jsonb_array_elements(p_rows) with ordinality as t(r, ord);
end $$;
revoke all on function public.set_delivery_fares(jsonb) from public, anon;
grant execute on function public.set_delivery_fares(jsonb) to authenticated;

-- كروة الدلفري الأقل (اختياري، تطلع على بطاقته)
-- الصفحة العامة: المعتمدين فقط وبدون العنوان والهوية
alter table public.riders add column if not exists min_fare integer check (min_fare between 250 and 50000);
create or replace view public.public_riders with (security_barrier = true) as
  select id, name, phone, whatsapp, vehicle, areas, hours, note, decided_at, min_fare
  from public.riders where status = 'approved';
grant select on public.public_riders to anon, authenticated;
