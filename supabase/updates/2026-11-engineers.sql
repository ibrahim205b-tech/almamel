-- تحديث: دليل المهندسين (المهندس يسجّل نفسه، والإدارة توافق وتوثّق وتميّز شهر) + الأخبار التلقائية. انسخ الملف كاملاً وشغّله في Supabase ← SQL Editor ← Run (آمن لو انعاد، وكل ملفات التحديث الأخيرة تكمّل بعضها بأي ترتيب).
do $$ begin
  if to_regclass('public.complaints') is null then raise exception 'شغّل ملف 2026-11-trust.sql أول، وبعدين هذا الملف'; end if;
end $$;
do $$ begin create extension if not exists pg_net; exception when others then raise notice 'pg_net غير متوفر'; end $$;
create schema if not exists private;
create table if not exists private.secrets (name text primary key, value text not null);
revoke all on schema private from public, anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;

-- ---------- دليل المهندسين: المهندس يسجّل نفسه، والإدارة توافق ----------
create table if not exists public.engineers (
  id          bigint generated always as identity primary key,
  name        text not null check (char_length(name) between 2 and 80),
  specialty   text not null check (char_length(specialty) between 2 and 60),
  services    text[] not null default '{}' check (cardinality(services) between 1 and 12),
  location    text not null check (char_length(location) between 2 and 80),
  phone       text not null check (phone ~ '^07[0-9]{9}$'),
  whatsapp    boolean not null default true,
  about       text check (char_length(about) <= 1500),
  status      text not null default 'pending' check (status in ('pending', 'approved', 'hidden')),
  client_ip   text,
  created_at  timestamptz not null default now(),
  decided_at  timestamptz
);
create unique index if not exists engineers_phone on public.engineers (phone);
alter table public.engineers enable row level security;

-- كل خدمة بين حرفين و١٢٠ حرف؛ ونفس الشبكة ما تسجّل أكثر من ٣ بالساعة
create or replace function public.engineers_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare s text;
begin
  new.status := 'pending'; new.decided_at := null; new.created_at := now();
  new.client_ip := public.request_ip();
  new.services := array(select left(trim(x), 120) from unnest(new.services) x where char_length(trim(x)) >= 2);
  if cardinality(new.services) = 0 then raise exception 'اكتب خدمة وحدة على الأقل'; end if;
  foreach s in array new.services loop if char_length(s) > 120 then raise exception 'الخدمة طويلة'; end if; end loop;
  if new.client_ip is not null and (select count(*) from engineers where client_ip = new.client_ip and created_at > now() - interval '1 hour') >= 3 then
    raise exception 'وصلتنا تسجيلات كثيرة من شبكتك. حاول بعد ساعة.'; end if;
  return new;
end $$;
drop trigger if exists engineers_before_insert on public.engineers;
create trigger engineers_before_insert before insert on public.engineers for each row execute function public.engineers_before_insert();

drop policy if exists engineers_insert on public.engineers;
create policy engineers_insert on public.engineers for insert to anon, authenticated with check (true);
drop policy if exists engineers_staff on public.engineers;
create policy engineers_staff on public.engineers for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- ---------- المهندسين: توثيق وتمييز (المدير فقط يختارهن) ----------
alter table public.engineers add column if not exists verified boolean not null default false;
alter table public.engineers add column if not exists featured_until timestamptz;
-- المشرف يكدر ينشر ويخفي، بس التوثيق والتمييز للمدير بس
create or replace function public.engineers_before_update() returns trigger
language plpgsql set search_path = public as $$
begin
  -- من الموقع (anon/authenticated): المدير بس. من SQL Editor أو مفتاح الخدمة: مسموح
  if current_user in ('anon', 'authenticated') and not public.is_admin() then new.verified := old.verified; new.featured_until := old.featured_until; end if;
  return new;
end $$;
drop trigger if exists engineers_before_update on public.engineers;
create trigger engineers_before_update before update on public.engineers for each row execute function public.engineers_before_update();
-- المميز يطلع أول (لحد ما يخلص الشهر)
create or replace view public.public_engineers with (security_barrier = true) as
  select id, name, specialty, services, location, phone, whatsapp, about, decided_at,
         verified, coalesce(featured_until > now(), false) as featured
  from public.engineers where status = 'approved';
grant select on public.public_engineers to anon, authenticated;


