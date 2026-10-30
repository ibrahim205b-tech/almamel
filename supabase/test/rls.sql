-- اختبارات الأمان: كل كتلة تتوقع نجاحاً أو رفضاً. أي فشل يوقف الملف (ON_ERROR_STOP).
create or replace function pg_temp.expect_error(q text, label text) returns void language plpgsql as $$
begin
  begin execute q; exception when others then return; end;
  raise exception 'EXPECTED FAILURE BUT SUCCEEDED: %', label;
end $$;
create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', coalesce(uid, ''), false);
  if uid is null then execute 'set role anon'; else execute 'set role authenticated'; end if; end $$;

reset role;
create or replace function public.t_id(p_title text) returns bigint language sql security definer as $$ select id from public.posts where title = p_title $$;
grant execute on function public.t_id(text) to anon, authenticated;
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'owner@x.iq', '{"name":"أبو علي","phone":"07701111111"}'),
  ('22222222-2222-2222-2222-222222222222', 'other@x.iq', '{"name":"غريب","phone":"07702222222","role":"admin"}'),
  ('33333333-3333-3333-3333-333333333333', 'admin@x.iq', '{"name":"المدير","phone":"07703333333"}');
select public.make_admin('admin@x.iq');
do $$ begin
  if (select role from profiles where id = '22222222-2222-2222-2222-222222222222') <> 'owner' then raise exception 'role taken from metadata!'; end if;
end $$;

-- ===== زائر: ينشر إعلاناً، يبقى معلّقاً ولا يظهر =====
select pg_temp.as_user(null);
insert into posts (type, title, category, guest_name, contact_phone, status, verified, approved_by, published_at, show_phone, images)
  values ('job', 'وظيفة من زائر', 'توصيل', 'زائر', '07709999999', 'published', true, '33333333-3333-3333-3333-333333333333', now(), false,
          array['guest/0123456789abcdef0123456789abcdef.webp']);
do $$ begin
  if exists (select 1 from public_posts) then raise exception 'pending post visible to public'; end if;
  if exists (select 1 from posts) then raise exception 'anon can read base table'; end if;
end $$;
select pg_temp.expect_error($q$insert into posts (type, title, category, guest_name, contact_phone) values ('business','محل','مطاعم','زائر','07709999999')$q$, 'guest business');
select pg_temp.expect_error($q$insert into posts (type, title, category, contact_phone) values ('job','بدون اسم','توصيل','07709999999')$q$, 'guest without name');
select pg_temp.expect_error($q$insert into posts (type, title, category, guest_name, contact_phone, images) values ('job','صورة','توصيل','زائر','07709999999', array['u/11111111-1111-1111-1111-111111111111/0123456789abcdef0123456789abcdef.webp'])$q$, 'guest image outside guest folder');
update posts set status = 'published', verified = true; -- يجب ألا يغيّر أي صف (لا سياسة تعديل)
select pg_temp.expect_error($q$select public.moderate_post(public.t_id('وظيفة من زائر'), 'approve')$q$, 'anon moderate');

reset role;
do $$ declare r posts; begin
  select * into r from posts where id = public.t_id('وظيفة من زائر');
  if r.status <> 'pending' or r.verified or r.approved_by is not null or r.published_at is not null then raise exception 'insert guard failed: %', row_to_json(r); end if;
end $$;
select pg_temp.expect_error($q$update posts set status = 'published' where id = public.t_id('وظيفة من زائر')$q$, 'publish without approval even as superuser');

-- ===== صاحب محل: يضيف محله، يطلب الملكية، يجهز القائمة =====
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
insert into posts (type, title, category, contact_phone, details) values ('business', 'مطعم أبو علي', 'مطاعم', '07705555555', '{"address":"الشارع العام"}');
insert into claims (business_id, message, business_phone, proof_path, status) values (public.t_id('مطعم أبو علي'), 'اتصلوا على رقم المحل', '07705555555',
  '11111111-1111-1111-1111-111111111111/0123456789abcdef0123456789abcdef.webp', 'approved');
do $$ begin
  if (select status from claims where business_id = public.t_id('مطعم أبو علي')) <> 'pending' then raise exception 'claim status forced by client'; end if;
  if not exists (select 1 from posts where id = public.t_id('مطعم أبو علي')) then raise exception 'owner cannot read own pending business'; end if;
end $$;
insert into menu_items (business_id, section, name, price) values (public.t_id('مطعم أبو علي'), 'مشويات', 'تكة', 6000);
select pg_temp.expect_error($q$select public.moderate_post(public.t_id('مطعم أبو علي'), 'approve')$q$, 'owner approves own business');
select pg_temp.expect_error($q$select public.set_open_state(public.t_id('مطعم أبو علي'), 'open')$q$, 'open state before approval');
select pg_temp.expect_error($q$insert into claims (business_id, message, proof_path) values (public.t_id('مطعم أبو علي'), 'رسالة طويلة كفاية', '22222222-2222-2222-2222-222222222222/0123456789abcdef0123456789abcdef.webp')$q$, 'proof in other user folder');
update profiles set role = 'admin'; -- لا سياسة تعديل: لا يتغير شيء
do $$ begin
  update profiles set role = 'admin';
  if public.is_admin() then raise exception 'became admin'; end if;
