-- اختبارات الأمان: كل كتلة تتوقع نجاحاً أو رفضاً. أي فشل يوقف الملف (ON_ERROR_STOP).
create or replace function pg_temp.expect_error(q text, label text) returns void language plpgsql as $$
begin
  begin execute q; exception when others then return; end;
  raise exception 'EXPECTED FAILURE BUT SUCCEEDED: %', label;
end $$;
create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', coalesce(uid, ''), false);
  perform set_config('request.jwt.claims', case when uid is null then '{}' else '{"aal":"aal2"}' end, false);
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
-- ===== الرسوم والتمييز والشعار =====
reset role;
delete from posts where contact_phone = '07708888888';
select pg_temp.as_user(null);
insert into posts (type, title, category, guest_name, contact_phone, fee_due, featured_until) values ('job', 'أول إعلان مجاني', 'توصيل', 'زائر', '07708888888', 0, now() + interval '99 days');
insert into posts (type, title, category, guest_name, contact_phone, fee_due) values ('job', 'ثاني إعلان مدفوع', 'توصيل', 'زائر', '07708888888', 0);
reset role;
do $$ begin
  if (select fee_due from posts where id = public.t_id('أول إعلان مجاني')) <> 0 then raise exception 'first ad should be free'; end if;
  if (select fee_due from posts where id = public.t_id('ثاني إعلان مدفوع')) <> 1000 then raise exception 'second ad should cost 1000'; end if;
  if (select featured_until from posts where id = public.t_id('أول إعلان مجاني')) is not null then raise exception 'client set featured_until'; end if;
end $$;
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select pg_temp.expect_error($q$select public.mark_fee_paid(public.t_id('ثاني إعلان مدفوع'))$q$, 'non-admin marks fee paid');
select pg_temp.expect_error($q$select public.feature_post(public.t_id('أول إعلان مجاني'), 10)$q$, 'non-admin features');
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
select public.mark_fee_paid(public.t_id('ثاني إعلان مدفوع'));
select pg_temp.expect_error($q$select public.feature_post(public.t_id('أول إعلان مجاني'), 10)$q$, 'feature unpublished');
select public.moderate_post(public.t_id('أول إعلان مجاني'), 'approve');
select public.feature_post(public.t_id('أول إعلان مجاني'), 10);
reset role;
do $$ begin
  if (select fee_due from posts where id = public.t_id('ثاني إعلان مدفوع')) <> 0 then raise exception 'fee not cleared'; end if;
  if (select featured_until from public_posts where id = public.t_id('أول إعلان مجاني')) < now() + interval '9 days' then raise exception 'not featured for 10 days'; end if;
end $$;
-- ===== دين الإعلانات: الأول مجاني، بعده ١٬٠٠٠ لكل إعلان، وعند ٣٬٠٠٠ ينمنع. الـIP يعرف الشخص حتى لو غيّر رقمه =====
reset role;
select set_config('request.headers', '{"cf-connecting-ip":"5.6.7.8","x-forwarded-for":"1.1.1.1"}', false);
select pg_temp.as_user(null);
insert into posts (type, title, category, guest_name, contact_phone) values ('market', 'دين ١', 'أجهزة', 'مستعجل', '07701000001');
insert into posts (type, title, category, guest_name, contact_phone) values ('market', 'دين ٢', 'أجهزة', 'مستعجل', '07701000001');
insert into posts (type, title, category, guest_name, contact_phone) values ('market', 'دين ٣', 'أجهزة', 'مستعجل', '07701000002');
insert into posts (type, title, category, guest_name, contact_phone) values ('market', 'دين ٤', 'أجهزة', 'مستعجل', '07701000003');
select pg_temp.expect_error($q$insert into posts (type, title, category, guest_name, contact_phone) values ('market', 'دين ٥', 'أجهزة', 'مستعجل', '07701000004')$q$, 'blocked at 3000 by IP');
select pg_temp.expect_error($q$insert into posts (type, title, category, guest_name, contact_phone, client_ip) values ('market', 'دين ٥', 'أجهزة', 'مستعجل', '07701000004', '8.8.8.8')$q$, 'spoofed client_ip column');
select set_config('request.headers', '{"cf-connecting-ip":"9.9.9.9"}', false);
select pg_temp.expect_error($q$insert into posts (type, title, category, guest_name, contact_phone) values ('market', 'نفس الرقم', 'أجهزة', 'مستعجل', '07701000001')$q$, 'blocked by phone from another IP');
insert into posts (type, title, category, guest_name, contact_phone) values ('market', 'شخص ثاني', 'أجهزة', 'غريب', '07701000009');
reset role;
do $$ begin
  if (select client_ip from posts where id = public.t_id('دين ١')) <> '5.6.7.8' then raise exception 'IP not recorded'; end if;
  if (select fee_due from posts where id = public.t_id('دين ١')) <> 0 then raise exception 'first ad not free'; end if;
  if (select sum(fee_due) from posts where title in ('دين ٢', 'دين ٣', 'دين ٤')) <> 3000 then raise exception 'debt not 3 x 1000'; end if;
  if (select fee_due from posts where id = public.t_id('شخص ثاني')) <> 0 then raise exception 'other person charged'; end if;
end $$;
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select pg_temp.expect_error($q$select * from public.admin_debts()$q$, 'user lists debts');
select pg_temp.expect_error($q$select public.settle_debt(public.t_id('دين ٢'))$q$, 'user settles debt');
select pg_temp.expect_error($q$select public.ad_debt(null, '07701000001', null)$q$, 'user reads debt of a phone');
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
do $$ begin
  if not exists (select 1 from public.admin_debts() where '5.6.7.8' = any(ips) and total = 3000 and ads = 3 and blocked and '07701000003' = any(phones)) then raise exception 'debtor row wrong'; end if;
  if (select public.settle_debt(public.t_id('دين ٢'))) <> 3000 then raise exception 'settle amount'; end if;
  if exists (select 1 from public.admin_debts() where '5.6.7.8' = any(ips)) then raise exception 'debt not cleared'; end if;
