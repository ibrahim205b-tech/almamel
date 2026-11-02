-- تحديث: نشر فوري للإعلانات بعد الموافقة. انسخ الملف كاملاً وشغّله مرة وحدة في Supabase ← SQL Editor ← Run (آمن لو انعاد).
-- ---------- نشر فوري: إشعار GitHub لإعادة بناء الموقع عند تغيّر المحتوى المنشور ----------
-- الجدولة المجانية في GitHub تتأخر ساعات، فقاعدة البيانات تطلب التحديث بنفسها (عبر pg_net).
-- المفتاح يُحفظ في مخطط private غير مكشوف للموقع، ويضعه المدير من SQL Editor فقط:
--   insert into private.secrets (name, value) values ('github_token', 'github_pat_...')
--   on conflict (name) do update set value = excluded.value;
do $$ begin create extension if not exists pg_net; exception when others then raise notice 'pg_net غير متوفر: النشر الفوري معطّل'; end $$;
create schema if not exists private;
create table if not exists private.secrets (name text primary key, value text not null);
revoke all on schema private from public, anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;

create or replace function private.request_rebuild() returns void
language plpgsql security definer set search_path = public as $$
declare tok text;
begin
  select value into tok from private.secrets where name = 'github_token';
  if tok is null or tok = '' then return; end if;
  begin
    perform net.http_post(
      url := 'https://api.github.com/repos/ibrahim205b-tech/almamel/dispatches',
      body := jsonb_build_object('event_type', 'content-changed'),
      headers := jsonb_build_object('Authorization', 'Bearer ' || tok, 'Accept', 'application/vnd.github+json',
                                    'User-Agent', 'almamel-supabase', 'Content-Type', 'application/json'));
  exception when others then
    raise notice 'تعذّر طلب تحديث الموقع: %', sqlerrm; -- لا يمنع الموافقة أبداً
  end;
end $$;
revoke all on function private.request_rebuild() from public, anon, authenticated;

create or replace function private.on_content_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform private.request_rebuild();
  return null;
end $$;

-- منشور صار منشوراً، أو تعدّل/أُخفي/حُذف وهو منشور
drop trigger if exists posts_rebuild_upd on public.posts;
create trigger posts_rebuild_upd after update on public.posts for each row
  when (old.status = 'published' or new.status = 'published') execute function private.on_content_change();
drop trigger if exists posts_rebuild_del on public.posts;
create trigger posts_rebuild_del after delete on public.posts for each row
  when (old.status = 'published') execute function private.on_content_change();
-- قوائم الطعام والأسعار: مرة وحدة لكل عملية (حتى لو أُضيف ١٠٠ صنف دفعة وحدة)
drop trigger if exists menu_rebuild on public.menu_items;
create trigger menu_rebuild after insert or update or delete on public.menu_items for each statement execute function private.on_content_change();
