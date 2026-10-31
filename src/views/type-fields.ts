// حقول كل قسم: كل قسم له حقوله الخاصة (مساعدة، وظيفة، عقار...) بدل حقول عامة واحدة للجميع.
// مصدر واحد تستخدمه نماذج الإضافة كلها (واتساب، المباشر عبر Supabase، وصفحة نشر الإدارة).
import { html, type SafeHtml } from '../lib/html.ts';
import type { PostType } from '../domain/types.ts';
import { checkbox, field, select, textarea } from './components.ts';

export interface FieldSpec {
  key: string; label: string;
  kind: 'text' | 'textarea' | 'select' | 'date' | 'number' | 'check';
  options?: [string, string][]; hint?: string; required?: boolean; max?: number; def?: string;
}

export const EMPLOYMENT_OPTIONS: [string, string][] = [['full', 'دوام كامل'], ['part', 'دوام جزئي'], ['daily', 'عمل يومي'], ['training', 'تدريب'], ['freelance', 'عمل حر']];
export const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export const TYPE_FIELDS: Record<PostType, FieldSpec[]> = {
  business: [
    { key: 'address', label: 'العنوان التفصيلي', kind: 'text', required: true, max: 200, hint: 'الشارع أو أقرب نقطة دالة' },
    { key: 'hours', label: 'ساعات العمل', kind: 'text', max: 200, hint: 'مثال: يومياً من ٩ الصبح لـ ١١ بالليل' },
    { key: 'services', label: 'الخدمات أو المنتجات الرئيسية', kind: 'textarea', max: 1000 },
    { key: 'delivery', label: 'مناطق التوصيل', kind: 'text', max: 300, hint: 'إذا عندك توصيل' },
  ],
  job: [
    { key: 'workplace', label: 'مكان العمل', kind: 'text', required: true, max: 150, hint: 'اسم المحل أو المطعم أو المعمل' },
    { key: 'employment', label: 'نوع الدوام', kind: 'select', required: true, options: EMPLOYMENT_OPTIONS, def: 'full' },
    { key: 'work_hours', label: 'ساعات العمل', kind: 'text', max: 100, hint: 'مثال: من ٨ الصبح لـ ٤ العصر' },
    { key: 'positions', label: 'عدد الشواغر', kind: 'number', max: 3 },
    { key: 'requirements', label: 'الشروط والمؤهلات', kind: 'textarea', max: 1000, hint: 'الخبرة، الشهادة، العمر...' },
  ],
  property: [
    { key: 'offer', label: 'نوع العرض', kind: 'select', required: true, options: [['sale', 'بيع'], ['rent', 'إيجار']], def: 'sale' },
    { key: 'size', label: 'المساحة (م²)', kind: 'number', max: 6 },
    { key: 'rooms', label: 'عدد الغرف', kind: 'number', max: 2 },
    { key: 'landmark', label: 'أقرب نقطة دالة', kind: 'text', max: 100, hint: 'لا تكتب رقم الدار. يكفي اسم الشارع أو أقرب معلم.' },
  ],
  service: [
    { key: 'work_areas', label: 'المناطق اللي تشتغل بيها', kind: 'text', max: 300 },
    { key: 'hours', label: 'أوقات العمل', kind: 'text', max: 200 },
    { key: 'experience', label: 'الخبرة', kind: 'text', max: 300, hint: 'مثال: ١٠ سنوات بصيانة المكيفات' },
    { key: 'home_visit', label: 'أجي للبيت (خدمة منزلية)', kind: 'check' },
  ],
  market: [
    { key: 'condition', label: 'حالة الغرض', kind: 'select', required: true, options: [['used', 'مستعمل'], ['new', 'جديد']], def: 'used' },
    { key: 'negotiable', label: 'السعر قابل للتفاوض', kind: 'check' },
  ],
  offer: [
    { key: 'shop_name', label: 'اسم المحل صاحب العرض', kind: 'text', required: true, max: 100 },
    { key: 'old_price', label: 'السعر قبل العرض (د.ع)', kind: 'number', max: 11 },
    { key: 'valid_days', label: 'مدة العرض بالأيام', kind: 'number', required: true, max: 2, hint: 'من ١ إلى ٣٠ يوماً', def: '7' },
  ],
  community: [
    { key: 'event_date', label: 'تاريخ الفعالية', kind: 'date' },
    { key: 'location', label: 'المكان', kind: 'text', max: 150 },
    { key: 'organizer', label: 'الجهة المنظمة', kind: 'text', max: 100 },
  ],
  help: [
    { key: 'blood_type', label: 'فصيلة الدم المطلوبة', kind: 'select', options: BLOOD_TYPES.map((b) => [b, b]), hint: 'اتركها فارغة إذا الطلب مو تبرع بالدم' },
    { key: 'units', label: 'العدد المطلوب', kind: 'number', max: 3, hint: 'مثال: عدد قناني الدم' },
    { key: 'location', label: 'المستشفى أو المكان العام', kind: 'text', max: 150, hint: 'بدون رقم الردهة أو الغرفة' },
    { key: 'needed_by', label: 'مطلوب قبل تاريخ', kind: 'date' },
    { key: 'contact_name', label: 'اسم الشخص المسؤول عن الطلب', kind: 'text', max: 60, hint: 'قريب أو صديق، يظهر حتى يعرف المتبرع مع منو يحچي' },
    { key: 'consent', label: 'أؤكد أن صاحب الحالة (أو ولي أمره) وافق على نشر الطلب', kind: 'check', required: true },
    { key: 'phone_consent', label: 'صاحب الرقم وافق على عرضه علناً', kind: 'check' },
  ],
};

