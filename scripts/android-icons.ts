// يولّد أيقونات تطبيقي أندرويد (الزبائن والمطاعم) من شعار الموقع. شغّله بعد تغيير الشعار: node scripts/android-icons.ts
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const GREEN = '#101B2D', GOLD = '#D6B66C'; // كحلي منتصف الليل وذهبي شمبانيا
const glyph = (fg: string) => `<rect x="6" y="6" width="52" height="52" rx="8" fill="none" stroke="${fg}" stroke-width="3"/><path d="M20 22h20a6 6 0 0 1 6 6v14H18v-7h21v-7H20z" fill="${fg}"/>`;
// جرس صغير يميّز تطبيق المطاعم
const bell = (bg: string, fg: string) => `<circle cx="50" cy="50" r="11" fill="${fg}" stroke="${bg}" stroke-width="2.5"/><path d="M45.5 53.5h9l-1.3-1.6v-3.6a3.2 3.2 0 0 0-6.4 0v3.6zM48.6 54.6a1.4 1.4 0 0 0 2.8 0" fill="${bg}"/>`;
const flavors = {
  customer: { bg: GREEN, fg: GOLD, extra: '' },
  kitchen: { bg: GOLD, fg: GREEN, extra: bell(GOLD, GREEN) },
};
const DENS: [string, number][] = [['mdpi', 1], ['hdpi', 1.5], ['xhdpi', 2], ['xxhdpi', 3], ['xxxhdpi', 4]];
const out = path.join(import.meta.dirname, '..', 'android', 'app', 'src');

for (const [name, f] of Object.entries(flavors)) {
  const full = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="${f.bg}"/>${glyph(f.fg)}${f.extra}</svg>`;
  // أيقونة متكيفة: الرمز داخل منطقة الأمان (66 من 108)
  const fore = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108"><g transform="translate(24 24) scale(0.9375)">${glyph(f.fg)}${f.extra}</g></svg>`;
  const res = path.join(out, name, 'res');
  for (const [d, k] of DENS) {
    const dir = path.join(res, `mipmap-${d}`);
    fs.mkdirSync(dir, { recursive: true });
    await sharp(Buffer.from(full), { density: 72 * k * 4 }).resize(Math.round(48 * k)).png().toFile(path.join(dir, 'ic_launcher.png'));
    await sharp(Buffer.from(fore), { density: 72 * k * 4 }).resize(Math.round(108 * k)).png().toFile(path.join(dir, 'ic_launcher_foreground.png'));
  }
  fs.mkdirSync(path.join(res, 'mipmap-anydpi-v26'), { recursive: true });
  fs.writeFileSync(path.join(res, 'mipmap-anydpi-v26', 'ic_launcher.xml'),
    '<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n  <background android:drawable="@color/iconBackground"/>\n  <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n</adaptive-icon>\n');
  // أيقونة المتجر 512×512
  fs.mkdirSync(path.join(import.meta.dirname, '..', 'android', 'store', name), { recursive: true });
  await sharp(Buffer.from(full.replace('rx="12"', 'rx="0"')), { density: 72 * 32 }).resize(512).png().toFile(path.join(import.meta.dirname, '..', 'android', 'store', name, 'icon-512.png'));
}
console.log('تم توليد الأيقونات');
