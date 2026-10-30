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
import { postUrl } from '../src/views/components.ts';

export async function buildStatic(opts: { siteUrl: string; contentDir: string; outDir: string; repo: string; quiet?: boolean }) {
  const log = (s: string) => { if (!opts.quiet) console.log(s); };
  const siteUrl = opts.siteUrl.replace(/\/+$/, '');
  const base = new URL(siteUrl).pathname.replace(/\/+$/, '');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'almamel-build-'));
  const uploadDir = path.join(tmp, 'media');
  const db = openDatabase(':memory:');
  try {
    const content = await loadContent(db, opts.contentDir, uploadDir);
    for (const s of content.skipped) log(`تخطي: ${s}`);
    if (content.errors.length) throw new Error('أخطاء في ملفات الإعلانات:\n- ' + content.errors.join('\n- '));
    log(`إعلانات منشورة: ${content.published}`);

    const cfg = loadConfig({ env: 'development', baseUrl: siteUrl, databasePath: ':memory:', uploadDir, cookieSecure: false, adminRequireMfa: false, staticMode: true, repo: opts.repo },
      { SESSION_SECRET: crypto.randomBytes(32).toString('hex') });
    const app = await buildApp(cfg, { db, logger: false, jobs: false });

    const settings = loadSettings(db);
    const urls = ['/', '/restaurants', '/about', '/contact', '/search', '/submit', '/publish', ...TYPE_KEYS.map((t) => TYPES[t].path),
      ...TYPE_KEYS.filter((t) => sectionEnabled(settings, t)).map((t) => `/submit/${t}`),
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
      write(u === '/' ? 'index.html' : `${u.slice(1)}/index.html`, page);
    }
    const notFound = await app.inject({ method: 'GET', url: '/__not_found__' });
    write('404.html', withBase(notFound.body));
    write('search.json', (await app.inject({ method: 'GET', url: '/search.json' })).body.replace(/"\/(?!\/)/g, `"${base}/`));
    write('sitemap.xml', (await app.inject({ method: 'GET', url: '/sitemap.xml' })).body);
    write('manifest.webmanifest', (await app.inject({ method: 'GET', url: '/manifest.webmanifest' })).body.replace(/"\/(?!\/)/g, `"${base}/`));
    write('robots.txt', `User-agent: *\nDisallow: ${base}/publish/\nSitemap: ${siteUrl}/sitemap.xml\n`);
    write('.nojekyll', '');
    fs.cpSync(path.join(import.meta.dirname, '..', 'public'), path.join(opts.outDir, 'static'), { recursive: true });
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
  buildStatic({ siteUrl, contentDir: process.env.CONTENT_DIR || 'content', outDir: process.env.OUT_DIR || 'dist', repo })
    .catch((e) => { console.error(String(e.message ?? e)); process.exit(1); });
}