end $$;
select set_config('request.headers', '{"cf-connecting-ip":"5.6.7.8"}', false);
select pg_temp.as_user(null);
insert into posts (type, title, category, guest_name, contact_phone) values ('market', 'بعد التسديد', 'أجهزة', 'مستعجل', '07701000001');
reset role;
do $$ begin if (select fee_due from posts where id = public.t_id('بعد التسديد')) <> 1000 then raise exception 'after paying, next ad should cost 1000'; end if; end $$;
select set_config('request.headers', '', false);
-- الشعار: صاحب المحل المعتمد فقط، ومن مجلده فقط
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select pg_temp.expect_error($q$select public.set_business_logo(public.t_id('مطعم أبو علي'), 'u/22222222-2222-2222-2222-222222222222/0123456789abcdef0123456789abcdef.webp')$q$, 'logo on someone else''s business');
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select pg_temp.expect_error($q$select public.set_business_logo(public.t_id('مطعم أبو علي'), 'u/22222222-2222-2222-2222-222222222222/0123456789abcdef0123456789abcdef.webp')$q$, 'logo from another user''s folder');
select public.set_business_logo(public.t_id('مطعم أبو علي'), 'u/11111111-1111-1111-1111-111111111111/0123456789abcdef0123456789abcdef.webp');
reset role;
do $$ begin
  if (select logo from posts where id = public.t_id('مطعم أبو علي')) is null then raise exception 'owner logo not set'; end if;
end $$;

-- شعار عند التسجيل: يُقبل من مجلد صاحب الحساب فقط
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
insert into posts (type, title, category, contact_phone, details, logo) values ('business', 'محل بشعار', 'مطاعم', '07706666666', '{"address":"شارع"}', 'u/11111111-1111-1111-1111-111111111111/0123456789abcdef0123456789abcdef.webp');
insert into posts (type, title, category, contact_phone, details, logo) values ('business', 'محل بشعار غريب', 'مطاعم', '07706666667', '{"address":"شارع"}', 'u/22222222-2222-2222-2222-222222222222/0123456789abcdef0123456789abcdef.webp');
reset role;
do $$ begin
  if (select logo from posts where id = public.t_id('محل بشعار')) is null then raise exception 'own logo dropped at registration'; end if;
  if (select logo from posts where id = public.t_id('محل بشعار غريب')) is not null then raise exception 'foreign logo accepted'; end if;
end $$;
reset role;
-- ===== الإدارة تضيف صنفاً بصورة، وصاحب المحل يعدّل سعره ويغيّر صورته =====
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
insert into menu_items (business_id, section, name, price, image) values (public.t_id('مطعم أبو علي'), 'مقبلات', 'حمص', 2000,
  'u/33333333-3333-3333-3333-333333333333/0123456789abcdef0123456789abcdef.webp');
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
update menu_items set price = 2500 where name = 'حمص';
select pg_temp.expect_error($q$update menu_items set image = 'u/22222222-2222-2222-2222-222222222222/0123456789abcdef0123456789abcdef.webp' where name = 'حمص'$q$, 'owner sets image from other folder');
update menu_items set image = 'u/11111111-1111-1111-1111-111111111111/fedcba9876543210fedcba9876543210.webp' where name = 'حمص';
reset role;
do $$ begin
  if (select price from menu_items where name = 'حمص') <> 2500 then raise exception 'owner could not edit admin-added item'; end if;
  if (select image from menu_items where name = 'حمص') !~ '^u/1111' then raise exception 'owner could not replace image'; end if;
  if (select approved from menu_items where name = 'حمص') then raise exception 'changed image should wait for approval'; end if;
end $$;
-- منتج جديد من صاحب محل منشور ينتظر الموافقة، والزائر ما يشوفه؛ تغيير السعر ما يحتاج موافقة
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
select public.moderate_post(public.t_id('مطعم أبو علي'), 'approve');
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
insert into menu_items (business_id, section, name, price) values (public.t_id('مطعم أبو علي'), 'مقبلات', 'فلافل', 1000);
select pg_temp.as_user(null);
do $$ begin
  if exists (select 1 from menu_items where name in ('فلافل', 'حمص')) then raise exception 'pending products visible to visitors'; end if;
end $$;
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
update menu_items set approved = true where name = 'فلافل'; -- محاولة اعتماد ذاتي: الحارس يتجاهلها
reset role;
do $$ begin if (select approved from menu_items where name = 'فلافل') then raise exception 'owner approved own product'; end if; end $$;
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
update menu_items set approved = true where name in ('فلافل', 'حمص');
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
update menu_items set price = 1250 where name = 'فلافل';
select pg_temp.as_user(null);
do $$ begin
  if (select count(*) from menu_items where name in ('فلافل', 'حمص')) <> 2 then raise exception 'approved products not visible'; end if;
  if (select price from menu_items where name = 'فلافل') <> 1250 then raise exception 'price change hid the product'; end if;
end $$;
reset role;

