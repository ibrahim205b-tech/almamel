// يبلّغ Bing و Yandex (ومحركات IndexNow الثانية) بالصفحات الجديدة أو المتغيرة بعد كل نشر،
// حتى تطلع بنتائج البحث خلال ساعات بدل أسابيع. كوكل ما يدعم IndexNow؛ هو يقرأ sitemap.xml من Search Console.
//   SITE_URL=https://almamel.pages.dev node scripts/indexnow.ts dist-cf/sitemap.xml old-sitemap.xml
// old-sitemap.xml: خريطة الموقع المنشورة قبل هذا النشر (إذا ما موجودة نبلّغ بكل الصفحات).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { indexNowKey } from './build-static.ts';

type Entry = { loc: string; lastmod: string };

export function parseSitemap(xml: string): Entry[] {
  return [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => ({
    loc: (m[1].match(/<loc>([^<]+)<\/loc>/)?.[1] ?? '').replace(/&amp;/g, '&'),
    lastmod: m[1].match(/<lastmod>([^<]+)<\/lastmod>/)?.[1] ?? '',
  })).filter((e) => e.loc);
}

/** الصفحات الي لازم نبلّغ بيها: الجديدة، والمتعدلة، والمحذوفة (حتى يشيلها المحرك)، ويا الرئيسية والقسم مالها. */
export function changedUrls(newXml: string, oldXml: string | null, site: string): string[] {
  const now = parseSitemap(newXml);
  if (oldXml === null || !parseSitemap(oldXml).length) return now.map((e) => e.loc);
  const before = new Map(parseSitemap(oldXml).map((e) => [e.loc, e.lastmod]));
  const after = new Set(now.map((e) => e.loc));
  const out = new Set<string>();
  const touch = (loc: string) => {
    out.add(loc);
    const parent = loc.replace(/\/[^/]+\/?$/, '/');
    if (parent.length > site.length + 1) out.add(parent); // القسم الي بيه الإعلان
    out.add(site + '/');
  };
  for (const e of now) if (!before.has(e.loc) || before.get(e.loc) !== e.lastmod) touch(e.loc);
  for (const loc of before.keys()) if (!after.has(loc)) touch(loc);
  return [...out];
}

async function main() {
  const site = (process.env.SITE_URL ?? '').replace(/\/+$/, '');
  const key = indexNowKey();
  const [newFile, oldFile] = process.argv.slice(2);
  if (!site || !key || !newFile) { console.log('IndexNow: ما كو رابط موقع أو مفتاح؛ تخطّي.'); return; }
  const oldXml = oldFile && fs.existsSync(oldFile) && fs.statSync(oldFile).size ? fs.readFileSync(oldFile, 'utf8') : null;
  const urls = changedUrls(fs.readFileSync(newFile, 'utf8'), process.env.INDEXNOW_ALL === '1' ? null : oldXml, site).slice(0, 10000);
  if (!urls.length) { console.log('IndexNow: ما تغيّر شي.'); return; }
  // ننتظر Cloudflare يكمّل نشر هالنسخة نفسها (build-stamp)، والمحرك يتحقق من ملف المفتاح قبل لا يقبل
  const keyUrl = `${site}/${key}.txt`;
  const stampFile = path.join(path.dirname(newFile), 'build-stamp.txt');
  const stamp = fs.existsSync(stampFile) ? fs.readFileSync(stampFile, 'utf8').trim() : '';
  const live = (u: string, want: string) => fetch(`${u}?t=${Date.now()}`, { cache: 'no-store' }).then(async (x) => x.ok && (await x.text()).trim() === want).catch(() => false);
  for (let i = 0; i < 30; i++) {
    if (await live(keyUrl, key) && (!stamp || await live(`${site}/build-stamp.txt`, stamp))) break;
    if (i === 29) { console.log('IndexNow: ملف المفتاح ما صار متاح بعد؛ نبلّغ بالنشر الجاي.'); return; }
    await new Promise((res) => setTimeout(res, 10_000));
  }
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: new URL(site).host, key, keyLocation: keyUrl, urlList: urls }),
  }).catch((e: Error) => ({ ok: false, status: 0, text: async () => e.message }));
  console.log(`IndexNow: ${urls.length} رابط ← ${res.status} ${res.ok ? 'تم' : await res.text()}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
