// يقرأ إعلانات النسخة الثابتة من ملفات content/listings/*.md ويتحقق منها بنفس قواعد الموقع الكامل.
// الملف = رأس YAML بين سطري --- ثم الوصف. أي خطأ يوقف البناء ولا يُنشر شيء ناقص.
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import type { DB } from '../db/index.ts';
import { normalizeArabic } from '../lib/arabic.ts';
import { storeImage } from '../lib/images.ts';
import { parsePostForm, reindex } from '../domain/posts.ts';
import { cleanSetting, saveSettings } from '../domain/settings.ts';
import { TYPES, isPostType, type PostType } from '../domain/types.ts';
import { parseMenuText, type MenuLine } from './menu-text.ts';

export interface ContentResult { published: number; skipped: string[]; errors: string[] }

// المفاتيح الخاصة بكل قسم كما تُكتب في الملف (تقابل حقول d_ في نموذج الموقع)
const DETAIL_KEYS: Record<PostType, string[]> = {
  business: ['address', 'hours', 'services', 'delivery', 'lat', 'lng'],
  job: ['workplace', 'employment', 'work_hours', 'requirements', 'positions'],
  property: ['offer', 'size', 'landmark', 'rooms'],
  service: ['work_areas', 'experience', 'hours', 'home_visit'],
  market: ['condition', 'negotiable'],
  offer: ['shop_name', 'old_price', 'valid_days'],
  community: ['event_date', 'location', 'organizer', 'source_name', 'source_url'],
  help: ['blood_type', 'location', 'units', 'needed_by', 'contact_name'],
};
const COMMON = ['id', 'type', 'title', 'category', 'area', 'date', 'expires', 'price', 'phone', 'show_phone', 'whatsapp', 'images', 'featured', 'featured_until', 'logo', 'verified', 'official', 'menu', 'consent', 'phone_consent'];

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const toUnix = (d: string) => Math.floor(Date.parse(d + 'T09:00:00+03:00') / 1000);
const str = (v: unknown) => (v === null || v === undefined ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v));

