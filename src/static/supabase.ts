// يجلب المحتوى المنشور من Supabase أثناء بناء النسخة الثابتة ويضيفه لنفس قاعدة البيانات المؤقتة.
// يقرأ فقط ما تسمح به قواعد الأمان للعامة (public_posts وقوائم المحلات المنشورة) بالمفتاح العام.
// أي صف غير صالح يُتجاوز مع رسالة، ولا يوقف بناء الموقع.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { DB } from '../db/index.ts';
import { normalizeArabic, normalizePhone } from '../lib/arabic.ts';
import { storeImage, type StoredImage } from '../lib/images.ts';
import { reindex } from '../domain/posts.ts';
import { isPostType } from '../domain/types.ts';

export interface SupabaseCfg { url: string; key: string }
interface Row {
  id: number; type: string; title: string; body: string; category: string; area: string; price: number | null;
  contact_phone: string | null; show_phone: boolean; whatsapp: boolean; details: Record<string, unknown>; images: string[];
  business_id: number | null; open_state: string; verified: boolean; is_official: boolean; published_at: string | null; expires_at: string | null; updated_at: string;
  featured_until?: string | null; logo?: string | null;
}
interface Item { id: number; business_id: number; section: string; name: string; price: number | null; note: string; image: string | null; available: boolean; sort: number }

const DETAIL_KEYS = new Set(['address', 'hours', 'services', 'delivery', 'lat', 'lng', 'workplace', 'employment', 'work_hours', 'requirements',
  'offer', 'size', 'landmark', 'work_areas', 'experience', 'condition', 'event_date', 'location', 'organizer', 'source_name', 'source_url', 'blood_type', 'consent',
  'positions', 'rooms', 'home_visit', 'negotiable', 'shop_name', 'old_price', 'units', 'needed_by', 'contact_name']);
const PATH = /^(guest\/|u\/[0-9a-f-]{36}\/)[0-9a-f]{32}\.webp$/;

