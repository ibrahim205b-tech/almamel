-- تحديث: إشعارات الموقع. انسخ الملف كاملاً وشغّله في Supabase ← SQL Editor ← Run (آمن لو انعاد).
-- بعده: ارفع دالة supabase/functions/push، وشغّل سطر المفتاح السري الي وصلك بالمحادثة. الشرح: docs/PUSH.md
do $$ begin
  if to_regclass('public.complaints') is null then raise exception 'شغّل ملف 2026-11-trust.sql أول، وبعدين هذا الملف'; end if;
end $$;
do $$ begin create extension if not exists pg_net; exception when others then raise notice 'pg_net غير متوفر'; end $$;
create schema if not exists private;
create table if not exists private.secrets (name text primary key, value text not null);
revoke all on schema private from public, anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;

-- ---------- إشعارات الموقع (Web Push) ----------
-- الزائر يفعّل الإشعارات من الموقع، وتوصله: الأخبار الجديدة فور نشرها، ورسائل تنبيهية مرتبة (وحدة كل ٣ أيام بالكثير)،
-- والي يرسلها المدير من لوحته. الإرسال تسويه دالة supabase/functions/push بمفتاح VAPID السري (private.secrets).
create table if not exists public.push_subscriptions (
  id         bigint generated always as identity primary key,
  endpoint   text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh     text not null check (p256dh ~ '^[A-Za-z0-9_-]{80,100}$'),
  auth       text not null check (auth ~ '^[A-Za-z0-9_-]{16,30}$'),
  created_at timestamptz not null default now(),
  last_seen  timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security; -- لا سياسات: الوصول عبر الدوال فقط

create table if not exists public.push_log (
  id      bigint generated always as identity primary key,
  kind    text not null check (kind in ('news', 'promo', 'admin')),
  title   text not null, body text not null, url text not null,
  sent_at timestamptz not null default now(),
  sent    integer, failed integer
);
alter table public.push_log enable row level security;
drop policy if exists push_log_staff on public.push_log;
create policy push_log_staff on public.push_log for select to authenticated using (public.is_staff());

-- الرسائل التنبيهية بالترتيب (تقدر تعدلها أو تضيف عليها من SQL Editor)
create table if not exists public.push_promos (
  id        bigint generated always as identity primary key,
  title     text not null, body text not null, url text not null,
  sort      integer not null default 0, active boolean not null default true,
  last_sent timestamptz
);
alter table public.push_promos enable row level security;
insert into public.push_promos (title, body, url, sort)
select * from (values
  ('عندك بيت للإيجار أو للبيع؟', 'اعرضه بدليل المعامل ويوصل لكل واحد يدوّر على بيت بالمنطقة. أول إعلان مجاني.', '/submit/property/', 1),
  ('عندك محل بالمعامل؟', 'ضيف محلك لدليل المعامل، وخلّي الزبون يلكاك ويطلب منك مباشرة.', '/mat3am/', 2),
  ('تحتاج أحد يوصلك غرض؟', 'دلفري حر من أهل المنطقة، وكل واحد هويته محفوظة عند الإدارة.', '/delivery/', 3),
  ('تبني أو ترمم بيتك؟', 'دليل المهندسين: مدني، معماري، كهربائي... تواصل وياهم مباشرة.', '/engineers/', 4),
  ('تدوّر على شغل؟', 'شوف آخر الوظائف بمحلات ومطاعم ومعامل المنطقة.', '/jobs/', 5),
  ('عندك شي تبيعه؟', 'أثاث، أجهزة، موبايلات... اعرضه بدقيقتين وأول إعلان مجاني.', '/submit/market/', 6),
  ('انت مهندس؟', 'سجّل اختصاصك وخدماتك بدليل المهندسين وخلّي أهل المنطقة يوصلولك.', '/engineers/join/', 7),
  ('عندك دراجة أو ستوتة؟', 'سجّل بدلفري حر واشتغل توصيل لأهل منطقتك.', '/delivery/join/', 8)
) v(title, body, url, sort)
where not exists (select 1 from public.push_promos);

-- الزائر: يحفظ اشتراكه (أو يحدّثه) ويلغيه
create or replace function public.push_subscribe(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into push_subscriptions (endpoint, p256dh, auth) values (p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, last_seen = now();
end $$;
create or replace function public.push_unsubscribe(p_endpoint text) returns void
language sql security definer set search_path = public as $$ delete from push_subscriptions where endpoint = p_endpoint $$;
revoke all on function public.push_subscribe(text, text, text), public.push_unsubscribe(text) from public;
grant execute on function public.push_subscribe(text, text, text), public.push_unsubscribe(text) to anon, authenticated;

-- المفتاح العام (علني بطبيعته) والرمز السري بين قاعدة البيانات والدالة
insert into private.secrets (name, value) values ('vapid_public', 'BBERFAexzBaJsANRBrgMN7BDplogjjk4nJvc8129jd6nQQXnBql0HPoUEU-mFKH1Mb03iuukaQO2A59M7hw3xQg') on conflict (name) do update set value = excluded.value;
insert into private.secrets (name, value) values ('push_secret', md5(random()::text || clock_timestamp()::text) || md5(random()::text)) on conflict (name) do nothing;
insert into private.secrets (name, value) values ('push_url', 'https://nffknzxxqfldqiumfywe.supabase.co/functions/v1/push') on conflict (name) do nothing;

-- يطلب من الدالة ترسل إشعار لكل المشتركين
create or replace function private.push_send(p_kind text, p_title text, p_body text, p_url text) returns bigint
language plpgsql security definer set search_path = public as $$
declare lid bigint; u text; sec text;
begin
  select value into u from private.secrets where name = 'push_url';
  select value into sec from private.secrets where name = 'push_secret';
  insert into push_log (kind, title, body, url) values (p_kind, left(p_title, 80), left(p_body, 200), p_url) returning id into lid;
  if not exists (select 1 from private.secrets where name = 'vapid_private') then return lid; end if;
  begin
    perform net.http_post(url := u, body := jsonb_build_object('title', left(p_title, 80), 'body', left(p_body, 200), 'url', p_url, 'tag', p_kind, 'log_id', lid),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', sec), timeout_milliseconds := 60000);
  exception when others then raise notice 'تعذّر إرسال الإشعار: %', sqlerrm; end;
  return lid;
end $$;
revoke all on function private.push_send(text, text, text, text) from public, anon, authenticated;

-- خبر انتشر → إشعار (بالكثير ٦ بالي يوم حتى ما نزعج الناس)
create or replace function private.push_on_news() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'published' and old.status is distinct from 'published' and new.type = 'community'
     and new.category in ('أخبار المنطقة', 'تنبيهات الخدمات العامة')
     and (select count(*) from push_log where kind = 'news' and sent_at > now() - interval '1 day') < 6 then
    perform private.push_send('news', 'دليل المعامل: خبر جديد', new.title, '/news/');
  end if;
  return null;
end $$;
drop trigger if exists posts_push_news on public.posts;
create trigger posts_push_news after update of status on public.posts for each row execute function private.push_on_news();

-- رسالة تنبيهية: وحدة كل ٣ أيام بالكثير (حتى لو أرسل المدير رسالة، ننتظر ٣ أيام بعدها)
create or replace function private.push_promo_tick() returns void
language plpgsql security definer set search_path = public as $$
declare p push_promos;
begin
  if exists (select 1 from push_log where kind in ('promo', 'admin') and sent_at > now() - interval '70 hours') then return; end if;
  select * into p from push_promos where active order by last_sent nulls first, sort limit 1;
  if not found then return; end if;
  perform private.push_send('promo', p.title, p.body, p.url);
  update push_promos set last_sent = now() where id = p.id;
end $$;
revoke all on function private.push_promo_tick() from public, anon, authenticated;
do $$ begin
  create extension if not exists pg_cron;
  perform cron.schedule('almamel-push-promo', '13 16 * * *', 'select private.push_promo_tick()'); -- ٧:١٣ مساءً بتوقيت بغداد
exception when others then raise notice 'pg_cron غير مفعّل: الرسائل التنبيهية تحتاجه (%)', sqlerrm;
end $$;

-- المدير: يرسل إشعار بنفسه، ويشوف عدد المشتركين وآخر الإشعارات
create or replace function public.push_admin_send(p_title text, p_body text, p_url text default '/') returns bigint
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'غير مسموح'; end if;
  if char_length(trim(coalesce(p_title, ''))) < 2 or char_length(trim(coalesce(p_body, ''))) < 2 then raise exception 'اكتب العنوان والنص'; end if;
  if coalesce(p_url, '/') !~ '^(/|https://)' then raise exception 'الرابط يبدي بـ / أو https://'; end if;
  return private.push_send('admin', trim(p_title), trim(p_body), coalesce(nullif(trim(p_url), ''), '/'));
end $$;
create or replace function public.push_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'غير مسموح'; end if;
  return jsonb_build_object('subscribers', (select count(*) from push_subscriptions),
    'ready', exists (select 1 from private.secrets where name = 'vapid_private'),
    'last', (select coalesce(jsonb_agg(x), '[]') from (select kind, title, body, sent_at, sent, failed from push_log order by id desc limit 8) x));
end $$;
-- للدالة فقط (مفتاح الخدمة)
create or replace function public.push_config() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('public', (select value from private.secrets where name = 'vapid_public'),
    'private', (select value from private.secrets where name = 'vapid_private'),
    'secret', (select value from private.secrets where name = 'push_secret'),
    'subject', 'https://almamel.pages.dev') $$;
revoke all on function public.push_admin_send(text, text, text), public.push_stats(), public.push_config() from public, anon;
grant execute on function public.push_admin_send(text, text, text), public.push_stats() to authenticated;
revoke all on function public.push_config() from authenticated;
do $$ begin execute 'grant execute on function public.push_config() to service_role'; exception when others then null; end $$;