-- ===== نسبة الطلبات: الزائر يسجّل الطلب، صاحب المحل يرى كشفه فقط، والمدير يؤكد الدفع =====
select pg_temp.as_user(null);
select public.log_order(public.t_id('مطعم أبو علي'), 20000, 2);
select public.log_order(public.t_id('مطعم أبو علي'), 20000, 2); -- تكرار خلال دقيقة: يُتجاهل
select public.log_order(public.t_id('مطعم أبو علي'), 10000, 1);
select pg_temp.expect_error($q$select public.log_order(public.t_id('وظيفة من زائر'), 5000, 1)$q$, 'order for non-business');
select pg_temp.expect_error($q$select public.log_order(public.t_id('مطعم أبو علي'), -5, 1)$q$, 'negative order');
do $$ begin if exists (select 1 from orders) then raise exception 'anon reads orders'; end if; end $$;
insert into orders (business_id, total, items) select public.t_id('مطعم أبو علي'), 1, 1 where false; -- (لا إدراج مباشر: انظر الاختبار التالي)
select pg_temp.expect_error($q$insert into orders (business_id, total, items) values (public.t_id('مطعم أبو علي'), 999999, 1)$q$, 'anon inserts order directly');
select pg_temp.expect_error($q$select * from public.commission_report()$q$, 'anon reads commission report');
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
do $$ begin if exists (select 1 from public.commission_report()) then raise exception 'other user sees commission report'; end if; end $$;
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
do $$ declare r record; begin
  select * into r from public.commission_report();
  if r.orders <> 2 or r.total <> 30000 or r.commission <> 1500 or r.paid then raise exception 'owner report wrong: %', row_to_json(r); end if;
end $$;
select pg_temp.expect_error($q$select public.mark_commission_paid(public.t_id('مطعم أبو علي'), current_date)$q$, 'owner marks commission paid');
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
select public.mark_commission_paid(public.t_id('مطعم أبو علي'), (now() at time zone 'Asia/Baghdad')::date);
do $$ begin
  if not (select paid from public.commission_report() where business_id = public.t_id('مطعم أبو علي')) then raise exception 'commission not marked paid'; end if;
end $$;
reset role;

-- ===== الطلب من داخل الموقع =====
select pg_temp.as_user(null);
do $$ declare t uuid; r record; begin
  t := public.place_order(public.t_id('مطعم أبو علي'), '[{"name":"حمص","q":2},{"name":"حمص","q":1}]', '07701234567', 'زبون', 'قرب جامع الرحمن', 33.4, 44.3, 'بدون بصل');
  select * into r from public.order_status(t);
  if r.status <> 'new' or r.total <> 2500 * 3 then raise exception 'order total/status wrong: %', row_to_json(r); end if;
  perform set_config('test.token', t::text, false);
end $$;
select pg_temp.expect_error($q$select public.place_order(public.t_id('مطعم أبو علي'), '[{"name":"تكة","q":1}]', '07701234567', null, 'قرب الجامع')$q$, 'unavailable item');
select pg_temp.expect_error($q$select public.place_order(public.t_id('مطعم أبو علي'), '[{"name":"غير موجود","q":1}]', '07701234567', null, 'قرب الجامع')$q$, 'unknown item');
select pg_temp.expect_error($q$select public.place_order(public.t_id('مطعم أبو علي'), '[{"name":"حمص","q":1}]', '123', null, 'قرب الجامع')$q$, 'bad phone');
select pg_temp.expect_error($q$select public.place_order(public.t_id('مطعم أبو علي'), '[{"name":"حمص","q":1}]', '07701234567', null, '')$q$, 'no landmark');
select pg_temp.expect_error($q$select public.place_order(public.t_id('وظيفة من زائر'), '[{"name":"حمص","q":1}]', '07701234567', null, 'قرب الجامع')$q$, 'order to non-restaurant');
select pg_temp.expect_error($q$select * from public.kitchen_orders()$q$, 'anon reads kitchen orders');
do $$ begin if exists (select 1 from orders) then raise exception 'anon reads orders table'; end if; end $$;
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
do $$ begin if exists (select 1 from public.kitchen_orders()) then raise exception 'other user sees kitchen orders'; end if; end $$;
select pg_temp.expect_error($q$select public.decide_order((select max(id) from public.commission_report() limit 0), 'accepted')$q$, 'other user decides');
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
do $$ declare r record; begin
  select * into r from public.kitchen_orders() where status = 'new';
  if r.customer_phone <> '07701234567' or r.landmark <> 'قرب جامع الرحمن' or r.lat is null then raise exception 'kitchen order wrong: %', row_to_json(r); end if;
  perform public.decide_order(r.id, 'accepted', null, 30);
  perform set_config('test.order', r.id::text, false);
end $$;
select pg_temp.expect_error($q$select public.decide_order(current_setting('test.order')::bigint, 'accepted')$q$, 'accept twice');
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select pg_temp.expect_error($q$select public.decide_order(current_setting('test.order')::bigint, 'done')$q$, 'other user completes order');
select pg_temp.as_user(null);
do $$ declare r record; begin
  select * into r from public.order_status(current_setting('test.token')::uuid);
  if r.status <> 'accepted' or r.eta <> 30 then raise exception 'customer status wrong: %', row_to_json(r); end if;
end $$;
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select public.decide_order(current_setting('test.order')::bigint, 'done');
do $$ begin
  if (select orders from public.commission_report() where business_id = public.t_id('مطعم أبو علي')) <> 3 then raise exception 'accepted order not in commission'; end if;
end $$;
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
select public.assign_owner(public.t_id('مطعم أبو علي'), 'other@x.iq');
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select pg_temp.expect_error($q$select public.assign_owner(public.t_id('مطعم أبو علي'), 'owner@x.iq')$q$, 'owner assigns owner');
reset role;
do $$ begin if (select owner_id from posts where id = public.t_id('مطعم أبو علي')) <> '22222222-2222-2222-2222-222222222222' then raise exception 'assign_owner failed'; end if; end $$;

