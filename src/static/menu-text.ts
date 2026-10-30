/**
 * يحوّل نص القائمة في ملف الإعلان إلى أصناف. يقبل صيغتين في نفس الملف:
 *  - «الاسم | السعر | ملاحظة» (الصيغة الأصلية).
 *  - صيغة رسائل واتساب: سطر قسم مثل «🍗 *الكنتاكي*»، وأصناف مثل «• كنتاكي 3 قطع — 5,000»،
 *    وأحجام في سطر واحد مثل «• بيتزا لحم: صغير 5,000 / وسط 7,000» (يصبح كل حجم صنفاً).
 * الأسطر التعريفية التي فيها أرقام بلا صيغة صنف (مثل رقم الهاتف) تُهمل.
 */
export interface MenuLine { name: string; price: number | null; note: string; section: string }

export const MAX_MENU_ITEMS = 300;

const BULLET = /^[•·▪●◦*\-–—]\s*/;
const toDigits = (s: string) => s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0));
const parsePrice = (s: string): number | null | undefined => {
  const p = toDigits(s).replace(/(د\.?\s?ع|دينار|IQD)/gi, '').replace(/[,\s٬.]/g, '');
  if (!p) return null;
  return /^\d{1,10}$/.test(p) ? Number(p) : undefined;
};
/** يزيل الرموز التعبيرية والنجوم والزخارف من أطراف النص. */
const clean = (s: string) => s.replace(/\*/g, '').replace(/^[^\p{L}\p{N}(]+/u, '').replace(/[^\p{L}\p{N})]+$/u, '').trim();

export function parseMenuText(lines: string[]): { items: MenuLine[]; error?: string } {
  const items: MenuLine[] = [];
  let section = '';
  for (const raw of lines.map((l) => l.trim()).filter(Boolean)) {
    if (items.length >= MAX_MENU_ITEMS) break;

    if (raw.includes('|')) {
      const [name, price = '', note = ''] = raw.split('|').map((x) => x.trim());
      const p = parsePrice(price);
      if (name.length < 2 || name.length > 80 || p === undefined) return { items, error: `صنف غير صالح: ${raw}` };
      items.push({ name, price: p, note: note.slice(0, 200), section });
      continue;
    }

    const bulleted = BULLET.test(raw) && !/^\*[^*]+\*$/.test(raw);
    const line = raw.replace(BULLET, '').trim();

    // «الاسم — السعر» أو «الاسم - السعر»
    const dash = line.match(/^(.*\S)\s+[—–-]\s+([\d٠-٩۰-۹][\d٠-٩۰-۹,٬.\s]*(?:د\.?\s?ع|دينار)?)$/);
    if (dash) {
      const p = parsePrice(dash[2]);
      const name = clean(dash[1]);
      if (p !== undefined && name.length >= 2 && name.length <= 80) { items.push({ name, price: p, note: '', section }); continue; }
    }

    // «الاسم: صغير 5,000 / وسط 7,000 / كبير 10,000»
    const sized = line.match(/^(.*\S)\s*:\s*(.+)$/);
    if (sized && sized[2].includes('/')) {
      const parts = sized[2].split('/').map((x) => x.trim().match(/^(\D*?)\s*([\d٠-٩۰-۹][\d٠-٩۰-۹,٬.]*)\s*(?:د\.?\s?ع|دينار)?$/));
      const base = clean(sized[1]);
      if (parts.every(Boolean) && base.length >= 2) {
        for (const m of parts) {
          const label = m![1].trim();
          const name = (label ? `${base} (${label})` : base).slice(0, 80);
          items.push({ name, price: parsePrice(m![2]) ?? null, note: '', section });
        }
        continue;
      }
    }

    const text = clean(line);
    if (text.length < 2) continue;
    if (bulleted) {
      // صنف بلا سعر
      if (text.length <= 80) items.push({ name: text, price: null, note: '', section });
      continue;
    }
    // سطر بلا علامة صنف: عنوان قسم، إلا إذا فيه أرقام (هاتف أو ملاحظة) فيُهمل.
    if (!/[\d٠-٩]/.test(text) && text.length <= 60) section = text;
  }
  return { items };
}
