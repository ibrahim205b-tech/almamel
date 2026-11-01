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
  // ربط تطبيقي أندرويد: assetlinks.json للحزمتين بنفس بصمة مفتاح التوقيع
  const links = JSON.parse(fs.readFileSync(path.join(out, '.well-known', 'assetlinks.json'), 'utf8'));
  assert.deepEqual(links.map((l: { target: { package_name: string } }) => l.target.package_name), ['com.almamel.dalil', 'com.almamel.restaurant']);
  assert.match(links[0].target.sha256_cert_fingerprints[0], /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
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

test('whatsapp-style menus become sections, prices and sizes, with a cart on the page', async () => {
  const { parseMenuText } = await import('../src/static/menu-text.ts');
  const r = parseMenuText(['🍽️ *منيو المطعم*', '📞 للطلب واتساب: 07700000000', '🍗 *الكنتاكي*', '• كنتاكي 3 قطع — 5,000', '🍕 *البيتزا*',
    '• بيتزا لحم: صغير 5,000 / وسط 7,000', 'تكة | 6000 | حار', '• صنف بلا سعر']);
  assert.equal(r.error, undefined);
  assert.deepEqual(r.items.map((i) => [i.section, i.name, i.price]), [
    ['الكنتاكي', 'كنتاكي 3 قطع', 5000], ['البيتزا', 'بيتزا لحم (صغير)', 5000], ['البيتزا', 'بيتزا لحم (وسط)', 7000],
    ['البيتزا', 'تكة', 6000], ['البيتزا', 'صنف بلا سعر', null]]);
  assert.ok(parseMenuText(['x | abc']).error);

  const dir = fixture();
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'almamel-out-'));
  write(dir, 'm.md', `---\nid: 7\ntype: business\ntitle: "مطعم السلة"\ncategory: "مطاعم"\ndate: ${today}\nphone: "07701234567"\naddress: "شارع"\nmenu:\n  - "*المشويات*"\n  - "• نفر كباب — 12,000"\n---\n`);
  await buildStatic({ siteUrl: 'https://u.github.io/r', contentDir: dir, outDir: out, repo: 'u/r', quiet: true });
  const page = fs.readFileSync(path.join(out, 'businesses/7/index.html'), 'utf8');
  assert.ok(page.includes('data-cart') && page.includes('data-name="نفر كباب"') && page.includes('data-price="12000"'));
  assert.ok(page.includes('المشويات'));
});

test('area news get their own page, a homepage block and a source link', async () => {
  const dir = fixture();
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'almamel-out-'));
  write(dir, 'n.md', `---\nid: 8\ntype: community\ntitle: "حملة خدمية في المعامل"\ncategory: "أخبار المنطقة"\ndate: ${today}\nsource_name: "وكالة الأنباء العراقية"\nsource_url: "https://ina.iq/ar/local/1.html"\n---\nملخص الخبر.\n`);
  write(dir, 'e.md', `---\nid: 9\ntype: community\ntitle: "دورة خياطة مجانية"\ncategory: "المدارس والدورات"\ndate: ${today}\n---\nتفاصيل.\n`);
  await buildStatic({ siteUrl: 'https://u.github.io/r', contentDir: dir, outDir: out, repo: 'u/r', quiet: true });
  const news = fs.readFileSync(path.join(out, 'news/index.html'), 'utf8');
  assert.ok(news.includes('حملة خدمية في المعامل') && !news.includes('دورة خياطة مجانية'), 'only news categories');
  assert.ok(fs.readFileSync(path.join(out, 'index.html'), 'utf8').includes('آخر أخبار المعامل'));
  const page = fs.readFileSync(path.join(out, 'community/8/index.html'), 'utf8');
  assert.ok(page.includes('href="https://ina.iq/ar/local/1.html"') && page.includes('منقول عن وكالة الأنباء العراقية'));
  write(dir, 'n.md', `---\nid: 8\ntype: community\ntitle: "خبر"\ncategory: "أخبار المنطقة"\ndate: ${today}\nsource_url: "javascript:alert(1)"\n---\n`);
  await assert.rejects(buildStatic({ siteUrl: 'https://u.github.io/r', contentDir: dir, outDir: fs.mkdtempSync(path.join(os.tmpdir(), 'o-')), repo: 'u/r', quiet: true }));
});

