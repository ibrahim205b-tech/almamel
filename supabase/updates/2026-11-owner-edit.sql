-- تحديث: صاحب المحل يعدّل معلومات وصور محله بنفسه. انسخ الملف كاملاً وشغّله مرة وحدة في Supabase ← SQL Editor ← Run (آمن لو انعاد).
-- صاحب المحل المعتمد: يعدّل الوصف والعنوان والأوقات والخدمات والتوصيل والصور بدون مراجعة جديدة
-- (الاسم والرقم والمنطقة تبقى عبر update_business لأنها تحتاج مراجعة)
create or replace function public.update_business_info(p_id bigint, p_body text, p_details jsonb, p_images text[], p_whatsapp boolean)
returns void language plpgsql security definer set search_path = public as $$
declare img text; d jsonb := '{}'; k text;
begin
  if not exists (select 1 from posts where id = p_id and type = 'business' and owner_id = auth.uid() and status = 'published') then
    raise exception 'غير مسموح'; end if;
  if length(coalesce(p_body, '')) > 2000 then raise exception 'الوصف طويل جداً'; end if;
  if cardinality(coalesce(p_images, '{}')) > 6 then raise exception 'الحد الأقصى ٦ صور'; end if;
  foreach img in array coalesce(p_images, '{}') loop
    if not valid_media_path(img, auth.uid()) and not exists (select 1 from posts where id = p_id and img = any(images)) then raise exception 'مسار صورة غير صالح'; end if;
  end loop;
  foreach k in array array['address', 'hours', 'services', 'delivery'] loop
    if p_details ? k then d := d || jsonb_build_object(k, left(trim(coalesce(p_details->>k, '')), case when k = 'services' then 1000 else 300 end)); end if;
  end loop;
  update posts set body = coalesce(p_body, ''), details = details || d, images = coalesce(p_images, '{}'), whatsapp = coalesce(p_whatsapp, whatsapp), updated_at = now()
    where id = p_id;
  insert into moderation_log (post_id, actor_id, action) values (p_id, auth.uid(), 'owner_edit');
end $$;
revoke all on function public.update_business_info(bigint, text, jsonb, text[], boolean) from public;
grant execute on function public.update_business_info(bigint, text, jsonb, text[], boolean) to authenticated;
