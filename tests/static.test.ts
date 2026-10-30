import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { buildStatic } from '../scripts/build-static.ts';

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'almamel-content-'));
  fs.mkdirSync(path.join(dir, 'listings'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'images'), { recursive: true });
  return dir;
}
const today = new Date().toISOString().slice(0, 10);
const write = (dir: string, name: string, text: string) => fs.writeFileSync(path.join(dir, 'listings', name), text);

test('static build renders every page with the GitHub Pages base path and no server forms', async () => {
  const dir = fixture();
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'almamel-out-'));
  await sharp({ create: { width: 300, height: 200, channels: 3, background: '#2a7' } }).jpeg().toFile(path.join(dir, 'images', 'shop.jpg'));
  write(dir, 'a.md', `---\nid: 5\ntype: business\ntitle: "مطعم الاختبار"\ncategory: "مطاعم"\ndate: ${today}\nphone: "07701234567"\naddress: "الشارع العام"\nmenu:\n  - "تكة | 6000"\nimages:\n  - shop.jpg\n---\nوصف <script>alert(1)</script>\n`);
  write(dir, 'b.md', `---\nid: 6\ntype: job\ntitle: "وظيفة منتهية"\ncategory: "توصيل"\ndate: 2020-01-01\nworkplace: "محل"\nemployment: full\nphone: "07701234567"\n---\n`);
  fs.writeFileSync(path.join(dir, 'settings.yml'), 'announcement: "افتتاح الموقع"\n');
  const r = await buildStatic({ siteUrl: 'https://user.github.io/almamel', contentDir: dir, outDir: out, repo: 'user/almamel', quiet: true });
  assert.equal(r.published, 1, 'expired listing skipped');
  const home = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  assert.ok(home.includes('href="/almamel/static/css/app.css'));
  assert.ok(home.includes('data-base="/almamel"'));
  assert.ok(home.includes('افتتاح الموقع'));
  assert.ok(home.includes('جميع الحقوق محفوظة © إبراهيم علي الشويلي'));
  assert.ok(home.includes('Content-Security-Policy'));
  assert.ok(!home.includes('href="/almamel/login"') && !home.includes('/admin'));
  const page = fs.readFileSync(path.join(out, 'businesses/5/index.html'), 'utf8');
  assert.ok(page.includes('&lt;script&gt;') && !page.includes('<script>alert'));
  assert.ok(page.includes('https://user.github.io/almamel/businesses/5'), 'canonical uses site url');
  assert.ok(page.includes('تكة'));
  assert.ok(!fs.existsSync(path.join(out, 'jobs/6')), 'expired page not built');
  const img = page.match(/src="\/almamel\/media\/([0-9a-f]+\.webp)"/)![1];
  assert.ok(fs.existsSync(path.join(out, 'media', img)));
  for (const f of ['404.html', 'search.json', 'sitemap.xml', 'robots.txt', '.nojekyll', 'static/js/static.js', 'submit/index.html', 'publish/index.html']) assert.ok(fs.existsSync(path.join(out, f)), f);
  const all = fs.readdirSync(out, { recursive: true }).filter((f) => String(f).endsWith('.html'));
  for (const f of all) assert.ok(!/method="post"/i.test(fs.readFileSync(path.join(out, String(f)), 'utf8')), String(f));
  assert.ok(JSON.parse(fs.readFileSync(path.join(out, 'search.json'), 'utf8'))[0].u.startsWith('/almamel/'));
  assert.ok(fs.readFileSync(path.join(out, 'sitemap.xml'), 'utf8').includes('https://user.github.io/almamel/businesses/5'));
});

test('invalid listing files stop the build with clear messages', async () => {
  const dir = fixture();
  write(dir, 'bad1.md', `---\nid: 1\ntype: job\ntitle: "x"\ncategory: "غير موجود"\ndate: ${today}\n---\n`);
  write(dir, 'bad2.md', `---\nid: 2\ntype: market\ntitle: "سلعة"\ncategory: "هواتف"\ndate: ${today}\ncondition: used\nphone: "07701234567"\nstatus: published\n---\n`);
  write(dir, 'bad3.md', `---\nid: 3\ntype: help\ntitle: "طلب تبرع"\ncategory: "تبرع بالدم"\ndate: ${today}\n---\n`);
  write(dir, 'bad4.md', 'no front matter');
  write(dir, 'bad5.md', `---\nid: 5\ntype: business\ntitle: "محل"\ncategory: "صيدليات"\ndate: ${today}\naddress: "شارع"\nphone: "07701234567"\nimages: ["../../etc/passwd"]\n---\n`);
  await assert.rejects(buildStatic({ siteUrl: 'https://u.github.io/r', contentDir: dir, outDir: fs.mkdtempSync(path.join(os.tmpdir(), 'o-')), repo: 'u/r', quiet: true }), (e: Error) => {
    for (const f of ['bad1.md', 'bad2.md', 'bad3.md', 'bad4.md', 'bad5.md']) assert.ok(e.message.includes(f), f);
    assert.ok(e.message.includes('status'));
    return true;
  });
});
