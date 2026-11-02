-- تحديث: «دلفري حر». انسخ الملف كاملاً وشغّله مرة وحدة في Supabase ← SQL Editor ← Run (آمن لو انعاد).
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

-- الصفحة العامة: المعتمدين فقط وبدون العنوان والهوية
create or replace view public.public_riders with (security_barrier = true) as
  select id, name, phone, whatsapp, vehicle, areas, hours, note, decided_at
  from public.riders where status = 'approved';
grant select on public.public_riders to anon, authenticated;

-- صور الهوية: الزائر يرفع لمجلد rider/ باسم عشوائي، وما يكدر يقرأها. الإدارة فقط تشوفها وتحذفها.
drop policy if exists rider_id_upload on storage.objects;
create policy rider_id_upload on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'proofs' and name ~ '^rider/[0-9a-f]{32}\.webp$');
drop policy if exists proofs_admin_delete on storage.objects;
create policy proofs_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'proofs' and public.is_admin());