test('each section shows its own fields (help, service, market)', async () => {
  const dir = fixture();
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'almamel-out-'));
  write(dir, 'h.md', `---\nid: 11\ntype: help\ntitle: "مطلوب متبرع دم"\ncategory: "تبرع بالدم"\ndate: ${today}\nblood_type: "O+"\nunits: 3\nlocation: "مستشفى المعامل"\nneeded_by: "${today}"\ncontact_name: "أبو أحمد"\nconsent: true\n---\nحالة طارئة.\n`);
  write(dir, 's.md', `---\nid: 12\ntype: service\ntitle: "كهربائي منازل"\ncategory: "كهربائيون"\ndate: ${today}\nphone: "07701234567"\nhome_visit: true\n---\n`);
  write(dir, 'm.md', `---\nid: 13\ntype: market\ntitle: "ثلاجة"\ncategory: "أثاث مستعمل"\ndate: ${today}\nphone: "07701234567"\ncondition: used\nprice: "200000"\nnegotiable: true\n---\n`);
  const r = await buildStatic({ siteUrl: 'https://u.github.io/r', contentDir: dir, outDir: out, repo: 'u/r', quiet: true });
  assert.equal(r.published, 3);
  const help = fs.readFileSync(path.join(out, 'help/11/index.html'), 'utf8');
  for (const t of ['العدد المطلوب', 'مستشفى المعامل', 'مطلوب قبل', 'أبو أحمد']) assert.ok(help.includes(t), t);
  assert.ok(fs.readFileSync(path.join(out, 'services/12/index.html'), 'utf8').includes('خدمة منزلية'));
  assert.ok(fs.readFileSync(path.join(out, 'market/13/index.html'), 'utf8').includes('قابل للتفاوض'));
  const submit = fs.readFileSync(path.join(out, 'submit/index.html'), 'utf8');
  assert.ok(submit.includes('name="d_help_blood_type"') && submit.includes('name="d_property_rooms"') && submit.includes('name="d_job_positions"'));
});

test('photos picked from the phone gallery are embedded in the listing file', async () => {
  const dir = fixture();
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'almamel-out-'));
  const jpg = (await sharp({ create: { width: 640, height: 480, channels: 3, background: '#c33' } }).jpeg().toBuffer()).toString('base64');
  write(dir, 'p.md', `---\nid: 14\ntype: business\ntitle: "مطعم بالصور"\ncategory: "مطاعم"\ndate: ${today}\nphone: "07701234567"\naddress: "شارع"\nimages:\n  - "data:image/jpeg;base64,${jpg}"\nlogo: "data:image/jpeg;base64,${jpg}"\n---\n`);
  await buildStatic({ siteUrl: 'https://u.github.io/r', contentDir: dir, outDir: out, repo: 'u/r', quiet: true });
  const page = fs.readFileSync(path.join(out, 'businesses/14/index.html'), 'utf8');
  assert.ok(page.includes('class="biz-logo"'), 'logo shown next to the name');
  assert.ok(/src="\/r\/media\/[0-9a-f]+\.webp"/.test(page), 'embedded photo re-encoded to WebP');
  write(dir, 'p.md', `---\nid: 14\ntype: business\ntitle: "مطعم"\ncategory: "مطاعم"\ndate: ${today}\nphone: "07701234567"\naddress: "شارع"\nimages:\n  - "data:image/svg+xml;base64,PHN2Zz4="\n---\n`);
  await assert.rejects(buildStatic({ siteUrl: 'https://u.github.io/r', contentDir: dir, outDir: fs.mkdtempSync(path.join(os.tmpdir(), 'o-')), repo: 'u/r', quiet: true }), /غير مدعومة/);
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
