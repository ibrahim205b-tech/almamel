-- تحديث: منتجات أصحاب المحلات تنتظر موافقة الإدارة. انسخ الملف كاملاً وشغّله مرة وحدة في Supabase ← SQL Editor ← Run (آمن لو انعاد).

alter table public.menu_items add column if not exists approved boolean not null default true;
alter table public.menu_items alter column approved set default false;
create index if not exists menu_items_pending on public.menu_items (approved) where not approved;

create or replace function public.menu_items_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then new.business_id := old.business_id; end if;
  -- الصورة تُفحص فقط إذا تغيّرت (حتى صاحب المحل يكدر يعدّل صنف صورته رفعتها الإدارة)
  if new.image is not null and (tg_op = 'INSERT' or new.image is distinct from old.image)
     and new.image !~ ('^u/' || auth.uid()::text || '/') and not public.is_admin() then
    raise exception 'مسار صورة غير صالح'; end if;
  if tg_op = 'INSERT' and (select count(*) from menu_items where business_id = new.business_id) >= 300 then
    raise exception 'الحد الأقصى ٣٠٠ صنف'; end if;
  -- منتج جديد من صاحب المحل، أو تغيير اسمه أو وصفه أو صورته: ينتظر موافقة الإدارة.
  -- السعر والقسم والتوفر يتعدلون بدون موافقة. منتجات محل لم يُعتمد بعد تُراجع ويا المحل نفسه.
  if not public.is_admin() then
    if tg_op = 'INSERT' then new.approved := not public.is_public_business(new.business_id);
    elsif new.name is distinct from old.name or new.note is distinct from old.note or new.image is distinct from old.image then new.approved := false;
    else new.approved := old.approved; end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop policy if exists menu_read on public.menu_items;
create policy menu_read on public.menu_items for select using ((public.is_public_business(business_id) and approved) or public.can_manage(business_id));

create or replace function public.place_order(p_business bigint, p_items jsonb, p_phone text, p_name text, p_landmark text,
  p_lat double precision default null, p_lng double precision default null, p_note text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare it jsonb; m menu_items; q int; tot bigint := 0; cnt int := 0; out_lines jsonb := '[]'; t uuid;
begin
  if not public.is_public_business(p_business) then raise exception 'المطعم غير متاح'; end if;
  if p_phone is null or p_phone !~ '^07[0-9]{9}$' then raise exception 'رقم الهاتف غير صحيح'; end if;
  if p_landmark is null or length(trim(p_landmark)) < 3 or length(p_landmark) > 300 then raise exception 'اكتب أقرب نقطة دالة'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 60 then raise exception 'السلة فارغة'; end if;
  if (select count(*) from orders where customer_phone = p_phone and created_at > now() - interval '10 minutes') >= 5 then
    raise exception 'طلبات كثيرة من هذا الرقم. انتظر شوية وحاول مرة ثانية.'; end if;
  if (select count(*) from orders where business_id = p_business and created_at > now() - interval '1 hour') >= 80 then
    raise exception 'المطعم مشغول حالياً. حاول بعد قليل.'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    q := least(greatest(coalesce((it->>'q')::int, 0), 0), 50);
    if q = 0 then continue; end if;
    select * into m from menu_items where business_id = p_business and name = it->>'name' and available and approved order by id limit 1;
    if not found then raise exception 'الصنف «%» غير متوفر حالياً', it->>'name'; end if;
    out_lines := out_lines || jsonb_build_object('name', m.name, 'price', m.price, 'q', q);
    tot := tot + coalesce(m.price, 0) * q; cnt := cnt + q;
  end loop;
  if cnt = 0 then raise exception 'السلة فارغة'; end if;
  -- البيانات الشخصية للطلبات القديمة تُمسح بعد ٣٠ يوماً (يبقى المبلغ للحساب الشهري)
  update orders set customer_name = null, customer_phone = null, landmark = null, lat = null, lng = null, note = null
    where created_at < now() - interval '30 days' and customer_phone is not null;
  insert into orders (business_id, total, items, status, customer_name, customer_phone, landmark, lat, lng, note, lines)
  values (p_business, least(tot, 10000000), least(cnt, 500), 'new', nullif(left(trim(coalesce(p_name, '')), 60), ''), p_phone, left(trim(p_landmark), 300),
          case when p_lat between 29 and 38 and p_lng between 38 and 49 then p_lat end,
          case when p_lat between 29 and 38 and p_lng between 38 and 49 then p_lng end,
          nullif(left(trim(coalesce(p_note, '')), 300), ''), out_lines)
  returning token into t;
  return t;
end $$;
