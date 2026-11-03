// نسخة احتياطية يومية من قاعدة البيانات + صيانة (يشغّلها .github/workflows/backup.yml).
// يحتاج سرّين بإعدادات GitHub (ما ينكتبون بأي ملف): SUPABASE_SERVICE_KEY و BACKUP_PASSWORD.
// الناتج ملف JSON مضغوط، يتشفّر بعدين بـ openssl بكلمة BACKUP_PASSWORD قبل ما ينرفع.
//   node scripts/supabase-backup.ts backup  <ملف>   ← ينسخ الجداول وصور الهويات (الخاصة)
//   node scripts/supabase-backup.ts cleanup         ← يمسح الصور اليتيمة والبيانات القديمة
import fs from 'node:fs';
import zlib from 'node:zlib';

const cfg = JSON.parse(fs.readFileSync('site.config.json', 'utf8')) as { supabaseUrl: string };
const URL_ = (process.env.SUPABASE_URL || cfg.supabaseUrl).replace(/\/+$/, '');
const KEY = process.env.SUPABASE_SERVICE_KEY ?? '';
if (!KEY) { console.error('SUPABASE_SERVICE_KEY غير موجود بأسرار GitHub. شوف docs/BACKUP.md'); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function req(path: string, init: RequestInit = {}): Promise<Response> {
  const r = await fetch(URL_ + path, { ...init, headers: { ...H, ...(init.headers ?? {}) } });
  if (!r.ok) throw new Error(`${init.method ?? 'GET'} ${path.split('?')[0]}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r;
}
async function table(name: string): Promise<unknown[]> {
  const out: unknown[] = [];
  for (let from = 0; ; from += 1000) {
    const rows = await (await req(`/rest/v1/${name}?select=*`, { headers: { Range: `${from}-${from + 999}`, 'Range-Unit': 'items' } })).json() as unknown[];
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}
async function list(bucket: string, prefix = ''): Promise<{ name: string; created_at: string }[]> {
  const out: { name: string; created_at: string }[] = [];
  for (let offset = 0; ; offset += 1000) {
    const rows = await (await req(`/storage/v1/object/list/${bucket}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } }) })).json() as { name: string; id: string | null; created_at: string }[];
    for (const r of rows) {
      const full = prefix ? `${prefix}/${r.name}` : r.name;
      if (r.id === null) out.push(...await list(bucket, full)); // مجلد
      else out.push({ name: full, created_at: r.created_at });
    }
    if (rows.length < 1000) return out;
  }
}

const TABLES = ['profiles', 'posts', 'menu_items', 'claims', 'moderation_log', 'orders', 'commission_payments', 'shop_invites',
  'riders', 'delivery_fares', 'complaints', 'ratings', 'post_views'];

async function backup(file: string) {
  const data: Record<string, unknown> = { at: new Date().toISOString(), url: URL_ };
  for (const t of TABLES) {
    try { data[t] = await table(t); } catch (e) { data[t] = { error: String((e as Error).message) }; }
  }
  // الحسابات (البريد وتاريخ التسجيل؛ كلمات السر ما تنقرأ أصلاً)
  try { data.auth_users = (await (await req('/auth/v1/admin/users?per_page=1000')).json() as { users: unknown[] }).users; } catch (e) { data.auth_users = { error: String((e as Error).message) }; }
  // الصور الخاصة (الهويات وإثباتات المحلات) تنحفظ كاملة؛ الصور العامة أسماءها بس (موجودة بالموقع نفسه)
  const proofs: Record<string, string> = {};
  for (const o of await list('proofs')) proofs[o.name] = Buffer.from(await (await req(`/storage/v1/object/proofs/${o.name}`)).arrayBuffer()).toString('base64');
  data.proofs = proofs;
  data.media = (await list('media')).map((o) => o.name);
  fs.writeFileSync(file, zlib.gzipSync(JSON.stringify(data)));
  const counts = TABLES.map((t) => `${t}=${Array.isArray(data[t]) ? (data[t] as unknown[]).length : 'خطأ'}`).join(' ');
  console.log(`النسخة جاهزة: ${counts} proofs=${Object.keys(proofs).length} media=${(data.media as string[]).length}`);
  if (TABLES.some((t) => !Array.isArray(data[t]) && ['posts', 'menu_items', 'riders'].includes(t))) throw new Error('جدول أساسي ما انقرأ');
}

// الصور الي ما يستخدمها أي شي (إعلان ما كمل، صورة انشالت، تسجيل دلفري ما كمل) تنمسح بعد ٣ أيام.
// حماية: إذا ما انقرأت الجداول كاملة ما نمسح شي، وأكثر شي ٣٠٠ ملف بالمرة.
async function cleanup() {
  console.log('صيانة قاعدة البيانات:', JSON.stringify(await (await req('/rest/v1/rpc/maintenance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json()));
  const posts = await table('posts') as { images: string[] | null; logo: string | null; status: string; updated_at: string }[];
  const menu = await table('menu_items') as { image: string | null }[];
  const claims = await table('claims') as { proof_path: string | null }[];
  const riders = await table('riders') as { id_front: string; id_back: string }[];
  if (!posts.length) { console.log('ما كو منشورات؟ ما نمسح شي احتياطاً.'); return; }
  const old = Date.now() - 30 * 864e5;
  const used = new Set<string>();
  for (const p of posts) {
    // صور الإعلانات المرفوضة أو المحذوفة من شهر وأكثر ما تنحسب مستخدمة
    if (['rejected', 'removed'].includes(p.status) && new Date(p.updated_at).getTime() < old) continue;
    for (const i of p.images ?? []) used.add('media/' + i);
    if (p.logo) used.add('media/' + p.logo);
  }
  for (const m of menu) if (m.image) used.add('media/' + m.image);
  for (const c of claims) if (c.proof_path) used.add('proofs/' + c.proof_path);
  for (const r of riders) { used.add('proofs/' + r.id_front); used.add('proofs/' + r.id_back); }
  const cutoff = Date.now() - 3 * 864e5;
  const orphans: string[] = [];
  for (const bucket of ['media', 'proofs']) {
    for (const o of await list(bucket)) {
      const key = `${bucket}/${o.name}`;
      if (!used.has(key) && new Date(o.created_at).getTime() < cutoff && /[0-9a-f]{32}\.webp$/.test(o.name)) orphans.push(key);
    }
  }
  const batch = orphans.slice(0, 300);
  for (const bucket of ['media', 'proofs']) {
    const names = batch.filter((k) => k.startsWith(bucket + '/')).map((k) => k.slice(bucket.length + 1));
    if (names.length) await req(`/storage/v1/object/${bucket}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: names }) });
  }
  console.log(`صور يتيمة: ${orphans.length}، انمسح منها ${batch.length}.`);
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === 'backup') await backup(arg || 'backup.json.gz');
else if (cmd === 'cleanup') await cleanup();
else { console.error('الاستخدام: backup <ملف> | cleanup'); process.exit(2); }