async function get<T>(cfg: SupabaseCfg, rel: string): Promise<T> {
  const r = await fetch(`${cfg.url}/rest/v1/${rel}`, { headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` } });
  if (!r.ok) throw new Error(`Supabase ${rel.split('?')[0]}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json() as Promise<T>;
}

export async function siteStamp(cfg: SupabaseCfg): Promise<string> {
  const r = await fetch(`${cfg.url}/rest/v1/rpc/site_stamp`, { method: 'POST', headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}`, 'Content-Type': 'application/json' }, body: '{}' });
  if (!r.ok) throw new Error(`site_stamp: ${r.status}`);
  return String(await r.json());
}

/** ينزّل صورة من مخزن media العام (مع ذاكرة محلية) ويعيد ترميزها بنفس معالجة الموقع. */
async function image(cfg: SupabaseCfg, p: string, cacheDir: string, uploadDir: string): Promise<StoredImage | null> {
  if (!PATH.test(p)) return null;
  const cached = path.join(cacheDir, crypto.createHash('sha256').update(p).digest('hex') + '.webp');
  let buf: Buffer;
  if (fs.existsSync(cached)) buf = fs.readFileSync(cached);
  else {
    const r = await fetch(`${cfg.url}/storage/v1/object/public/media/${p}`);
    if (!r.ok) return null;
    buf = Buffer.from(await r.arrayBuffer());
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(cached, buf);
  }
  try { return await storeImage(buf, uploadDir); } catch { return null; }
}

export async function loadSupabase(db: DB, cfg: SupabaseCfg, uploadDir: string, cacheDir: string, log: (s: string) => void): Promise<{ published: number; skipped: number }> {
  const sys = db.prepare("SELECT id FROM users WHERE phone = '07000000000'").pluck().get() as number
    ?? Number(db.prepare("INSERT INTO users (name, phone, password_hash, role) VALUES ('الإدارة', '07000000000', '!', 'super_admin') RETURNING id").pluck().get());
  const rows = await get<Row[]>(cfg, 'public_posts?select=*&order=id.asc&limit=5000');
  const ids = new Set<number>();
  let published = 0, skipped = 0;
  const skip = (r: Row, why: string) => { skipped++; log(`تخطي منشور ${r.id} «${String(r.title).slice(0, 40)}»: ${why}`); };
  // المحلات أولاً حتى ترتبط بها العروض
  rows.sort((a, b) => (a.type === 'business' ? 0 : 1) - (b.type === 'business' ? 0 : 1) || a.id - b.id);
  for (const r of rows) {
    if (!isPostType(r.type)) { skip(r, 'نوع غير معروف'); continue; }
    const cat = db.prepare('SELECT id FROM categories WHERE section = ? AND name = ? AND active = 1').pluck().get(r.type, r.category) as number | undefined;
    if (!cat) { skip(r, `تصنيف غير معروف: ${r.category}`); continue; }
    const area = String(r.area || 'المعامل').trim().slice(0, 60);
    db.prepare('INSERT OR IGNORE INTO areas (name, sort) VALUES (?, (SELECT coalesce(max(sort), 0) + 1 FROM areas))').run(area);
    const areaId = db.prepare('SELECT id FROM areas WHERE name = ?').pluck().get(area) as number;
    const details: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(r.details ?? {})) {
      if (!DETAIL_KEYS.has(k) || v === null || v === '' || typeof v === 'object') continue;
      details[k] = typeof v === 'number' ? v : String(v).slice(0, 1000);
    }
    const phone = r.contact_phone ? normalizePhone(r.contact_phone) : null;
    const pub = r.published_at ? Math.floor(Date.parse(r.published_at) / 1000) : Math.floor(Date.now() / 1000);
    const exp = r.expires_at ? Math.floor(Date.parse(r.expires_at) / 1000) : null;
    const images: StoredImage[] = [];
    for (const p of (r.images ?? []).slice(0, 6)) { const im = await image(cfg, p, cacheDir, uploadDir); if (im) images.push(im); }
    const logo = r.type === 'business' && r.logo ? await image(cfg, r.logo, cacheDir, uploadDir) : null;
    const featuredUntil = r.featured_until ? Math.floor(Date.parse(r.featured_until) / 1000) : 0;
    try {
      db.transaction(() => {
        db.prepare(`INSERT INTO posts (id, type, user_id, category_id, area_id, title, body, price, contact_phone, show_phone, whatsapp, details, status, title_key, business_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`).run(r.id, r.type, sys, cat, areaId, String(r.title).slice(0, 100), String(r.body ?? '').slice(0, 4000),
          r.price, phone, phone && r.show_phone ? 1 : 0, phone && r.whatsapp ? 1 : 0, JSON.stringify(details), normalizeArabic(r.title),
          r.type === 'offer' && r.business_id && ids.has(r.business_id) ? r.business_id : null, pub, Math.floor(Date.parse(r.updated_at) / 1000) || pub);
        db.prepare("UPDATE posts SET status = 'published', approved_by = ?, approved_at = ?, published_at = ?, expires_at = ?, open_state = ? WHERE id = ?")
          .run(sys, pub, pub, exp, ['open', 'closed', 'unknown'].includes(r.open_state) ? r.open_state : 'unknown', r.id);
        if (r.verified && (r.type === 'business' || r.type === 'help')) db.prepare('UPDATE posts SET verified = 1, verified_by = ?, verified_at = ? WHERE id = ?').run(sys, pub, r.id);
        if (r.is_official && r.type === 'community') db.prepare('UPDATE posts SET is_official = 1, verified_by = ? WHERE id = ?').run(sys, r.id);
        images.forEach((im, i) => db.prepare('INSERT INTO post_images (post_id, file, thumb, width, height, sort) VALUES (?, ?, ?, ?, ?, ?)').run(r.id, im.file, im.thumb, im.width, im.height, i));
        if (logo) db.prepare('UPDATE posts SET logo = ? WHERE id = ?').run(logo.thumb, r.id);
        // التمييز المدفوع: أول الصفحة الرئيسية وأول قسمه حتى انتهاء المدة
        const nowSec = Math.floor(Date.now() / 1000);
        if (featuredUntil > nowSec) {
          for (const placement of ['home', 'section']) {
            db.prepare('INSERT INTO featured_listings (post_id, placement, starts_at, ends_at, note, created_by) VALUES (?, ?, ?, ?, ?, ?)')
              .run(r.id, placement, Math.min(pub, nowSec), featuredUntil, 'تمييز مدفوع', sys);
          }
        }
      })();
      ids.add(r.id);
      published++;
    } catch (e) { skip(r, (e as Error).message); }
  }

  // قوائم الطعام والمنتجات للمحلات المنشورة
  const biz = [...ids].filter((id) => db.prepare("SELECT 1 FROM posts WHERE id = ? AND type = 'business'").get(id));
  for (let i = 0; i < biz.length; i += 100) {
    const items = await get<Item[]>(cfg, `menu_items?select=*&business_id=in.(${biz.slice(i, i + 100).join(',')})&order=business_id,sort,id&limit=30000`);
    for (const it of items) {
      const im = it.image ? await image(cfg, it.image, cacheDir, uploadDir) : null;
      db.prepare('INSERT INTO post_items (post_id, name, price, note, section, available, image, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(it.business_id, String(it.name).slice(0, 80), it.price, String(it.note ?? '').slice(0, 200), String(it.section ?? '').slice(0, 60), it.available ? 1 : 0, im?.file ?? null, it.sort ?? 0);
    }
  }
  for (const id of biz) reindex(db, id);
  return { published, skipped };
}