-- ---------- الأخبار التلقائية ----------
-- كل ٣ ساعات: Supabase يجيب أخبار من مصادر موثوقة (RSS)، يفلتر الي تخص المعامل والزوراء وبغداد وخدماتها،
-- ويدز كل خبر للمدير على تيليغرام بزر «انشره» أو «لا». ما ينشر شي بدون موافقة المدير.
create table if not exists public.news_items (
  id           bigint generated always as identity primary key,
  source       text not null,
  url          text not null unique,
  title        text not null,
  summary      text,
  published_at timestamptz,
  status       text not null default 'pending' check (status in ('pending', 'published', 'rejected')),
  post_id      bigint,
  created_at   timestamptz not null default now()
);
alter table public.news_items enable row level security;
drop policy if exists news_items_staff on public.news_items;
create policy news_items_staff on public.news_items for select to authenticated using (public.is_staff());

create table if not exists private.news_feeds (name text primary key, url text not null);
insert into private.news_feeds (name, url) values
  ('السومرية نيوز', 'https://www.alsumaria.tv/Rss/iraq-latest-news/ar'),
  ('محافظة بغداد', 'https://baghdad.gov.iq/feed/index.rss')
on conflict (name) do update set url = excluded.url;
create table if not exists private.news_requests (id bigint primary key, source text not null, created_at timestamptz not null default now());

