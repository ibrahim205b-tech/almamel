-- تحديث: تصليحات. انسخ الملف كاملاً وشغّله في Supabase ← SQL Editor ← Run (آمن لو انعاد).
-- ١) الأخبار الي توافق عليها من البوت (وإعلانات الإدارة) ما عليها رسوم ولا حد ١٥ منشور باليوم،
--    قبل كان البوت يوقف عن نشر الأخبار بعد ١٥ خبر باليوم.
do $$ begin
  if to_regclass('public.complaints') is null then raise exception 'شغّل ملف 2026-11-trust.sql أول، وبعدين هذا الملف'; end if;
end $$;

create or replace function public.posts_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); p text;
begin
  new.status := 'pending'; new.status_reason := null; new.approved_by := null;
  new.published_at := null; new.expires_at := null; new.verified := false; new.is_official := false;
  new.owner_id := null; new.open_state := 'unknown'; new.featured_until := null;
  -- الشعار: للمحلات فقط ومن مجلد صاحب الحساب نفسه
  if new.logo is not null and (uid is null or new.type <> 'business' or not valid_media_path(new.logo, uid)) then new.logo := null; end if;
  new.author_id := uid; new.created_at := now(); new.updated_at := now();
  -- الإعلان الأول لكل شخص مجاني، وكل إعلان بعده دين عليه بـ ad_fee() يسدده للإدارة.
  -- إذا وصل دينه ad_debt_limit() ما يكدر ينشر لحد ما الإدارة تأكد الدفع. طلب تسجيل المحل نفسه ما ينحسب.
  new.client_ip := public.request_ip();
  if new.edit_hash is not null and new.edit_hash !~ '^[0-9a-f]{64}$' then new.edit_hash := null; end if;
  new.fee_due := 0;
  -- الإدارة (والأخبار الي توافق عليها من البوت) ما عليها رسوم ولا حد يومي
  if new.type <> 'business' and not public.is_staff() then
    if public.ad_debt(uid, new.contact_phone, new.client_ip) >= public.ad_debt_limit() then
      raise exception 'عليك % د.ع رسوم إعلانات سابقة. سدّدها للإدارة على الواتساب وبعدها تكدر تنشر.', to_char(public.ad_debt(uid, new.contact_phone, new.client_ip), 'FM999,999');
    end if;
    if exists (select 1 from posts q where q.type <> 'business' and q.status <> 'rejected' and public.same_poster(q, uid, new.contact_phone, new.client_ip)) then
      new.fee_due := public.ad_fee();
    end if;
  end if;
  if uid is null then
    if new.type = 'business' then raise exception 'المحلات تُضاف من حساب صاحب المحل'; end if;
    if new.guest_name is null or new.contact_phone is null then raise exception 'الاسم ورقم التواصل مطلوبان'; end if;
    if cardinality(new.images) > 3 then raise exception 'الحد الأقصى ٣ صور'; end if;
    if (select count(*) from posts where author_id is null and created_at > now() - interval '1 hour') >= 30 then
      raise exception 'وصلت إعلانات كثيرة الآن. حاول بعد ساعة.'; end if;
  else
    new.guest_name := null;
    if not public.is_staff() and (select count(*) from posts where author_id = uid and created_at > now() - interval '1 day') >= 15 then
      raise exception 'وصلت للحد اليومي للمنشورات.'; end if;
  end if;
  foreach p in array new.images loop
    if not valid_media_path(p, uid) then raise exception 'مسار صورة غير صالح'; end if;
  end loop;
  if new.business_id is not null and not exists (
      select 1 from posts b where b.id = new.business_id and b.type = 'business' and b.status = 'published' and b.owner_id = uid) then
    new.business_id := null;
  end if;
  if new.type = 'help' and coalesce((new.details->>'consent')::boolean, false) is not true then
    raise exception 'يجب تأكيد موافقة صاحب الحالة على النشر'; end if;
  return new;
end $$;