end $$;

-- ===== مستخدم آخر: لا يرى ولا يعدّل =====
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
do $$ begin
  if exists (select 1 from posts where id = public.t_id('مطعم أبو علي')) then raise exception 'other user sees pending business'; end if;
  if exists (select 1 from claims) then raise exception 'other user sees claims'; end if;
  if exists (select 1 from menu_items) then raise exception 'other user sees unpublished menu'; end if;
end $$;
select pg_temp.expect_error($q$insert into menu_items (business_id, name) values (public.t_id('مطعم أبو علي'), 'دخيل')$q$, 'other user adds menu item');
do $$ begin
  update menu_items set price = 1;
  delete from menu_items;
  delete from posts;
end $$;
reset role;
do $$ begin
  if (select price from menu_items limit 1) <> 6000 or (select count(*) from posts) <> 2 then raise exception 'other user modified data'; end if;
end $$;

-- ===== المدير يعتمد الطلب: ينشر المحل ويعطي الملكية =====
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
select public.decide_claim((select id from claims where business_id = public.t_id('مطعم أبو علي')), true, null);
select public.moderate_post(public.t_id('وظيفة من زائر'), 'approve');
reset role;
do $$ declare b posts; begin
  select * into b from posts where id = public.t_id('مطعم أبو علي');
  if b.status <> 'published' or b.owner_id <> '11111111-1111-1111-1111-111111111111' or b.approved_by is null then raise exception 'claim approval failed'; end if;
  if (select expires_at from posts where id = public.t_id('وظيفة من زائر')) is null then raise exception 'job expiry not set'; end if;
  if (select count(*) from moderation_log) < 2 then raise exception 'moderation not logged'; end if;
end $$;

-- ===== العامة: يرون المنشور فقط ومن دون البيانات الخاصة =====
select pg_temp.as_user(null);
do $$ declare r record; begin
  select * into r from public_posts where id = public.t_id('وظيفة من زائر');
  if r.contact_phone is not null then raise exception 'hidden phone leaked'; end if;
  if (select count(*) from public_posts) <> 2 then raise exception 'published posts not visible'; end if;
  if (select count(*) from menu_items) <> 1 then raise exception 'published menu not visible'; end if;
  perform 1 from public_posts where false;
end $$;
select pg_temp.expect_error($q$select guest_name from public_posts$q$, 'guest name exposed');
select pg_temp.expect_error($q$select public.make_admin('owner@x.iq')$q$, 'anon make_admin');
select public.site_stamp();

-- ===== المالك المعتمد: حالة المحل، القائمة، والتعديل يعيد للمراجعة =====
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select public.set_open_state(public.t_id('مطعم أبو علي'), 'open');
update menu_items set available = false, business_id = public.t_id('وظيفة من زائر') where business_id = public.t_id('مطعم أبو علي');
select pg_temp.expect_error($q$select public.make_admin('owner@x.iq')$q$, 'owner make_admin');
select public.update_business(public.t_id('مطعم أبو علي'), 'مطعم أبو علي', 'وصف', 'المعامل', '07705555555', true, '{"address":"شارع"}', '{}');
reset role;
do $$ begin
  if (select business_id from menu_items limit 1) <> public.t_id('مطعم أبو علي') then raise exception 'menu item moved to another post'; end if;
  if (select status from posts where id = public.t_id('مطعم أبو علي')) <> 'pending' then raise exception 'edit did not return to review'; end if;
  if (select approved_by from posts where id = public.t_id('مطعم أبو علي')) is not null then raise exception 'approval kept after edit'; end if;
end $$;

-- ===== التخزين =====
select pg_temp.as_user(null);
insert into storage.objects (bucket_id, name) values ('media', 'guest/0123456789abcdef0123456789abcdef.webp');
select pg_temp.expect_error($q$insert into storage.objects (bucket_id, name) values ('media', 'u/11111111-1111-1111-1111-111111111111/0123456789abcdef0123456789abcdef.webp')$q$, 'anon writes user folder');
select pg_temp.expect_error($q$insert into storage.objects (bucket_id, name) values ('proofs', 'x/0123456789abcdef0123456789abcdef.webp')$q$, 'anon proof');
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select pg_temp.expect_error($q$insert into storage.objects (bucket_id, name) values ('media', 'u/11111111-1111-1111-1111-111111111111/0123456789abcdef0123456789abcdef.webp')$q$, 'user writes other folder');
do $$ begin
  if exists (select 1 from storage.objects where bucket_id = 'proofs') then raise exception 'non-admin reads proofs'; end if;
end $$;
reset role;
select 'ALL RLS TESTS PASSED';