create or replace function private.xml_text(p text) returns text language sql immutable as $$
  -- بعض المصادر ترمّز النص مرتين (&amp;quot;)، فنفك &amp; أول
  select trim(regexp_replace(regexp_replace(replace(replace(replace(replace(replace(replace(replace(replace(coalesce(p, ''), '<![CDATA[', ''), ']]>', ''),
    '&amp;', '&'), '&lt;', '<'), '&gt;', '>'), '&quot;', '"'), '&#39;', ''''), '&nbsp;', ' '), '<[^>]*>', ' ', 'g'), '\s+', ' ', 'g'))
$$;

-- يقرأ نص RSS ويضيف الأخبار المحلية الجديدة (آخر يومين) ويبلّغ المدير. يرجع عدد الأخبار الجديدة.
create or replace function private.news_ingest(p_source text, p_xml text) returns integer
language plpgsql security definer set search_path = public as $$
declare doc xml; it xml; t text; l text; d text; pd timestamptz; n int := 0; new_id bigint;
  -- يخص المنطقة أو خدمات بغداد اليومية
  -- اسم منطقتنا: يكفي يجي بالعنوان أو التفاصيل. خدمات بغداد العامة: لازم بالعنوان
  local text := 'المعامل|الزوراء|الحسينية';
  want text := 'الرصافة|بغداد|العاصمة|أمانة|الأنواء|الأمطار|الطقس|درجات الحرارة|عطلة|تعطيل|الدوام الرسمي|الكهرباء|الماء|المجاري|التربية|الامتحانات|المرور|الطرق|زحام|البطاقة الوطنية|الجوازات|الرواتب|الرافدين|السلف';
  skip text := 'الدوري|مباراة|منتخب|ريال مدريد|برشلونة|كرة القدم|هدف|ترامب|إسرائيل|أوكرانيا|روسيا|أمريكي|الأمريكية|الكونغرس';
begin
  begin doc := xmlparse(document regexp_replace(p_xml, '^\s*<\?xml[^>]*\?>', ''));
  exception when others then raise notice 'خبر: تعذّر قراءة % (%)', p_source, sqlerrm; return 0; end;
  foreach it in array xpath('//item', doc) loop
    t := private.xml_text((xpath('/*/title/text()', it))[1]::text);
    l := trim(coalesce((xpath('/*/link/text()', it))[1]::text, ''));
    d := private.xml_text((xpath('/*/description/text()', it))[1]::text);
    begin pd := ((xpath('/*/pubDate/text()', it))[1]::text)::timestamptz; exception when others then pd := now(); end;
    l := replace(l, '&amp;', '&');
    continue when t = '' or l !~ '^https?://' or pd < now() - interval '2 days';
    continue when t ~ skip or not (t ~ want or (t || ' ' || d) ~ local);
    insert into news_items (source, url, title, summary, published_at) values (p_source, l, left(t, 200), nullif(left(d, 600), ''), pd)
      on conflict (url) do nothing returning id into new_id;
    if new_id is not null then n := n + 1; perform private.send_card('n', new_id); new_id := null; end if;
  end loop;
  return n;
end $$;

-- الخطوة ١: يطلب كل المصادر (pg_net يجيبها بالخلفية)
create or replace function private.news_fetch() returns void
language plpgsql security definer set search_path = public as $$
declare f record; rid bigint;
begin
  delete from private.news_requests where created_at < now() - interval '1 day';
  for f in select * from private.news_feeds loop
    begin rid := net.http_get(url := f.url, timeout_milliseconds := 20000);
      insert into private.news_requests (id, source) values (rid, f.name) on conflict do nothing;
    exception when others then raise notice 'خبر: تعذّر طلب %: %', f.name, sqlerrm; end;
  end loop;
end $$;

-- الخطوة ٢ (بعد دقيقتين): يقرأ الردود ويضيف الأخبار
create or replace function private.news_collect() returns integer
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in execute 'select q.id, q.source, x.content, x.status_code from private.news_requests q join net._http_response x on x.id = q.id' loop
    if r.status_code = 200 and r.content is not null then n := n + private.news_ingest(r.source, r.content); end if;
    delete from private.news_requests where id = r.id;
  end loop;
  return n;
end $$;
revoke all on function private.xml_text(text), private.news_ingest(text, text), private.news_fetch(), private.news_collect() from public, anon, authenticated;

-- الجدولة: يحتاج pg_cron (Supabase ← Database ← Extensions ← pg_cron)
do $$ begin
  create extension if not exists pg_cron;
  perform cron.schedule('almamel-news-fetch', '5 */3 * * *', 'select private.news_fetch()');
  perform cron.schedule('almamel-news-collect', '8 */3 * * *', 'select private.news_collect()');
exception when others then raise notice 'pg_cron غير مفعّل: فعّله من Database ← Extensions ← pg_cron وأعد تشغيل الملف (%)', sqlerrm;
end $$;

-- الإدارة: «جيب الأخبار هسه» بدل انتظار ٣ ساعات
create or replace function public.news_fetch_now() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'غير مسموح'; end if;
  perform private.news_fetch();
end $$;
create or replace function public.news_collect_now() returns integer
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'غير مسموح'; end if;
  return private.news_collect();
end $$;
revoke all on function public.news_fetch_now(), public.news_collect_now() from public, anon;
grant execute on function public.news_fetch_now(), public.news_collect_now() to authenticated;

-- ---------- تنبيهات تيليغرام للإدارة، مع أزرار موافقة ورفض ----------
-- كل إعلان جديد، طلب محل، دلفري، منتجات، شكوى، تعليق، أو واحد وصل حد الدين: رسالة فورية بأزرار.
-- الأزرار تشتغل عبر دالة supabase/functions/telegram-bot (الشرح: docs/TELEGRAM.md).
-- الرموز بـ private.secrets: telegram_token، telegram_chat، و telegram_webhook_secret (ينولد لحاله).
create or replace function private.telegram(p_text text, p_kb jsonb default null) returns void
language plpgsql security definer set search_path = public as $$
declare tok text; chat text; body jsonb;
begin
  select value into tok from private.secrets where name = 'telegram_token';
  select value into chat from private.secrets where name = 'telegram_chat';
  if coalesce(tok, '') = '' or coalesce(chat, '') = '' then return; end if;
  body := jsonb_build_object('chat_id', chat, 'text', left(p_text, 3500), 'disable_web_page_preview', true);
  if p_kb is not null then body := body || jsonb_build_object('reply_markup', jsonb_build_object('inline_keyboard', p_kb)); end if;
  begin
    perform net.http_post(url := 'https://api.telegram.org/bot' || tok || '/sendMessage', body := body,
      headers := jsonb_build_object('Content-Type', 'application/json'));
  exception when others then
    raise notice 'تعذّر إرسال تنبيه تيليغرام: %', sqlerrm; -- ما يمنع أي عملية أبداً
  end;
end $$;
revoke all on function private.telegram(text, jsonb) from public, anon, authenticated;
drop function if exists private.telegram(text);

create or replace function private.btn(p_label text, p_data text) returns jsonb language sql immutable as $$
  select jsonb_build_object('text', p_label, 'callback_data', p_data) $$;

-- بطاقة لكل شي ينتظر قرار: نص + أزرار. النوع: p إعلان، c طلب محل، r دلفري، M منتجات محل، m منتج، k شكوى، v تعليق، d دين
create or replace function private.card(p_kind text, p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p posts; c claims; r riders; k complaints; v ratings; m record; en record; t text; who text; debt int; n int;
  lab text; nl text := chr(10);
begin
  if p_kind = 'p' then
    select * into p from posts where id = p_id; if not found then return null; end if;
    lab := case p.type when 'job' then 'وظيفة' when 'property' then 'عقار' when 'service' then 'خدمة' when 'market' then 'بيع وشراء'
      when 'offer' then 'عرض' when 'community' then 'خبر' when 'help' then 'طلب مساعدة' else 'محل' end;
    t := '📥 ' || lab || ' جديد بانتظار المراجعة' || nl || '«' || p.title || '»' || nl || p.category || '، ' || p.area
      || case when p.price is not null then nl || 'السعر: ' || to_char(p.price, 'FM999,999,999') || ' د.ع' else '' end
      || case when coalesce(p.body, '') <> '' then nl || nl || left(p.body, 600) else '' end
      || nl || nl || '👤 ' || coalesce(p.guest_name, (select name from profiles where id = p.author_id), '') || ' ' || coalesce(p.contact_phone, '')
      || case when cardinality(p.images) > 0 then nl || '🖼 ' || cardinality(p.images) || ' صور' else '' end
      || case when p.fee_due > 0 then nl || '💰 رسوم: ' || p.fee_due || ' د.ع (غير مسددة)' else '' end;
    return jsonb_build_object('text', t, 'kb', jsonb_build_array(
      jsonb_build_array(private.btn('✅ نشر', 'p:' || p_id || ':approve'), private.btn('❌ رفض: ناقص', 'p:' || p_id || ':missing')),
      jsonb_build_array(private.btn('❌ مكرر', 'p:' || p_id || ':dup'), private.btn('❌ مخالف للسياسة', 'p:' || p_id || ':bad'))));
  elsif p_kind = 'c' then
    select * into c from claims where id = p_id; if not found then return null; end if;
    select * into p from posts where id = c.business_id;
    select pr.name || ' ' || pr.phone into who from profiles pr where pr.id = c.user_id;
    t := '🏪 ' || case when p.status = 'pending' then 'طلب تسجيل محل جديد' else 'طلب ملكية محل موجود' end || nl || '«' || p.title || '»' || nl
      || p.category || '، ' || p.area || coalesce('، ' || (p.details->>'address'), '') || nl || '📞 رقم المحل: ' || coalesce(c.business_phone, p.contact_phone, '-')
      || nl || '👤 صاحب الطلب: ' || coalesce(who, '') || nl || nl || '💬 ' || c.message
      || case when c.proof_path is not null then nl || '📎 بيه صورة إثبات (تشوفها من لوحة الإدارة)' else '' end;
    return jsonb_build_object('text', t, 'kb', jsonb_build_array(
      jsonb_build_array(private.btn('✅ تم التحقق: اعتماد ونشر', 'c:' || p_id || ':approve')),
      jsonb_build_array(private.btn('❌ رفض', 'c:' || p_id || ':reject'))));
  elsif p_kind = 'r' then
    select * into r from riders where id = p_id; if not found then return null; end if;
    t := '🛵 دلفري جديد سجّل' || nl || r.name || ' — ' || r.phone || case when r.whatsapp then ' (واتساب)' else '' end || nl
      || r.vehicle || '، يوصل إلى: ' || r.areas || coalesce(nl || 'الأوقات: ' || r.hours, '') || coalesce(nl || 'كروته من: ' || r.min_fare || ' د.ع', '')
      || nl || '🏠 العنوان: ' || r.address || nl || nl || 'اتصل بيه وطابق الاسم ويا الهوية قبل النشر.';
    return jsonb_build_object('text', t, 'kb', jsonb_build_array(
      jsonb_build_array(private.btn('🪪 عرض الهوية', 'r:' || p_id || ':id')),
      jsonb_build_array(private.btn('✅ تم التحقق: نشر', 'r:' || p_id || ':approve'), private.btn('🗑 حذف مع الهوية', 'r:' || p_id || ':delete'))));
  elsif p_kind = 'e' then
    select * into en from engineers where id = p_id; if not found then return null; end if;
    t := '📐 مهندس جديد سجّل بدليل المهندسين' || nl || en.name || ' — ' || en.specialty || nl || '📍 ' || en.location
      || nl || '📞 ' || en.phone || case when en.whatsapp then ' (واتساب)' else '' end
      || nl || nl || 'الخدمات:' || nl || (select string_agg('• ' || x, nl) from unnest(en.services) x)
      || case when coalesce(en.about, '') <> '' then nl || nl || left(en.about, 500) else '' end;
    return jsonb_build_object('text', t, 'kb', jsonb_build_array(
      jsonb_build_array(private.btn('✅ نشر بالدليل', 'e:' || p_id || ':approve'), private.btn('🗑 حذف', 'e:' || p_id || ':delete')),
      jsonb_build_array(private.btn('🏅 نشر وتوثيق', 'e:' || p_id || ':verify'), private.btn('⭐ نشر وتمييز شهر', 'e:' || p_id || ':feature'))));
  elsif p_kind = 'n' then
    select * into m from news_items where id = p_id; if not found or m.status <> 'pending' then return null; end if;
    t := '📰 خبر جديد من ' || m.source || nl || '«' || m.title || '»' || coalesce(nl || nl || left(m.summary, 500), '') || nl || nl || '🔗 ' || m.url;
    return jsonb_build_object('text', t, 'kb', jsonb_build_array(
      jsonb_build_array(private.btn('✅ انشره بالموقع', 'n:' || p_id || ':approve'), private.btn('❌ لا', 'n:' || p_id || ':reject'))));
  elsif p_kind = 'M' then
    select count(*) into n from menu_items where business_id = p_id and not approved;
    if n = 0 then return null; end if;
    select * into p from posts where id = p_id;
    t := '🛍 «' || p.title || '» عنده ' || n || ' منتج جديد بانتظار الموافقة' || nl
      || (select string_agg('• ' || name || coalesce(' — ' || to_char(price, 'FM999,999,999') || ' د.ع', '') || case when image is not null then ' 🖼' else '' end, nl)
          from (select name, price, image from menu_items where business_id = p_id and not approved order by sort, id limit 15) x)
      || case when n > 15 then nl || '... و' || (n - 15) || ' غيرها' else '' end;
    return jsonb_build_object('text', t, 'kb', jsonb_build_array(
      jsonb_build_array(private.btn('✅ موافقة على الكل', 'M:' || p_id || ':approve')),
      jsonb_build_array(private.btn('📋 وحدة وحدة', 'M:' || p_id || ':list'))));
  elsif p_kind = 'm' then
    select mi.*, po.title as biz into m from menu_items mi join posts po on po.id = mi.business_id where mi.id = p_id; if not found then return null; end if;
    t := '🛍 ' || m.biz || ': ' || m.name || coalesce(' — ' || to_char(m.price, 'FM999,999,999') || ' د.ع', '') || coalesce(nl || m.note, '')
      || case when m.image is not null then nl || '🖼 بيه صورة' else '' end;
    return jsonb_build_object('text', t, 'kb', jsonb_build_array(
      jsonb_build_array(private.btn('✅ موافقة', 'm:' || p_id || ':approve'), private.btn('🗑 حذف', 'm:' || p_id || ':delete'))));
  elsif p_kind = 'k' then
    select * into k from complaints where id = p_id; if not found then return null; end if;
    if k.target_type = 'rider' then select 'الدلفري ' || name || ' ' || phone into who from riders where id = k.target_id;
    else select '«' || title || '»' into who from posts where id = k.target_id; end if;
    t := '⚠️ شكوى على ' || coalesce(who, '#' || k.target_id) || nl
      || case k.reason when 'scam' then 'نصب أو احتيال' when 'bad_service' then 'خدمة سيئة أو تأخير' when 'wrong_info' then 'معلومات غلط'
           when 'abuse' then 'إساءة' else 'شي ثاني' end
      || coalesce(nl || k.details, '') || coalesce(nl || '📞 رقم المشتكي: ' || k.phone, '') || coalesce(nl || 'IP: ' || k.client_ip, '');
    return jsonb_build_object('text', t, 'kb', jsonb_build_array(jsonb_build_array(private.btn('✔️ تمت المعالجة', 'k:' || p_id || ':close'))));
  elsif p_kind = 'v' then
    select * into v from ratings where id = p_id; if not found or v.comment is null then return null; end if;
    if v.target_type = 'rider' then select 'الدلفري ' || name into who from riders where id = v.target_id;
    else select '«' || title || '»' into who from posts where id = v.target_id; end if;
    t := '⭐ تعليق جديد على ' || coalesce(who, '#' || v.target_id) || nl || repeat('★', v.stars) || repeat('☆', 5 - v.stars) || nl || v.comment;
    return jsonb_build_object('text', t, 'kb', jsonb_build_array(
      jsonb_build_array(private.btn('✅ نشر التعليق', 'v:' || p_id || ':approve'), private.btn('🗑 حذفه (تبقى النجوم)', 'v:' || p_id || ':clear'))));
  elsif p_kind = 'd' then
    select * into p from posts where id = p_id; if not found then return null; end if;
    debt := public.ad_debt(p.author_id, p.contact_phone, p.client_ip);
    if debt = 0 then return null; end if;
    t := '⛔ ' || coalesce(p.guest_name, (select name from profiles where id = p.author_id), 'صاحب حساب') || ' ' || coalesce(p.contact_phone, '')
      || nl || 'عليه ' || to_char(debt, 'FM999,999') || ' د.ع رسوم إعلانات'
      || case when debt >= public.ad_debt_limit() then ' وممنوع من النشر لحد ما يسدد.' else '.' end
      || coalesce(nl || 'IP: ' || p.client_ip, '');
    return jsonb_build_object('text', t, 'kb', jsonb_build_array(jsonb_build_array(private.btn('✅ استلمت المبلغ: تنشيط', 'd:' || p_id || ':settle'))));
  end if;
  return null;
end $$;
revoke all on function private.card(text, bigint) from public, anon, authenticated;

create or replace function private.send_card(p_kind text, p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare c jsonb := private.card(p_kind, p_id);
begin
  if c is not null then perform private.telegram(c->>'text', c->'kb'); end if;
exception when others then raise notice 'تعذّر تجهيز التنبيه: %', sqlerrm;
end $$;
revoke all on function private.send_card(text, bigint) from public, anon, authenticated;

-- المحتوى الجديد → بطاقة. المحل الجديد ينرسل كطلب محل (claims) حتى يتعتمد مع صاحبه.
create or replace function private.notify_post() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('app.bot_news', true), '') = '1' then return null; end if; -- خبر نشره المدير من البوت
  if new.type <> 'business' then perform private.send_card('p', new.id); end if;
  if new.fee_due > 0 and public.ad_debt(new.author_id, new.contact_phone, new.client_ip) >= public.ad_debt_limit() then
    perform private.send_card('d', new.id);
  end if;
  return null;
end $$;
drop trigger if exists posts_notify on public.posts;
create trigger posts_notify after insert on public.posts for each row execute function private.notify_post();

create or replace function private.notify_claim() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform private.send_card('c', new.id); return null; end $$;
drop trigger if exists claims_notify on public.claims;
create trigger claims_notify after insert on public.claims for each row execute function private.notify_claim();

create or replace function private.notify_rider() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform private.send_card('r', new.id); return null; end $$;
drop trigger if exists riders_notify on public.riders;
create trigger riders_notify after insert on public.riders for each row execute function private.notify_rider();

create or replace function private.notify_complaint() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform private.send_card('k', new.id); return null; end $$;
drop trigger if exists complaints_notify on public.complaints;
create trigger complaints_notify after insert on public.complaints for each row execute function private.notify_complaint();

create or replace function private.notify_review() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.comment is not null and not new.approved and (tg_op = 'INSERT' or new.comment is distinct from old.comment) then perform private.send_card('v', new.id); end if;
  return null;
end $$;
drop trigger if exists ratings_notify on public.ratings;
create trigger ratings_notify after insert or update of comment on public.ratings for each row execute function private.notify_review();

-- المنتجات: رسالة وحدة لكل محل حتى لو انضاف ١٠٠ منتج دفعة وحدة
create or replace function private.notify_products() returns trigger
language plpgsql security definer set search_path = public as $$
declare b bigint;
begin
  for b in select distinct n.business_id from new_items n where not n.approved and public.is_public_business(n.business_id) loop
    perform private.send_card('M', b);
  end loop;
  return null;
end $$;
drop trigger if exists menu_notify on public.menu_items;
create trigger menu_notify after insert on public.menu_items referencing new table as new_items for each statement execute function private.notify_products();
drop trigger if exists menu_notify_upd on public.menu_items;
create trigger menu_notify_upd after update on public.menu_items referencing new table as new_items for each statement execute function private.notify_products();

-- ---------- البوت: يستلم ضغطات الأزرار (يناديها supabase/functions/telegram-bot بمفتاح الخدمة فقط) ----------
-- ينفذ القرار باسم المدير، بنفس دوال لوحة الإدارة (ونفس سجل المراجعة).
create or replace function public.bot_action(p_kind text, p_id bigint, p_action text) returns text
language plpgsql security definer set search_path = public as $$
declare admin uuid; n int; reason text;
begin
  select id into admin from profiles where role = 'admin' order by created_at limit 1;
  if admin is null then raise exception 'ما كو حساب مدير'; end if;
  perform set_config('request.jwt.claim.sub', admin::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', admin, 'aal', 'aal2', 'role', 'authenticated')::text, true);
  if p_kind = 'p' then
    if p_action = 'approve' then perform public.moderate_post(p_id, 'approve'); return 'انتشر ✅';
    elsif p_action in ('missing', 'dup', 'bad') then
      reason := case p_action when 'missing' then 'المعلومات ناقصة. أضف التفاصيل والرقم والصور وانشر من جديد.'
        when 'dup' then 'الإعلان مكرر.' else 'الإعلان مخالف لسياسة النشر.' end;
      perform public.moderate_post(p_id, 'reject', reason); return 'انرفض ❌ (' || reason || ')';
    end if;
  elsif p_kind = 'c' then
    perform public.decide_claim(p_id, p_action = 'approve', case when p_action = 'approve' then null else 'لم نتمكن من التحقق من ملكية النشاط' end);
    return case when p_action = 'approve' then 'اتعتمد المحل وانتشر ✅' else 'انرفض الطلب ❌' end;
  elsif p_kind = 'r' then
    if p_action = 'approve' then
      update riders set status = 'approved', decided_at = now() where id = p_id; get diagnostics n = row_count;
      if n = 0 then raise exception 'الدلفري غير موجود'; end if; return 'انتشر بصفحة دلفري حر ✅';
    elsif p_action = 'delete' then
      delete from riders where id = p_id; get diagnostics n = row_count;
      if n = 0 then raise exception 'الدلفري غير موجود'; end if; return 'انحذف ويا هويته 🗑';
    end if;
  elsif p_kind = 'e' then
    if p_action = 'approve' then
      update engineers set status = 'approved', decided_at = now() where id = p_id; get diagnostics n = row_count;
      if n = 0 then raise exception 'المهندس غير موجود'; end if; return 'انتشر بدليل المهندسين ✅';
    elsif p_action = 'delete' then
      delete from engineers where id = p_id; get diagnostics n = row_count;
      if n = 0 then raise exception 'المهندس غير موجود'; end if; return 'انحذف 🗑';
    elsif p_action = 'verify' then
      update engineers set status = 'approved', decided_at = coalesce(decided_at, now()), verified = true where id = p_id; get diagnostics n = row_count;
      if n = 0 then raise exception 'المهندس غير موجود'; end if; return 'انتشر وصار موثّق 🏅';
    elsif p_action = 'feature' then
      update engineers set status = 'approved', decided_at = coalesce(decided_at, now()), featured_until = greatest(coalesce(featured_until, now()), now()) + interval '30 days' where id = p_id; get diagnostics n = row_count;
      if n = 0 then raise exception 'المهندس غير موجود'; end if; return 'انتشر وصار مميز لمدة شهر ⭐';
    end if;
  elsif p_kind = 'n' then
    declare ni record; pid bigint;
    begin
      select * into ni from news_items where id = p_id for update;
      if not found then raise exception 'الخبر غير موجود'; end if;
      if ni.status <> 'pending' then raise exception 'الخبر انراجع قبل'; end if;
      if p_action = 'reject' then update news_items set status = 'rejected' where id = p_id; return 'ما انتشر ❌'; end if;
      if p_action <> 'approve' then raise exception 'أمر غير معروف'; end if;
      perform set_config('app.bot_news', '1', true); -- لا نبلّغ المدير بنفس الخبر مرة ثانية
      insert into posts (type, title, body, category, area, details)
        values ('community', left(ni.title, 100),
          coalesce(ni.summary, '') || E'

' || 'المصدر: ' || ni.source || '. التفاصيل الكاملة بالخبر الأصلي.', 'أخبار المنطقة', 'المعامل',
          jsonb_build_object('source_name', ni.source, 'source_url', ni.url))
        returning id into pid;
      update posts set fee_due = 0 where id = pid;
      perform public.moderate_post(pid, 'approve');
      update news_items set status = 'published', post_id = pid where id = p_id;
      return 'انتشر بأخبار المعامل ✅';
    end;
  elsif p_kind = 'M' and p_action = 'approve' then
    update menu_items set approved = true where business_id = p_id and not approved; get diagnostics n = row_count;
    return 'انوافق على ' || n || ' منتج ✅';
  elsif p_kind = 'm' then
    if p_action = 'approve' then update menu_items set approved = true where id = p_id; get diagnostics n = row_count; if n = 0 then raise exception 'المنتج غير موجود'; end if; return 'انوافق ✅';
    elsif p_action = 'delete' then delete from menu_items where id = p_id; get diagnostics n = row_count; if n = 0 then raise exception 'المنتج غير موجود'; end if; return 'انحذف 🗑';
    end if;
  elsif p_kind = 'k' and p_action = 'close' then
    update complaints set status = 'closed' where id = p_id; return 'انغلقت الشكوى ✔️';
  elsif p_kind = 'v' then
    if p_action = 'approve' then update ratings set approved = true where id = p_id; return 'انتشر التعليق ✅';
    elsif p_action = 'clear' then update ratings set comment = null where id = p_id; return 'انحذف التعليق 🗑'; end if;
  elsif p_kind = 'd' and p_action = 'settle' then
    n := public.settle_debt(p_id); return 'انمسح دين ' || to_char(n, 'FM999,999') || ' د.ع ويكدر ينشر ✅';
  end if;
  raise exception 'أمر غير معروف';
end $$;

-- كل الي ينتظر قرار (أمر /pending بالبوت)
create or replace function public.bot_pending() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare out jsonb := '[]'; c jsonb; x record;
begin
  for x in (select 'c' k, id from claims where status = 'pending' order by created_at limit 10)
    union all (select 'p', id from posts where status = 'pending' and type <> 'business' order by created_at limit 15)
    union all (select 'r', id from riders where status = 'pending' order by created_at limit 10)
    union all (select 'e', id from engineers where status = 'pending' order by created_at limit 10)
    union all (select 'n', id from news_items where status = 'pending' and created_at > now() - interval '3 days' order by created_at limit 10)
    union all (select 'M', business_id from menu_items where not approved and public.is_public_business(business_id) group by business_id limit 10)
    union all (select 'k', id from complaints where status = 'open' order by created_at limit 10)
    union all (select 'v', id from ratings where not approved and comment is not null order by created_at limit 10)
    union all (select 'd', max(id) from posts where fee_due > 0 and status not in ('rejected', 'removed') group by coalesce(author_id::text, client_ip, contact_phone) having sum(fee_due) >= public.ad_debt_limit() limit 10)
  loop
    c := private.card(x.k, x.id);
    if c is not null then out := out || jsonb_build_array(c); end if;
  end loop;
  return out;
end $$;

-- بطاقة وحدة (مثلاً المنتجات وحدة وحدة)، وإعدادات البوت، ومسارات صور الهوية
create or replace function public.bot_card(p_kind text, p_id bigint) returns jsonb
language sql stable security definer set search_path = public as $$ select private.card(p_kind, p_id) $$;
create or replace function public.bot_product_ids(p_business bigint) returns bigint[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(id order by sort, id), '{}') from (select id, sort from menu_items where business_id = p_business and not approved order by sort, id limit 20) x $$;
create or replace function public.bot_config() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('token', (select value from private.secrets where name = 'telegram_token'),
    'chat', (select value from private.secrets where name = 'telegram_chat'),
    'secret', (select value from private.secrets where name = 'telegram_webhook_secret')) $$;

revoke all on function public.bot_action(text, bigint, text), public.bot_pending(), public.bot_card(text, bigint),
  public.bot_product_ids(bigint), public.bot_config() from public, anon, authenticated;
do $$ begin
  execute 'grant execute on function public.bot_action(text, bigint, text), public.bot_pending(), public.bot_card(text, bigint), public.bot_product_ids(bigint), public.bot_config() to service_role';
exception when others then null; end $$;

-- ربط البوت بالدالة (مرة وحدة): يسوي رمز سري للأزرار ويبلّغ تيليغرام بعنوان الدالة
create or replace function private.telegram_set_webhook(p_url text) returns void
language plpgsql security definer set search_path = public as $$
declare tok text; sec text;
begin
  select value into tok from private.secrets where name = 'telegram_token';
  if coalesce(tok, '') = '' then raise notice 'ضيف telegram_token أول'; return; end if;
  select value into sec from private.secrets where name = 'telegram_webhook_secret';
  if sec is null then
    sec := md5(random()::text || clock_timestamp()::text) || md5(random()::text);
    insert into private.secrets (name, value) values ('telegram_webhook_secret', sec);
  end if;
  begin
    perform net.http_post(url := 'https://api.telegram.org/bot' || tok || '/setWebhook',
      body := jsonb_build_object('url', p_url, 'secret_token', sec, 'allowed_updates', jsonb_build_array('message', 'callback_query'), 'drop_pending_updates', true),
      headers := jsonb_build_object('Content-Type', 'application/json'));
  exception when others then raise notice 'تعذّر ربط البوت: %', sqlerrm; end;
end $$;
revoke all on function private.telegram_set_webhook(text) from public, anon, authenticated;

-- المدير: رسالة تجربة حتى يتأكد إن التنبيهات توصل
create or replace function public.telegram_test() returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'غير مسموح'; end if;
  if not exists (select 1 from private.secrets where name = 'telegram_token') or not exists (select 1 from private.secrets where name = 'telegram_chat') then return false; end if;
  perform private.telegram('✅ تنبيهات دليل المعامل شغّالة. اكتب /pending حتى يرسلك كل الي ينتظر موافقتك.');
  return true;
end $$;
revoke all on function public.telegram_test() from public, anon;
grant execute on function public.telegram_test() to authenticated;


-- تنبيه تيليغرام بزر نشر أو حذف لكل مهندس جديد
create or replace function private.notify_engineer() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform private.send_card('e', new.id); return null; end $$;
drop trigger if exists engineers_notify on public.engineers;
create trigger engineers_notify after insert on public.engineers for each row execute function private.notify_engineer();