-- ===== صاحب المحل يعدّل معلوماته وصوره بدون مراجعة، وغيره ما يكدر =====
select pg_temp.as_user('22222222-2222-2222-2222-222222222222'); -- المالك الحالي بعد assign_owner
select public.update_business_info(public.t_id('مطعم أبو علي'), 'وصف جديد', '{"hours":"من ١٠ الصبح","evil":"x","address":"شارع ٢٠"}', array['u/22222222-2222-2222-2222-222222222222/0123456789abcdef0123456789abcdef.webp'], true);
select pg_temp.expect_error($q$select public.update_business_info(public.t_id('مطعم أبو علي'), 'x', '{}', array['u/11111111-1111-1111-1111-111111111111/0123456789abcdef0123456789abcdef.webp'], true)$q$, 'owner uses another user image');
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select pg_temp.expect_error($q$select public.update_business_info(public.t_id('مطعم أبو علي'), 'سرقة', '{}', '{}', true)$q$, 'non-owner edits business');
reset role;
do $$ declare b posts; begin
  select * into b from posts where id = public.t_id('مطعم أبو علي');
  if b.status <> 'published' or b.body <> 'وصف جديد' or b.details->>'hours' <> 'من ١٠ الصبح' or b.details ? 'evil' or cardinality(b.images) <> 1 then raise exception 'owner edit wrong: %', row_to_json(b); end if;
end $$;

-- ===== رابط خاص لصاحب المحل =====
insert into auth.users (id, email, raw_user_meta_data) values ('44444444-4444-4444-4444-444444444444', 'hamad@x.iq', '{"name":"حمد","phone":"07704444444"}');
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select pg_temp.expect_error($q$select public.create_invite(public.t_id('مطعم أبو علي'))$q$, 'non-admin creates invite');
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
do $$ declare c text; c2 text; begin
  c := public.create_invite(public.t_id('مطعم أبو علي'));
  c2 := public.create_invite(public.t_id('مطعم أبو علي'));
  if c <> c2 or length(c) < 12 then raise exception 'invite code not reused or too short'; end if;
  perform set_config('test.invite', c, false);
end $$;
select pg_temp.as_user(null);
do $$ begin if (select title from public.invite_info(current_setting('test.invite'))) <> 'مطعم أبو علي' then raise exception 'invite info wrong'; end if; end $$;
do $$ begin if exists (select 1 from shop_invites) then raise exception 'anon reads invites'; end if; end $$;
select pg_temp.expect_error($q$select * from public.accept_invite(current_setting('test.invite'))$q$, 'anon accepts invite');
select pg_temp.as_user('44444444-4444-4444-4444-444444444444');
select * from public.accept_invite(current_setting('test.invite'));
select pg_temp.expect_error($q$select * from public.accept_invite(current_setting('test.invite'))$q$, 'invite used twice');
reset role;
do $$ begin
  if (select owner_id from posts where id = public.t_id('مطعم أبو علي')) <> '44444444-4444-4444-4444-444444444444' then raise exception 'invite did not set owner'; end if;
  if exists (select 1 from public.invite_info(current_setting('test.invite'))) then raise exception 'used invite still valid'; end if;
end $$;
-- نرجع المالك السابق حتى تكمل الاختبارات اللي بعدها
update posts set owner_id = '22222222-2222-2222-2222-222222222222' where id = public.t_id('مطعم أبو علي');

-- ===== النشر الفوري: المفتاح سري، وفشل طلب التحديث لا يمنع الموافقة =====
reset role;
insert into private.secrets (name, value) values ('github_token', 'test-token') on conflict (name) do update set value = excluded.value;
select pg_temp.as_user(null);
select pg_temp.expect_error($q$select value from private.secrets$q$, 'anon reads github token');
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select pg_temp.expect_error($q$select value from private.secrets$q$, 'user reads github token');
select pg_temp.expect_error($q$select private.request_rebuild()$q$, 'user calls rebuild directly');
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
select public.moderate_post(public.t_id('مطعم أبو علي'), 'hide', 'اختبار');
do $$ begin if (select status from posts where id = public.t_id('مطعم أبو علي')) <> 'hidden' then raise exception 'moderation blocked by rebuild trigger'; end if; end $$;
reset role;

-- ===== دلفري حر: الزائر يسجّل، الهوية والعنوان للإدارة فقط =====
select pg_temp.as_user(null);
insert into storage.objects (bucket_id, name) values ('proofs', 'rider/0123456789abcdef0123456789abcdef.webp'), ('proofs', 'rider/fedcba9876543210fedcba9876543210.webp');
select pg_temp.expect_error($q$insert into storage.objects (bucket_id, name) values ('proofs', 'u/x/0123456789abcdef0123456789abcdef.webp')$q$, 'anon uploads outside rider/');
do $$ begin if exists (select 1 from storage.objects where bucket_id = 'proofs') then raise exception 'anon reads ID photos'; end if; end $$;
insert into riders (name, phone, vehicle, areas, address, id_front, id_back)
  values ('حسين الدراج', '07712345678', 'دراجة نارية', 'المعامل والحسينية', 'المعامل، محلة ٧٠٣، قرب الجامع',
          'rider/0123456789abcdef0123456789abcdef.webp', 'rider/fedcba9876543210fedcba9876543210.webp');
