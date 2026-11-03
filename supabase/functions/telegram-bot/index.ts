// بوت تيليغرام لإدارة دليل المعامل: يستلم ضغطات الأزرار (موافقة، رفض، حذف، تنشيط) وأمر /pending.
// يشتغل كـ Supabase Edge Function. الشرح والتركيب: docs/TELEGRAM.md
// الأمان:
//  - تيليغرام يرسل رمز سري بكل طلب (telegram_webhook_secret)، وأي طلب بدونه ينرفض.
//  - بس محادثة المدير (telegram_chat) تكدر تضغط الأزرار.
//  - القرار نفسه تنفذه دالة bot_action بقاعدة البيانات، بنفس قواعد لوحة الإدارة.

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Promise<Response>): void };

interface Card { text: string; kb: { text: string; callback_data: string }[][] }
interface Cfg { token: string | null; chat: string | null; secret: string | null }
interface Msg { message_id: number; chat: { id: number }; text?: string }
interface Update {
  callback_query?: { id: string; from: { id: number }; data?: string; message?: Msg };
  message?: Msg & { from?: { id: number } };
}

const BASE = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/+$/, '');
const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_KEY') ?? '';
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const r = await fetch(`${BASE}/rest/v1/rpc/${fn}`, { method: 'POST', headers: H, body: JSON.stringify(args) });
  const t = await r.text();
  let j: unknown;
  try { j = t ? JSON.parse(t) : null; } catch { j = t; }
  if (!r.ok) throw new Error((j as { message?: string } | null)?.message ?? `خطأ ${r.status}`);
  return j as T;
}
async function rows<T>(q: string): Promise<T[]> {
  const r = await fetch(`${BASE}/rest/v1/${q}`, { headers: H });
  if (!r.ok) throw new Error(`خطأ ${r.status}`);
  return await r.json() as T[];
}
async function removeFiles(bucket: string, paths: string[]) {
  if (paths.length) await fetch(`${BASE}/storage/v1/object/${bucket}`, { method: 'DELETE', headers: H, body: JSON.stringify({ prefixes: paths }) });
}
async function signed(path: string): Promise<string | null> {
  const r = await fetch(`${BASE}/storage/v1/object/sign/proofs/${path}`, { method: 'POST', headers: H, body: JSON.stringify({ expiresIn: 600 }) });
  if (!r.ok) return null;
  const j = await r.json() as { signedURL?: string };
  return j.signedURL ? `${BASE}/storage/v1${j.signedURL}` : null;
}

let cfg: Cfg = { token: null, chat: null, secret: null };
async function tg(method: string, body: Record<string, unknown>): Promise<unknown> {
  try {
    const r = await fetch(`https://api.telegram.org/bot${cfg.token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return await r.json();
  } catch { return null; }
}
const say = (text: string) => tg('sendMessage', { chat_id: cfg.chat, text, disable_web_page_preview: true });
const sendCard = (c: Card) => tg('sendMessage', { chat_id: cfg.chat, text: c.text, reply_markup: { inline_keyboard: c.kb }, disable_web_page_preview: true });

const HELP = 'أهلاً 👋 هذا بوت إدارة دليل المعامل.\n\n'
  + 'كل إعلان أو طلب محل أو دلفري أو منتج أو شكوى جديدة يوصلك هنا بأزرار، تضغط وينفّذ بالموقع مباشرة.\n\n'
  + '/pending — يرسلك كل الي ينتظر موافقتك هسه.';

async function onButton(q: NonNullable<Update['callback_query']>) {
  const answer = (text: string, alert = false) => tg('answerCallbackQuery', { callback_query_id: q.id, text, show_alert: alert });
  if (String(q.from.id) !== String(cfg.chat)) { await answer('غير مسموح', true); return; }
  const [kind, idText, action] = String(q.data ?? '').split(':');
  const id = Number(idText);
  if (!kind || !Number.isSafeInteger(id) || !action) { await answer('زر غير صالح', true); return; }

  if (kind === 'r' && action === 'id') {
    const [r] = await rows<{ name: string; id_front: string; id_back: string }>(`riders?select=name,id_front,id_back&id=eq.${id}`);
    if (!r) { await answer('الدلفري غير موجود', true); return; }
    for (const [path, label] of [[r.id_front, 'الوجه'], [r.id_back, 'الظهر']]) {
      const url = await signed(path);
      if (url) await tg('sendPhoto', { chat_id: cfg.chat, photo: url, caption: `🪪 هوية ${r.name} (${label})`, protect_content: true });
    }
    await answer('أرسلت صور الهوية');
    return;
  }
  if (kind === 'M' && action === 'list') {
    const ids = await rpc<number[]>('bot_product_ids', { p_business: id });
    for (const pid of ids) { const c = await rpc<Card | null>('bot_card', { p_kind: 'm', p_id: pid }); if (c) await sendCard(c); }
    await answer(ids.length ? `أرسلت ${ids.length} منتج` : 'ما كو منتجات تنتظر');
    return;
  }

  // الملفات تنمسح بعد ما ينحذف السجل بنجاح
  let files: [string, string[]] | null = null;
  if (kind === 'r' && action === 'delete') {
    const [r] = await rows<{ id_front: string; id_back: string }>(`riders?select=id_front,id_back&id=eq.${id}`);
    if (r) files = ['proofs', [r.id_front, r.id_back]];
  }
  if (kind === 'm' && action === 'delete') {
    const [m] = await rows<{ image: string | null }>(`menu_items?select=image&id=eq.${id}`);
    if (m?.image) files = ['media', [m.image]];
  }
  try {
    const done = await rpc<string>('bot_action', { p_kind: kind, p_id: id, p_action: action });
    if (files) await removeFiles(files[0], files[1]);
    await answer(done);
    if (q.message) await tg('editMessageText', { chat_id: q.message.chat.id, message_id: q.message.message_id, text: `${q.message.text ?? ''}\n\n${done}`, disable_web_page_preview: true });
  } catch (e) {
    await answer(`⚠️ ${(e as Error).message}`, true);
  }
}

async function onMessage(m: NonNullable<Update['message']>) {
  if (String(m.chat.id) !== String(cfg.chat)) {
    await tg('sendMessage', { chat_id: m.chat.id, text: 'هذا البوت خاص بإدارة دليل المعامل.' });
    return;
  }
  const text = (m.text ?? '').trim();
  if (/^\/pending|^شنو ينتظر/.test(text)) {
    const cards = await rpc<Card[]>('bot_pending');
    if (!cards.length) { await say('ما كو شي ينتظر ✅'); return; }
    await say(`عندك ${cards.length} شي ينتظر قرارك:`);
    for (const c of cards) await sendCard(c);
    return;
  }
  await say(HELP);
}

export async function handle(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('ok');
  try { cfg = await rpc<Cfg>('bot_config'); } catch { return new Response('not configured', { status: 500 }); }
  if (!cfg.secret || !cfg.token || req.headers.get('x-telegram-bot-api-secret-token') !== cfg.secret) return new Response('forbidden', { status: 403 });
  let u: Update;
  try { u = await req.json() as Update; } catch { return new Response('bad request', { status: 400 }); }
  try {
    if (u.callback_query) await onButton(u.callback_query);
    else if (u.message) await onMessage(u.message);
  } catch (e) {
    console.error(e);
  }
  return new Response('ok'); // دائماً ٢٠٠ حتى تيليغرام ما يعيد نفس الطلب
}

Deno.serve(handle);