export async function loadContent(db: DB, contentDir: string, uploadDir: string, nowSec = Math.floor(Date.now() / 1000)): Promise<ContentResult> {
  const out: ContentResult = { published: 0, skipped: [], errors: [] };
  const sys = Number(db.prepare("INSERT INTO users (name, phone, password_hash, role) VALUES ('الإدارة', '07000000000', '!', 'super_admin') RETURNING id").pluck().get());

  const settingsFile = path.join(contentDir, 'settings.yml');
  if (fs.existsSync(settingsFile)) {
    const raw = YAML.parse(fs.readFileSync(settingsFile, 'utf8')) ?? {};
    const values: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const r = cleanSetting(k, str(v));
      if ('error' in r) out.errors.push(`settings.yml: ${r.error}`); else values[k] = r.value;
    }
    saveSettings(db, values, sys);
  }

  const dir = path.join(contentDir, 'listings');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort() : [];
  const seen = new Set<number>();
  for (const file of files) {
    const fail = (msg: string) => out.errors.push(`${file}: ${msg}`);
    const text = fs.readFileSync(path.join(dir, file), 'utf8').replace(/\r\n/g, '\n');
    const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!m) { fail('يجب أن يبدأ الملف بسطر --- ثم البيانات ثم سطر ---'); continue; }
    let fm: Record<string, unknown>;
    try { fm = YAML.parse(m[1]) ?? {}; } catch (e) { fail(`صيغة البيانات غير صحيحة: ${(e as Error).message.split('\n')[0]}`); continue; }
    const type = fm.type;
    if (!isPostType(type)) { fail(`type يجب أن يكون واحداً من: ${Object.keys(TYPES).join(', ')}`); continue; }
    const unknown = Object.keys(fm).filter((k) => !COMMON.includes(k) && !DETAIL_KEYS[type].includes(k));
    if (unknown.length) { fail(`حقول غير معروفة: ${unknown.join(', ')}`); continue; }
    const id = Number(fm.id);
    if (!Number.isInteger(id) || id < 1 || id > 999_999_999) { fail('id رقم صحيح بين 1 و999999999'); continue; }
    if (seen.has(id)) { fail(`id ${id} مكرر في ملف آخر`); continue; }
    seen.add(id);
    const date = str(fm.date);
    if (!DATE.test(date)) { fail('date بصيغة YYYY-MM-DD مطلوب'); continue; }
    const expires = fm.expires ? str(fm.expires) : '';
    if (expires && !DATE.test(expires)) { fail('expires بصيغة YYYY-MM-DD'); continue; }
    const publishedAt = toUnix(date);
    const days = TYPES[type].expiryDays;
    const expiresAt = expires ? toUnix(expires) + 86400 : days ? publishedAt + days * 86400 : null;
    if (expiresAt !== null && expiresAt <= nowSec) { out.skipped.push(`${file}: منتهي (${expires || 'المدة الافتراضية'})`); continue; }

    const catName = str(fm.category).trim();
    const cat = db.prepare('SELECT id FROM categories WHERE section = ? AND name = ? AND active = 1').pluck().get(type, catName) as number | undefined;
    if (!cat) {
      const names = (db.prepare('SELECT name FROM categories WHERE section = ? AND active = 1 ORDER BY sort').pluck().all(type) as string[]).join('، ');
      fail(`category «${catName}» غير موجود. المتاح: ${names}`); continue;
    }
    const areaName = (str(fm.area) || 'المعامل').trim().replace(/\s+/g, ' ');
    if (areaName.length < 2 || areaName.length > 60 || /[<>]/.test(areaName)) { fail('area من ٢ إلى ٦٠ حرفاً'); continue; }
    db.prepare('INSERT OR IGNORE INTO areas (name, sort) VALUES (?, (SELECT coalesce(max(sort), 0) + 1 FROM areas))').run(areaName);
    const area = db.prepare('SELECT id FROM areas WHERE name = ?').pluck().get(areaName) as number;

    const on = (v: unknown, def = false) => ((v === undefined ? def : v === true || v === 'true' || v === 'نعم') ? 'on' : undefined);
    const form: Record<string, unknown> = {
      title: str(fm.title), body: m[2].trim(), category_id: String(cat), area_id: String(area), price: str(fm.price),
      contact_phone: str(fm.phone), show_phone: on(fm.show_phone, !!fm.phone && type !== 'help'), whatsapp: on(fm.whatsapp, !!fm.phone),
    };
    for (const k of DETAIL_KEYS[type]) if (fm[k] !== undefined) form['d_' + k] = fm[k] === true ? 'on' : fm[k] === false ? '' : str(fm[k]);
    if (type === 'help') { form.d_consent = on(fm.consent); form.d_phone_consent = on(fm.phone_consent); }
    for (const k of Object.keys(form)) if (form[k] === undefined || form[k] === '') delete form[k];
    const parsed = parsePostForm(type, form);
    if (!parsed.ok) { fail(parsed.errors.join(' | ')); continue; }
    const v = parsed.value;

    // الصور: من content/images فقط، وتُعاد ترميزها WebP مع حذف بيانات الموقع
    const names = Array.isArray(fm.images) ? fm.images.map(str) : str(fm.images).split(',').map((x) => x.trim()).filter(Boolean);
    const images: Awaited<ReturnType<typeof storeImage>>[] = [];
    let imgError = '';
    for (const n of names.slice(0, 6)) {
      if (!/^[\w\-. ]+\.(jpe?g|png|webp)$/i.test(n)) { imgError = `اسم صورة غير صالح: ${n}`; break; }
      const f = path.join(contentDir, 'images', n);
      if (!fs.existsSync(f)) { imgError = `الصورة غير موجودة في content/images: ${n}`; break; }
      try { images.push(await storeImage(fs.readFileSync(f), uploadDir)); } catch (e) { imgError = `${n}: ${(e as Error).message}`; break; }
    }
    if (imgError) { fail(imgError); continue; }

    // شعار المحل: صورة واحدة من content/images تظهر بجانب اسمه
    let logoThumb: string | null = null;
    if (fm.logo !== undefined) {
      const n = str(fm.logo).trim();
      if (type !== 'business') { fail('logo للمحلات فقط'); continue; }
      if (!/^[\w\-. ]+\.(jpe?g|png|webp)$/i.test(n)) { fail(`اسم شعار غير صالح: ${n}`); continue; }
      const f = path.join(contentDir, 'images', n);
      if (!fs.existsSync(f)) { fail(`الشعار غير موجود في content/images: ${n}`); continue; }
      try { logoThumb = (await storeImage(fs.readFileSync(f), uploadDir)).thumb; } catch (e) { fail(`${n}: ${(e as Error).message}`); continue; }
    }
    const featuredUntil = fm.featured_until ? str(fm.featured_until) : '';
    if (featuredUntil && !DATE.test(featuredUntil)) { fail('featured_until بصيغة YYYY-MM-DD'); continue; }

    let menu: MenuLine[] = [];
    if (fm.menu !== undefined) {
      if (type !== 'business') { fail('menu للمحلات فقط'); continue; }
      const lines = Array.isArray(fm.menu) ? fm.menu.map(str) : str(fm.menu).split('\n');
      const parsed = parseMenuText(lines);
      if (parsed.error) { fail(parsed.error); continue; }
      menu = parsed.items;
    }

    db.transaction(() => {
      db.prepare(`INSERT INTO posts (id, type, user_id, category_id, area_id, title, body, price, contact_phone, show_phone, whatsapp, details, status, title_key, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`).run(id, type, sys, v.category_id, v.area_id, v.title, v.body, v.price,
        v.contact_phone, v.show_phone ? 1 : 0, v.whatsapp ? 1 : 0, JSON.stringify(v.details), normalizeArabic(v.title), publishedAt, publishedAt);
      db.prepare("UPDATE posts SET status = 'published', approved_by = ?, approved_at = ?, published_at = ?, expires_at = ? WHERE id = ?").run(sys, publishedAt, publishedAt, expiresAt, id);
      if (fm.verified === true && (type === 'business' || type === 'help')) db.prepare('UPDATE posts SET verified = 1, verified_by = ?, verified_at = ? WHERE id = ?').run(sys, publishedAt, id);
      if (fm.official === true && type === 'community') db.prepare('UPDATE posts SET is_official = 1, verified_by = ? WHERE id = ?').run(sys, id);
      images.forEach((im, i) => db.prepare('INSERT INTO post_images (post_id, file, thumb, width, height, sort) VALUES (?, ?, ?, ?, ?, ?)').run(id, im.file, im.thumb, im.width, im.height, i));
      menu.forEach((it, i) => db.prepare('INSERT INTO post_items (post_id, name, price, note, section, sort) VALUES (?, ?, ?, ?, ?, ?)').run(id, it.name, it.price, it.note, it.section, i));
      if (logoThumb) db.prepare('UPDATE posts SET logo = ? WHERE id = ?').run(logoThumb, id);
      if (featuredUntil && toUnix(featuredUntil) + 86400 > nowSec) {
        for (const placement of ['home', 'section']) {
          db.prepare('INSERT INTO featured_listings (post_id, placement, starts_at, ends_at, note, created_by) VALUES (?, ?, ?, ?, ?, ?)')
            .run(id, placement, Math.min(publishedAt, nowSec), toUnix(featuredUntil) + 86400, 'تمييز مدفوع', sys);
        }
      }
      if (fm.featured === true) db.prepare("INSERT INTO featured_listings (post_id, placement, starts_at, ends_at, created_by) VALUES (?, 'home', ?, ?, ?)").run(id, publishedAt, expiresAt ?? publishedAt + 365 * 86400, sys);
      reindex(db, id);
    })();
    out.published++;
  }
  return out;
}