select pg_temp.expect_error($q$insert into riders (name, phone, vehicle, areas, address, id_front, id_back, status) values ('غشاش', '07712340000', 'ستوتة', 'المعامل', 'عنوان طويل', 'rider/0123456789abcdef0123456789abcdef.webp', 'rider/0123456789abcdef0123456789abcdef.webp', 'approved')$q$, 'anon self-approves rider');
select pg_temp.expect_error($q$insert into riders (name, phone, vehicle, areas, address, id_front, id_back) values ('مكرر', '07712345678', 'ستوتة', 'المعامل', 'عنوان طويل', 'rider/0123456789abcdef0123456789abcdef.webp', 'rider/0123456789abcdef0123456789abcdef.webp')$q$, 'same phone twice');
select pg_temp.expect_error($q$insert into riders (name, phone, vehicle, areas, address, id_front, id_back) values ('صورة عامة', '07712349999', 'ستوتة', 'المعامل', 'عنوان طويل', 'guest/0123456789abcdef0123456789abcdef.webp', 'rider/0123456789abcdef0123456789abcdef.webp')$q$, 'ID path outside rider/');
do $$ begin
  if exists (select 1 from riders) then raise exception 'anon reads riders table'; end if;
  if exists (select 1 from public_riders) then raise exception 'pending rider is public'; end if;
end $$;
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
update riders set status = 'approved';
do $$ begin
  if exists (select 1 from riders) then raise exception 'user reads riders table'; end if;
  if exists (select 1 from public_riders) then raise exception 'user approved a rider'; end if;
  if exists (select 1 from storage.objects where bucket_id = 'proofs') then raise exception 'user reads ID photos'; end if;
end $$;
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
do $$ begin if (select count(*) from riders) <> 1 or (select count(*) from storage.objects where name like 'rider/%') <> 2 then raise exception 'admin cannot see rider and IDs'; end if; end $$;
update riders set status = 'approved', decided_at = now();
select pg_temp.as_user(null);
do $$ begin
  if (select name from public_riders) <> 'حسين الدراج' then raise exception 'approved rider not public'; end if;
  if exists (select 1 from information_schema.columns where table_name = 'public_riders' and column_name in ('address', 'id_front', 'id_back', 'status')) then raise exception 'private rider columns in public view'; end if;
end $$;
select pg_temp.expect_error($q$select address from public_riders$q$, 'anon reads rider address');
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
delete from storage.objects where name like 'rider/%';
delete from riders;
-- التسعيرة: الكل يقرأ، والإدارة بس تعدّل
select pg_temp.as_user(null);
do $$ begin if (select count(*) from delivery_fares) < 4 then raise exception 'default fares missing for public'; end if; end $$;
select pg_temp.expect_error($q$select public.set_delivery_fares('[]'::jsonb)$q$, 'anon sets fares');
delete from delivery_fares where true;
do $$ begin if (select count(*) from delivery_fares) < 4 then raise exception 'anon deleted fares'; end if; end $$;
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select pg_temp.expect_error($q$select public.set_delivery_fares('[]'::jsonb)$q$, 'user sets fares');
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
select public.set_delivery_fares('[{"kind":"zone","label":"داخل المحلة","price":1250},{"kind":"extra","label":"بالليل","price":""}]'::jsonb);
reset role;
do $$ begin if (select count(*) from delivery_fares) <> 2 or (select price from delivery_fares where label = 'داخل المحلة') <> 1250
  or (select price from delivery_fares where label = 'بالليل') is not null then raise exception 'admin fares not saved'; end if; end $$;
reset role;
do $$ begin if exists (select 1 from riders) or exists (select 1 from storage.objects where name like 'rider/%') then raise exception 'admin cannot delete rider and IDs'; end if; end $$;

-- ===== الدخول بخطوتين والمشرفين =====
reset role;
insert into auth.users (id, email, raw_user_meta_data) values ('55555555-5555-5555-5555-555555555555', 'mod@x.iq', '{"name":"مشرف","phone":"07705555550"}');
insert into posts (type, title, category, guest_name, contact_phone) values ('market', 'إعلان للمشرف', 'أجهزة', 'زائر', '07705555551');
-- المدير بكلمة السر بس (aal1): ما عنده أي صلاحية
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
select set_config('request.jwt.claims', '{"aal":"aal1"}', false);
do $$ begin if public.is_admin() or public.is_staff() then raise exception 'admin without second step'; end if; end $$;
select pg_temp.expect_error($q$select * from public.admin_debts()$q$, 'aal1 admin lists debts');
select pg_temp.expect_error($q$select public.moderate_post(public.t_id('إعلان للمشرف'), 'approve')$q$, 'aal1 admin moderates');
do $$ begin if exists (select 1 from posts where status = 'pending' and author_id is null) then raise exception 'aal1 admin reads pending posts'; end if; end $$;
-- المدير بالخطوتين يضيف مشرف
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
select public.set_staff_role('mod@x.iq', 'moderator');
select pg_temp.expect_error($q$select public.set_staff_role('admin@x.iq', 'owner')$q$, 'demote the admin');
select pg_temp.expect_error($q$select public.set_staff_role('mod@x.iq', 'admin')$q$, 'make admin from the browser');
do $$ begin if not exists (select 1 from public.staff_list() where email = 'mod@x.iq' and role = 'moderator') then raise exception 'staff list'; end if; end $$;
-- المشرف: يراجع وينشر، بس ما يشوف الهويات ولا الديون ولا يضيف مشرفين
select pg_temp.as_user('55555555-5555-5555-5555-555555555555');
select public.moderate_post(public.t_id('إعلان للمشرف'), 'approve');
select pg_temp.expect_error($q$select * from public.admin_debts()$q$, 'moderator lists debts');
select pg_temp.expect_error($q$select public.settle_debt(public.t_id('إعلان للمشرف'))$q$, 'moderator settles debt');
select pg_temp.expect_error($q$select public.set_staff_role('owner@x.iq', 'moderator')$q$, 'moderator adds moderators');
select pg_temp.expect_error($q$select public.set_delivery_fares('[]'::jsonb)$q$, 'moderator sets fares');
do $$ begin
  if exists (select 1 from riders) then raise exception 'moderator reads riders'; end if;
  if exists (select 1 from storage.objects where bucket_id = 'proofs') then raise exception 'moderator reads proofs'; end if;