/** عنوان الإعلان وتفاصيله ونص السعر بكلمات تناسب كل قسم. */
export const TYPE_TEXT: Record<PostType, { title: string; titleHint: string; body: string; bodyHint: string; price?: string }> = {
  business: { title: 'اسم المحل', titleHint: 'مثال: أسواق النور', body: 'نبذة عن المحل', bodyHint: 'شنو تبيع أو تقدم' },
  job: { title: 'المسمى الوظيفي', titleHint: 'مثال: مطلوب كاشير لمطعم', body: 'تفاصيل العمل', bodyHint: 'طبيعة العمل والمهام', price: 'الراتب الشهري (د.ع)' },
  property: { title: 'عنوان العقار', titleHint: 'مثال: بيت ٢٠٠م للبيع قرب جامع ...', body: 'وصف العقار', bodyHint: 'عدد الطوابق، الواجهة، السند، الخدمات...', price: 'السعر أو الإيجار الشهري (د.ع)' },
  service: { title: 'الخدمة أو المهنة', titleHint: 'مثال: كهربائي منازل', body: 'وصف الخدمة', bodyHint: 'شنو تشتغل وشلون' },
  market: { title: 'اسم الغرض', titleHint: 'مثال: ثلاجة سامسونج ١٨ قدم', body: 'وصف الغرض', bodyHint: 'الموديل، مدة الاستعمال، العيوب إن وجدت', price: 'السعر (د.ع)' },
  offer: { title: 'عنوان العرض', titleHint: 'مثال: خصم ٢٠٪ على كل البيتزا', body: 'تفاصيل العرض', bodyHint: 'على شنو العرض وشروطه', price: 'سعر العرض (د.ع)' },
  community: { title: 'عنوان الخبر أو الفعالية', titleHint: 'مثال: حملة تنظيف شارع ٢٠ يوم الجمعة', body: 'التفاصيل', bodyHint: 'شنو صار أو شنو راح يصير' },
  help: { title: 'عنوان الطلب', titleHint: 'مثال: مطلوب متبرع دم O+ بمستشفى ...', body: 'وصف الحالة', bodyHint: 'لا تكتب اسم المريض الكامل ولا ترفع وثائق طبية' },
};

/**
 * حقول قسم واحد داخل مجموعة تظهر فقط عند اختيار القسم.
 * prefix: «d_» لنماذج الإرسال، أو «<type>_» لصفحة نشر الإدارة.
 */
export function typeFieldGroup(type: PostType, prefix: string, values: Record<string, string | undefined> = {}): SafeHtml {
  const specs = TYPE_FIELDS[type];
  if (!specs.length) return html``;
  return html`<div data-for="${type}" hidden>${specs.map((f) => renderField(f, prefix + f.key, values[prefix + f.key] ?? f.def))}</div>`;
}

function renderField(f: FieldSpec, name: string, value?: string): SafeHtml {
  switch (f.kind) {
    case 'textarea': return textarea({ name, label: f.label, value, required: f.required, max: f.max, rows: 3, hint: f.hint });
    case 'select': return select({ name, label: f.label, value, required: !!f.required, placeholder: f.required ? 'اختر' : 'لا ينطبق', options: f.options ?? [], hint: f.hint });
    case 'check': return checkbox({ name, label: f.label, checked: value === 'on', hint: f.hint });
    case 'date': return field({ name, label: f.label, value, type: 'date', required: f.required, hint: f.hint });
    case 'number': return field({ name, label: f.label, value, required: f.required, hint: f.hint, attrs: `inputmode="numeric" maxlength="${f.max ?? 6}"` });
    default: return field({ name, label: f.label, value, required: f.required, max: f.max, hint: f.hint });
  }
}

/** بيانات JSON لتسميات الحقول (للرسائل والملفات من المتصفح). */
export const typeLabelsJson = (): string => JSON.stringify(Object.fromEntries(Object.entries(TYPE_FIELDS)
  .map(([t, fs]) => [t, Object.fromEntries(fs.map((f) => [f.key, { l: f.label, o: f.options ? Object.fromEntries(f.options) : undefined, c: f.kind === 'check' }]))])));
export const typeTextJson = (): string => JSON.stringify(TYPE_TEXT);
