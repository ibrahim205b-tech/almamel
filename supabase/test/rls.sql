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
-- ===== الرسوم والتمييز والشعار =====
reset role;
delete from posts where contact_phone = '07708888888';
select pg_temp.as_user(null);
insert into posts (type, title, category, guest_name, contact_phone, fee_due, featured_until) values ('job', 'أول إعلان مجاني', 'توصيل', 'زائر', '07708888888', 0, now() + interval '99 days');
insert into posts (type, title, category, guest_name, contact_phone, fee_due) values ('job', 'ثاني إعلان مدفوع', 'توصيل', 'زائر', '07708888888', 0);
reset role;
do $$ begin
  if (select fee_due from posts where id = public.t_id('أول إعلان مجاني')) <> 0 then raise exception 'first ad should be free'; end if;
  if (select fee_due from posts where id = public.t_id('ثاني إعلان مدفوع')) <> 3000 then raise exception 'second ad should cost 3000'; end if;
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

select 'ALL RLS TESTS PASSED';