end $$;
-- المشرف بدون الخطوة الثانية: ولا شي
select set_config('request.jwt.claims', '{"aal":"aal1"}', false);
select pg_temp.expect_error($q$select public.moderate_post(public.t_id('إعلان للمشرف'), 'hide', 'اختبار')$q$, 'aal1 moderator moderates');
reset role;
do $$ begin if (select status from posts where id = public.t_id('إعلان للمشرف')) <> 'published' then raise exception 'moderator approve failed'; end if; end $$;

-- ===== الشكاوى والتقييم والمشاهدات و«إعلاناتي» =====
reset role;
select set_config('request.headers', '{"cf-connecting-ip":"7.7.7.7"}', false);
select pg_temp.as_user(null);
-- الزائر ينشر ويحتفظ برمز سري (البصمة بس تنحفظ)
insert into posts (type, title, category, guest_name, contact_phone, edit_hash)
  values ('market', 'إعلان برمز', 'أجهزة', 'زائر', '07707777777', encode(sha256(convert_to('0123456789abcdef0123456789abcdef', 'UTF8')), 'hex'));
do $$ begin
  if (select title from public.guest_posts(array['0123456789abcdef0123456789abcdef'])) <> 'إعلان برمز' then raise exception 'guest_posts by token'; end if;
  if exists (select 1 from public.guest_posts(array['ffffffffffffffffffffffffffffffff'])) then raise exception 'wrong token sees post'; end if;
end $$;
select pg_temp.expect_error($q$select public.guest_remove_post('ffffffffffffffffffffffffffffffff')$q$, 'remove with wrong token');
select pg_temp.expect_error($q$select public.guest_renew_post('0123456789abcdef0123456789abcdef')$q$, 'renew unpublished');
-- المشرف ينشره، والمدة قربت تخلص → الزائر يجدده (ويتسجل 1,000)
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
select public.moderate_post((select id from posts where title = 'إعلان برمز'), 'approve');
reset role;
update posts set expires_at = now() + interval '1 day', fee_due = 0 where title = 'إعلان برمز';
select pg_temp.as_user(null);
select public.guest_renew_post('0123456789abcdef0123456789abcdef');
reset role;
do $$ begin
  if (select expires_at from posts where title = 'إعلان برمز') < now() + interval '29 days' then raise exception 'renew did not extend'; end if;
  if (select fee_due from posts where title = 'إعلان برمز') <> 1000 then raise exception 'renew not charged'; end if;
