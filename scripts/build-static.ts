// يبني نسخة GitHub Pages الثابتة في مجلد dist/ من نفس صفحات الموقع ومن إعلانات content/.
//   SITE_URL=https://user.github.io/almamel node scripts/build-static.ts
// إذا لم يُحدد SITE_URL يُستنتج من GITHUB_REPOSITORY، وإلا http://localhost:8080 للمعاينة المحلية.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { openDatabase } from '../src/db/index.ts';
import { listPublic } from '../src/domain/posts.ts';
import { POLICIES, sectionEnabled, loadSettings } from '../src/domain/settings.ts';
import { TYPES, TYPE_KEYS } from '../src/domain/types.ts';
import { loadContent } from '../src/static/content.ts';
import { loadSupabase, siteStamp, type SupabaseCfg } from '../src/static/supabase.ts';
import { postUrl } from '../src/views/components.ts';

export async function buildStatic(opts: { siteUrl: string; contentDir: string; outDir: string; repo: string; quiet?: boolean; supabase?: SupabaseCfg | null; cacheDir?: string;
  /** موقع الإدارة المنفصل: صفحات الإدارة فقط، بلا محتوى عام. publicUrl رابط الموقع العام. */
  admin?: { publicUrl: string };
  /** صفحة تسجيل المحلات الخاصة: صفحة واحدة تُرسل للزبون، وطلبه يصل للإدارة. */
  register?: { publicUrl: string } }) {
  const log = (s: string) => { if (!opts.quiet) console.log(s); };
  const siteUrl = opts.siteUrl.replace(/\/+$/, '');
  const base = new URL(siteUrl).pathname.replace(/\/+$/, '');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'almamel-build-'));
  const uploadDir = path.join(tmp, 'media');
  const db = openDatabase(':memory:');
  try {
    const side = opts.admin ?? opts.register;
    if (side && !opts.supabase) throw new Error('موقع الإدارة وصفحة التسجيل يحتاجان إعداد Supabase في site.config.json');
    const content = side ? { published: 0, skipped: [], errors: [] } : await loadContent(db, opts.contentDir, uploadDir);
    for (const s of content.skipped) log(`تخطي: ${s}`);
    if (content.errors.length) throw new Error('أخطاء في ملفات الإعلانات:\n- ' + content.errors.join('\n- '));
    log(`إعلانات منشورة من الملفات: ${content.published}`);
    let stamp = '';
    if (opts.supabase && !side) {
      const sbr = await loadSupabase(db, opts.supabase, uploadDir, opts.cacheDir ?? path.join(tmp, 'cache'), log);
      stamp = await siteStamp(opts.supabase);
      log(`منشورات من Supabase: ${sbr.published}${sbr.skipped ? ` (تم تخطي ${sbr.skipped})` : ''}`);
    }

    const cfg = loadConfig({ env: 'development', baseUrl: siteUrl, databasePath: ':memory:', uploadDir, cookieSecure: false, adminRequireMfa: false, staticMode: true, repo: opts.repo,
      supabaseUrl: opts.supabase?.url ?? '', supabaseAnonKey: opts.supabase?.key ?? '', adminSite: !!opts.admin, registerSite: !!opts.register, publicUrl: side?.publicUrl ?? '' },
      { SESSION_SECRET: crypto.randomBytes(32).toString('hex') });
    const app = await buildApp(cfg, { db, logger: false, jobs: false });

    const settings = loadSettings(db);
    // الموقع العام لا يحتوي تسجيل المحلات ولا لوحات التحكم؛ هذه في موقع الإدارة المنفصل فقط.
    const urls = opts.register ? ['/owner/register'] : opts.admin ? ['/login', '/admin', '/admin/business', '/admin/menu'] : ['/', '/restaurants', '/news', '/about', '/contact', '/search', '/submit', '/publish',
      ...TYPE_KEYS.map((t) => TYPES[t].path),
      ...TYPE_KEYS.filter((t) => t !== 'business' && sectionEnabled(settings, t)).map((t) => `/submit/${t}`),
      ...Object.keys(POLICIES).map((k) => `/policies/${k}`),
      ...listPublic(db, { types: [...TYPE_KEYS], perPage: 1000 }).items.map(postUrl)];

    const withBase = (s: string) => s
      .replace(/(\s(?:href|src|action|poster)=")\/(?!\/)/g, `$1${base}/`)
      .replace('<html lang="ar" dir="rtl">', `<html lang="ar" dir="rtl" data-base="${base}">`);

    fs.rmSync(opts.outDir, { recursive: true, force: true });
    fs.mkdirSync(opts.outDir, { recursive: true });
    const write = (rel: string, data: string | Buffer) => {
      const f = path.join(opts.outDir, rel);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, data);
    };

    for (const u of urls) {
      const r = await app.inject({ method: 'GET', url: u });
      if (r.statusCode !== 200) throw new Error(`الصفحة ${u} رجعت ${r.statusCode}`);
      const page = withBase(r.body);
      if (/method="post"/i.test(page)) throw new Error(`الصفحة ${u} تحتوي نموذجاً يرسل للخادم`);
      // صفحة التسجيل الخاصة تُكتب في جذر مجلدها: الرابط المرسل للزبون قصير
      write(u === '/' || opts.register ? 'index.html' : `${u.slice(1)}/index.html`, page);
    }
    if (side) {
      // الصفحة الرئيسية لموقع الإدارة تحوّل للوحة الإدارة، والموقع كله خارج محركات البحث
      if (opts.admin) write('index.html', `<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0;url=${base}/admin/"><title>الإدارة</title><a href="${base}/admin/">لوحة الإدارة</a>`);
      if (opts.admin) write('404.html', `<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0;url=${base}/admin/"><title>الإدارة</title>`);
      write('robots.txt', 'User-agent: *\nDisallow: /\n');
      write('.nojekyll', '');
      fs.cpSync(path.join(import.meta.dirname, '..', 'public'), path.join(opts.outDir, 'static'), { recursive: true });
      fs.mkdirSync(path.join(opts.outDir, 'static', 'vendor'), { recursive: true });
      fs.copyFileSync(path.join(import.meta.dirname, '..', 'node_modules', '@supabase', 'supabase-js', 'dist', 'umd', 'supabase.js'), path.join(opts.outDir, 'static', 'vendor', 'supabase.js'));
      await app.close();
      log(`تم بناء ${opts.admin ? 'موقع الإدارة' : 'صفحة التسجيل'}: ${urls.length} صفحة في ${opts.outDir} (الرابط: ${siteUrl}/)`);
      return { pages: urls.length, published: 0 };
    }
    const notFound = await app.inject({ method: 'GET', url: '/__not_found__' });
    write('404.html', withBase(notFound.body));
    write('search.json', (await app.inject({ method: 'GET', url: '/search.json' })).body.replace(/"\/(?!\/)/g, `"${base}/`));
    write('sitemap.xml', (await app.inject({ method: 'GET', url: '/sitemap.xml' })).body);
    write('manifest.webmanifest', (await app.inject({ method: 'GET', url: '/manifest.webmanifest' })).body.replace(/"\/(?!\/)/g, `"${base}/`));
    write('robots.txt', `User-agent: *\nDisallow: ${base}/publish/\nDisallow: ${base}/idara/\nDisallow: ${base}/tasjeel/\nSitemap: ${siteUrl}/sitemap.xml\n`);
    write('.nojekyll', '');
    write('build-stamp.txt', stamp);
    fs.cpSync(path.join(import.meta.dirname, '..', 'public'), path.join(opts.outDir, 'static'), { recursive: true });
    if (opts.supabase) {
      fs.mkdirSync(path.join(opts.outDir, 'static', 'vendor'), { recursive: true });
      fs.copyFileSync(path.join(import.meta.dirname, '..', 'node_modules', '@supabase', 'supabase-js', 'dist', 'umd', 'supabase.js'), path.join(opts.outDir, 'static', 'vendor', 'supabase.js'));
    }
    if (fs.existsSync(uploadDir)) fs.cpSync(uploadDir, path.join(opts.outDir, 'media'), { recursive: true });
    await app.close();
    log(`تم البناء: ${urls.length} صفحة في ${opts.outDir} (الرابط: ${siteUrl}/)`);
    return { pages: urls.length, published: content.published };
  } finally {
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const repo = process.env.GITHUB_REPOSITORY || 'ibrahim205b-tech/almamel';
  const [owner, name] = repo.split('/');
  const siteUrl = process.env.SITE_URL || (process.env.GITHUB_REPOSITORY ? `https://${owner}.github.io/${name}` : 'http://localhost:8080');
  // موقع الإدارة: ADMIN_SITE=1 SITE_URL=<رابط موقع الإدارة> PUBLIC_URL=<رابط الموقع العام>
  const pub = { publicUrl: process.env.PUBLIC_URL || `https://${owner}.github.io/${name}/` };
  const admin = process.env.ADMIN_SITE === '1' ? pub : undefined;
  const register = process.env.REGISTER_SITE === '1' ? pub : undefined;
  buildStatic({ siteUrl, contentDir: process.env.CONTENT_DIR || 'content', outDir: process.env.OUT_DIR || (admin ? 'dist-admin' : register ? 'dist-register' : 'dist'), repo, supabase: supabaseConfig(), cacheDir: '.cache/supabase-media', admin, register })
    .catch((e) => { console.error(String(e.message ?? e)); process.exit(1); });
}

/** إعداد Supabase من site.config.json (القيم عامة بطبيعتها: الرابط والمفتاح العام anon). */
export function supabaseConfig(file = 'site.config.json'): SupabaseCfg | null {
  const env = { url: process.env.SUPABASE_URL ?? '', key: process.env.SUPABASE_ANON_KEY ?? '' };
  let cfg = env;
  if (!cfg.url && fs.existsSync(file)) {
    const j = JSON.parse(fs.readFileSync(file, 'utf8')) as { supabaseUrl?: string; supabaseAnonKey?: string };
    cfg = { url: j.supabaseUrl ?? '', key: j.supabaseAnonKey ?? '' };
  }
  if (!cfg.url || !cfg.key) return null;
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(cfg.url.replace(/\/+$/, ''))) throw new Error('supabaseUrl يجب أن يكون مثل https://xxxx.supabase.co');
  const secret = cfg.key.startsWith('sb_secret_') || /service_role/.test(Buffer.from(cfg.key.split('.')[1] ?? '', 'base64').toString());
  if (secret) throw new Error('هذا مفتاح سري (secret/service_role)! ضع المفتاح العام فقط (publishable أو anon).');
  return { url: cfg.url.replace(/\/+$/, ''), key: cfg.key };
}
