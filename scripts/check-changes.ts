// يُشغَّل كل ربع ساعة في GitHub Actions: يقارن بصمة بيانات Supabase بالبصمة المنشورة في الموقع،
// ويقرر هل نعيد البناء. الاستعلام نفسه يُبقي مشروع Supabase المجاني نشطاً. بلا تبعيات.
import fs from 'node:fs';

const out = (k: string, v: string) => { if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`); console.log(`${k}=${v}`); };
const event = process.env.EVENT ?? 'manual';
if (event !== 'schedule') { out('build', 'true'); process.exit(0); }

const cfg = fs.existsSync('site.config.json') ? JSON.parse(fs.readFileSync('site.config.json', 'utf8')) as { supabaseUrl?: string; supabaseAnonKey?: string } : {};
if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
  // بلا Supabase: إعادة بناء يومية فقط (لإخفاء الإعلانات المنتهية)
  const d = new Date();
  out('build', d.getUTCHours() === 21 && d.getUTCMinutes() < 15 ? 'true' : 'false');
  process.exit(0);
}
try {
  const r = await fetch(`${cfg.supabaseUrl.replace(/\/+$/, '')}/rest/v1/rpc/site_stamp`, {
    method: 'POST', headers: { apikey: cfg.supabaseAnonKey, Authorization: `Bearer ${cfg.supabaseAnonKey}`, 'Content-Type': 'application/json' }, body: '{}',
  });
  const stamp = r.ok ? String(await r.json()) : '';
  const live = await fetch(`${(process.env.SITE_URL ?? '').replace(/\/+$/, '')}/build-stamp.txt`, { cache: 'no-store' }).then((x) => (x.ok ? x.text() : ''), () => '');
  console.log(`supabase=${stamp} live=${live}`);
  out('build', stamp && stamp !== live.trim() ? 'true' : 'false');
} catch (e) {
  console.log('check failed:', (e as Error).message);
  out('build', 'false');
}