end $$;
select pg_temp.as_user(null);
select pg_temp.expect_error($q$select public.guest_renew_post('0123456789abcdef0123456789abcdef')$q$, 'renew twice in a row');
-- مشاهدات: الزائر يزيد العداد بس، وما يقرأ الأرقام
select public.hit((select id from public_posts where title = 'إعلان برمز'));
select public.hit((select id from public_posts where title = 'إعلان برمز'));
select public.hit(999999999);
do $$ begin if exists (select 1 from post_views) then raise exception 'anon reads views'; end if; end $$;
select pg_temp.expect_error($q$select * from public.views_30d()$q$, 'anon reads all views');
-- شكوى وتقييم
select public.submit_complaint('post', (select id from public_posts where title = 'إعلان برمز'), 'scam', 'طلب فلوس قبل التسليم', '07701112233');
select pg_temp.expect_error($q$select public.submit_complaint('post', 999999999, 'scam')$q$, 'complaint on missing post');
select pg_temp.expect_error($q$select public.submit_complaint('post', 1, 'bad reason')$q$, 'complaint bad reason');
do $$ begin if exists (select 1 from complaints) then raise exception 'anon reads complaints'; end if; end $$;
select pg_temp.expect_error($q$select public.rate('post', (select id from public_posts where title = 'إعلان برمز'), 5)$q$, 'rate a non-business ad');
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
insert into posts (type, title, category, contact_phone) values ('business', 'محل للتقييم', 'مطاعم', '07707777778');
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
select public.moderate_post(public.t_id('محل للتقييم'), 'approve');
select pg_temp.as_user(null);
select public.rate('post', public.t_id('محل للتقييم'), 5, 'أكل طيب', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
select public.rate('post', public.t_id('محل للتقييم'), 4, 'أكل طيب', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'); -- نفس الجهاز يعدّل تقييمه
select public.rate('post', public.t_id('محل للتقييم'), 2, null, 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
select public.rate('post', public.t_id('محل للتقييم'), 1, null, 'cccccccccccccccccccccccccccccccc');
select pg_temp.expect_error($q$select public.rate('post', public.t_id('محل للتقييم'), 1, null, 'dddddddddddddddddddddddddddddddd')$q$, 'one network floods ratings');
select pg_temp.expect_error($q$select public.rate('post', public.t_id('محل للتقييم'), 9)$q$, 'stars out of range');
do $$ begin
  if (select n from rating_summary where target_id = public.t_id('محل للتقييم')) <> 3 then raise exception 'rating count'; end if;
  if (select avg from rating_summary where target_id = public.t_id('محل للتقييم')) <> 2.3 then raise exception 'rating avg'; end if;
  if exists (select 1 from public_reviews) then raise exception 'unapproved comment public'; end if;
  if exists (select 1 from ratings) then raise exception 'anon reads raw ratings'; end if;
end $$;
-- صاحب المحل يشوف مشاهداته، وغيره لا
select public.hit(public.t_id('محل للتقييم'));
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
do $$ begin if (select sum(n) from public.post_stats(public.t_id('محل للتقييم'))) <> 1 then raise exception 'owner views'; end if; end $$;
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select pg_temp.expect_error($q$select * from public.post_stats(public.t_id('محل للتقييم'))$q$, 'stranger reads views');
-- المشرف: يشوف الشكاوى ويوافق على التعليق
select pg_temp.as_user('55555555-5555-5555-5555-555555555555');
do $$ begin
  if (select count(*) from complaints where reason = 'scam' and client_ip = '7.7.7.7') <> 1 then raise exception 'staff complaints'; end if;
  if not exists (select 1 from public.views_30d()) then raise exception 'staff views'; end if;
  if (select count(*) from public.expiring_posts()) <> 0 then raise exception 'expiring list'; end if;
end $$;
update ratings set approved = true where comment = 'أكل طيب';
update complaints set status = 'closed';
select pg_temp.as_user(null);
do $$ begin if (select comment from public_reviews) <> 'أكل طيب' then raise exception 'approved review not public'; end if; end $$;
select public.guest_remove_post('0123456789abcdef0123456789abcdef');
reset role;
do $$ begin if (select status from posts where title = 'إعلان برمز') <> 'removed' then raise exception 'guest remove'; end if; end $$;
select set_config('request.headers', '', false);

-- ===== التنبيهات والصيانة =====
reset role;
insert into private.secrets (name, value) values ('telegram_token', 'test:token'), ('telegram_chat', '1')
  on conflict (name) do update set value = excluded.value;
-- حتى لو فشل الإرسال (ما كو pg_net هنا) الإعلان والشكوى يتسجلون عادي
select pg_temp.as_user(null);
insert into posts (type, title, category, guest_name, contact_phone) values ('market', 'إعلان مع تنبيه', 'أجهزة', 'زائر', '07706666666');
select pg_temp.expect_error($q$select public.telegram_test()$q$, 'anon tests telegram');
select pg_temp.expect_error($q$select public.maintenance()$q$, 'anon runs maintenance');
select pg_temp.expect_error($q$select private.telegram('x')$q$, 'anon sends telegram');
select pg_temp.as_user('55555555-5555-5555-5555-555555555555');
select pg_temp.expect_error($q$select public.telegram_test()$q$, 'moderator tests telegram');
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
do $$ begin if not public.telegram_test() then raise exception 'telegram_test'; end if; end $$;
select pg_temp.expect_error($q$select public.maintenance()$q$, 'admin browser runs maintenance');
reset role;
update posts set created_at = now() - interval '200 days', client_ip = '1.2.3.4' where title = 'إعلان مع تنبيه';
do $$ begin
  perform public.maintenance();
  if (select client_ip from posts where title = 'إعلان مع تنبيه') is not null then raise exception 'old IP kept'; end if;
end $$;

-- ===== البوت: أزرار تيليغرام (مفتاح الخدمة فقط) =====
select pg_temp.as_user(null);
select pg_temp.expect_error($q$select public.bot_action('p', 1, 'approve')$q$, 'anon bot action');
select pg_temp.expect_error($q$select public.bot_config()$q$, 'anon reads bot token');
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
select pg_temp.expect_error($q$select public.bot_action('p', 1, 'approve')$q$, 'admin browser calls bot action');
select pg_temp.expect_error($q$select public.bot_pending()$q$, 'admin browser lists bot pending');
-- محتوى ينتظر: إعلان، دلفري، شكوى، منتجات
select set_config('request.headers', '{"cf-connecting-ip":"8.8.4.4"}', false);
select pg_temp.as_user(null);
insert into posts (type, title, category, guest_name, contact_phone) values ('market', 'إعلان للبوت', 'أجهزة', 'زائر', '07708080808');
insert into posts (type, title, category, guest_name, contact_phone) values ('market', 'إعلان مرفوض بالبوت', 'أجهزة', 'زائر', '07708080809');
insert into riders (name, phone, vehicle, areas, address, id_front, id_back) values ('دلفري البوت', '07708080810', 'ستوتة', 'المعامل', 'عنوان كامل هنا',
  'rider/11111111111111111111111111111111.webp', 'rider/22222222222222222222222222222222.webp');
select set_config('request.headers', '', false);
reset role;
set role service_role;
select set_config('request.jwt.claim.sub', '', false);
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
do $$ declare c jsonb; begin
  c := public.bot_pending();
  if not exists (select 1 from jsonb_array_elements(c) e where e->>'text' like '%إعلان للبوت%' and e->'kb'->0->0->>'callback_data' like 'p:%:approve') then raise exception 'pending ad card'; end if;
  if not exists (select 1 from jsonb_array_elements(c) e where e->>'text' like '%دلفري البوت%عنوان كامل هنا%') then raise exception 'pending rider card'; end if;
  if (public.bot_config()->>'chat') <> '1' then raise exception 'bot config'; end if;
end $$;
select public.bot_action('p', (select id from posts where title = 'إعلان للبوت'), 'approve');
select public.bot_action('p', (select id from posts where title = 'إعلان مرفوض بالبوت'), 'dup');
select public.bot_action('r', (select id from riders where name = 'دلفري البوت'), 'approve');
select pg_temp.expect_error($q$select public.bot_action('p', (select id from posts where title = 'إعلان للبوت'), 'approve')$q$, 'approve twice');
select pg_temp.expect_error($q$select public.bot_action('x', 1, 'boom')$q$, 'unknown bot command');
reset role;
do $$ begin
  if (select status from posts where title = 'إعلان للبوت') <> 'published' then raise exception 'bot approve'; end if;
  if (select approved_by from posts where title = 'إعلان للبوت') <> '33333333-3333-3333-3333-333333333333' then raise exception 'bot acts as the admin'; end if;
  if (select status_reason from posts where title = 'إعلان مرفوض بالبوت') <> 'الإعلان مكرر.' then raise exception 'bot reject reason'; end if;
  if (select status from riders where name = 'دلفري البوت') <> 'approved' then raise exception 'bot rider'; end if;
  if current_setting('request.jwt.claims', true) like '%aal2%' then raise exception 'bot admin claims leaked out of the transaction'; end if;
end $$;

-- ===== دليل المهندسين: المهندس يسجّل، والإدارة توافق =====
select set_config('request.headers', '{"cf-connecting-ip":"9.8.7.6"}', false);
select pg_temp.as_user(null);
insert into engineers (name, specialty, services, location, phone, about) values ('م. علي', 'مهندس مدني', array['تصميم مخططات المنازل', ' ', 'إشراف'], 'بغداد', '07901234567', 'خبرة ١٠ سنوات');
insert into engineers (name, specialty, services, location, phone, status) values ('غشاش', 'مهندس مدني', array['شي'], 'بغداد', '07901234568', 'approved');
select pg_temp.expect_error($q$insert into engineers (name, specialty, services, location, phone) values ('مكرر', 'مهندس مدني', array['شي'], 'بغداد', '07901234567')$q$, 'same engineer phone twice');
select pg_temp.expect_error($q$insert into engineers (name, specialty, services, location, phone) values ('بدون خدمات', 'مهندس مدني', array[' '], 'بغداد', '07901234569')$q$, 'engineer without services');
insert into engineers (name, specialty, services, location, phone) values ('ثالث', 'مهندس كهربائي', array['تأسيس'], 'بغداد', '07901234570');
select pg_temp.expect_error($q$insert into engineers (name, specialty, services, location, phone) values ('رابع', 'مهندس كهربائي', array['تأسيس'], 'بغداد', '07901234571')$q$, 'engineer signup flood from one network');
do $$ begin
  if exists (select 1 from engineers) then raise exception 'anon reads engineers table'; end if;
  if exists (select 1 from public_engineers) then raise exception 'pending engineer is public (or self-approved)'; end if;
end $$;
select set_config('request.headers', '', false);
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
update engineers set status = 'approved';
do $$ begin if exists (select 1 from public_engineers) then raise exception 'user approved an engineer'; end if; end $$;
reset role;
do $$ begin
  if (select services from engineers where name = 'م. علي') <> array['تصميم مخططات المنازل', 'إشراف'] then raise exception 'services cleaned'; end if;
  if (select client_ip from engineers where name = 'م. علي') <> '9.8.7.6' then raise exception 'engineer IP'; end if;
end $$;
set role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
do $$ begin if not exists (select 1 from jsonb_array_elements(public.bot_pending()) e where e->>'text' like '%م. علي%07901234567%') then raise exception 'engineer card'; end if; end $$;
select public.bot_action('e', (select id from engineers where name = 'م. علي'), 'approve');
select public.bot_action('e', (select id from engineers where name = 'غشاش'), 'delete');
reset role;
select pg_temp.as_user(null);
do $$ begin
  if (select name from public_engineers) <> 'م. علي' then raise exception 'approved engineer not public'; end if;
  if exists (select 1 from information_schema.columns where table_name = 'public_engineers' and column_name in ('client_ip', 'status')) then raise exception 'private engineer columns public'; end if;
end $$;
-- المشرف يكدر يخفي مهندس
select pg_temp.as_user('55555555-5555-5555-5555-555555555555');
update engineers set status = 'hidden' where name = 'م. علي';
reset role;
do $$ begin if (select status from engineers where name = 'م. علي') <> 'hidden' or exists (select 1 from engineers where name = 'غشاش') then raise exception 'staff hide / bot delete'; end if; end $$;

-- ===== المهندسين: التوثيق والتمييز للمدير بس =====
reset role;
update engineers set status = 'approved' where name = 'م. علي';
select pg_temp.as_user('55555555-5555-5555-5555-555555555555');
update engineers set verified = true, featured_until = now() + interval '30 days', about = 'تعديل المشرف' where name = 'م. علي';
reset role;
do $$ begin
  if (select verified from engineers where name = 'م. علي') or (select featured_until from engineers where name = 'م. علي') is not null then raise exception 'moderator verified/featured an engineer'; end if;
  if (select about from engineers where name = 'م. علي') <> 'تعديل المشرف' then raise exception 'moderator edit blocked'; end if;
end $$;
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
update engineers set verified = true, featured_until = now() + interval '30 days' where name = 'م. علي';
select pg_temp.as_user(null);
do $$ begin if not (select verified and featured from public_engineers where name = 'م. علي') then raise exception 'admin verify/feature not public'; end if; end $$;
reset role;
update engineers set featured_until = now() - interval '1 day' where name = 'م. علي';
select pg_temp.as_user(null);
do $$ begin if (select featured from public_engineers where name = 'م. علي') then raise exception 'expired feature still shown'; end if; end $$;
-- من البوت
reset role;
insert into engineers (name, specialty, services, location, phone) values ('مهندس البوت', 'مهندس مدني', array['إشراف'], 'بغداد', '07901239999');
set role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
select public.bot_action('e', (select id from engineers where name = 'مهندس البوت'), 'feature');
reset role;
do $$ begin if (select status from engineers where name = 'مهندس البوت') <> 'approved' or (select featured_until from engineers where name = 'مهندس البوت') < now() + interval '29 days' then raise exception 'bot feature'; end if; end $$;

select 'ALL RLS TESTS PASSED';
