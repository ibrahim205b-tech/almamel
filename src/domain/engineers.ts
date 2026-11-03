// دليل المهندسين: البيانات من content/engineers.json (ملف بسيط يتعدل باليد).
// الإدخال الناقص أو الغلط يُتجاهل بهدوء حتى ما يوقف بناء الموقع.
import fs from 'node:fs';
import path from 'node:path';

export interface Engineer {
  slug: string; name: string; specialty: string; services: string[]; location: string;
  phone: string | null; whatsapp: boolean; about: string;
}

export const ENGINEERS_FILE = path.join(import.meta.dirname, '..', '..', 'content', 'engineers.json');

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function loadEngineers(file = ENGINEERS_FILE): Engineer[] {
  let raw: unknown;
  try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return []; }
  const list = (raw as { engineers?: unknown })?.engineers;
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: Engineer[] = [];
  for (const e of list as Record<string, unknown>[]) {
    const slug = str(e?.slug, 40).toLowerCase();
    const name = str(e?.name, 80), specialty = str(e?.specialty, 60);
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug) || seen.has(slug) || !name || !specialty) continue;
    seen.add(slug);
    const phone = str(e?.phone, 20).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/\D/g, '').replace(/^964/, '0');
    out.push({
      slug, name, specialty,
      services: (Array.isArray(e.services) ? e.services : []).map((s) => str(s, 120)).filter(Boolean).slice(0, 20),
      location: str(e.location, 80),
      phone: /^07\d{9}$/.test(phone) ? phone : null,
      whatsapp: e.whatsapp !== false,
      about: str(e.about, 2000),
    });
  }
  return out;
}

/** رابط واتساب برسالة جاهزة، أو null إذا الرقم بعده ما متوفر. */
export function engineerWhatsApp(e: Engineer): string | null {
  if (!e.phone || !e.whatsapp) return null;
  const msg = `مرحباً ${e.name}، شفت صفحتك بدليل المهندسين على دليل المعامل وأريد أستفسر عن خدماتك${e.services[0] ? ` (${e.services[0]})` : ''}.`;
  return `https://wa.me/964${e.phone.slice(1)}?text=${encodeURIComponent(msg)}`;
}
