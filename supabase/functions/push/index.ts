// إرسال إشعارات دليل المعامل لكل المشتركين (Web Push). يناديها Supabase نفسه (private.push_send)
// برمز سري، وتقرأ مفاتيح VAPID من قاعدة البيانات. التركيب: docs/PUSH.md

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Promise<Response>): void };

interface Cfg { public: string | null; private: string | null; secret: string | null; subject: string }
interface Sub { id: number; endpoint: string; p256dh: string; auth: string }
interface WebPush {
  setVapidDetails(subject: string, pub: string, priv: string): void;
  sendNotification(sub: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string, opts?: Record<string, unknown>): Promise<unknown>;
}

const BASE = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/+$/, '');
const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_KEY') ?? '';
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

async function loadWebPush(): Promise<WebPush> {
  const g = globalThis as { __webpush?: WebPush };
  if (g.__webpush) return g.__webpush; // للاختبار
  // نص ثابت حتى Supabase يضمّن المكتبة وقت الرفع
  // @ts-expect-error: مكتبة Deno (npm:) ما يعرفها TypeScript هنا
  const m = await import('npm:web-push@3.6.7') as { default: WebPush };
  return m.default;
}

export async function handle(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('ok');
  const r = await fetch(`${BASE}/rest/v1/rpc/push_config`, { method: 'POST', headers: H, body: '{}' });
  if (!r.ok) return new Response('not configured', { status: 500 });
  const cfg = await r.json() as Cfg;
  if (!cfg.secret || req.headers.get('x-push-secret') !== cfg.secret) return new Response('forbidden', { status: 403 });
  if (!cfg.public || !cfg.private) return new Response('no vapid key', { status: 500 });
  const msg = await req.json() as { title?: string; body?: string; url?: string; tag?: string; log_id?: number };
  const payload = JSON.stringify({ title: String(msg.title ?? 'دليل المعامل').slice(0, 80), body: String(msg.body ?? '').slice(0, 200), url: String(msg.url ?? '/'), tag: String(msg.tag ?? 'almamel') });
  const wp = await loadWebPush();
  wp.setVapidDetails(cfg.subject, cfg.public, cfg.private);

  let sent = 0, failed = 0;
  const gone: number[] = [];
  for (let offset = 0; ; offset += 500) {
    const page = await fetch(`${BASE}/rest/v1/push_subscriptions?select=id,endpoint,p256dh,auth&order=id&limit=500&offset=${offset}`, { headers: H });
    const subs = page.ok ? await page.json() as Sub[] : [];
    // ٢٠ بنفس الوقت حتى ما نثقل
    for (let i = 0; i < subs.length; i += 20) {
      await Promise.all(subs.slice(i, i + 20).map(async (s) => {
        try { await wp.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400, urgency: 'normal' }); sent++; }
        catch (e) { const code = (e as { statusCode?: number }).statusCode; if (code === 404 || code === 410) gone.push(s.id); else failed++; }
      }));
    }
    if (subs.length < 500) break;
  }
  // الاشتراكات الميتة (حذف التطبيق أو ألغى السماح) تنشال
  for (let i = 0; i < gone.length; i += 200) await fetch(`${BASE}/rest/v1/push_subscriptions?id=in.(${gone.slice(i, i + 200).join(',')})`, { method: 'DELETE', headers: H });
  if (msg.log_id) await fetch(`${BASE}/rest/v1/push_log?id=eq.${Number(msg.log_id)}`, { method: 'PATCH', headers: H, body: JSON.stringify({ sent, failed }) });
  return new Response(JSON.stringify({ sent, failed, removed: gone.length }), { headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(handle);
