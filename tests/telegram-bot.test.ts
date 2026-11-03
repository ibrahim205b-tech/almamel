// يختبر دالة البوت (supabase/functions/telegram-bot) بخادم Supabase وتيليغرام وهميين.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';

const SECRET = 's'.repeat(64), CHAT = '7476314677';
const calls: { url: string; body: Record<string, unknown> }[] = [];
let handle: (r: Request) => Promise<Response>;

before(async () => {
  (globalThis as unknown as { Deno: unknown }).Deno = {
    env: { get: (k: string) => ({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'svc' } as Record<string, string>)[k] },
    serve: () => {},
  };
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input), body = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push({ url, body });
    const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json' } });
    if (url.includes('api.telegram.org')) return json({ ok: true });
    assert.equal((init?.headers as Record<string, string>).apikey, 'svc', 'service key on every Supabase call');
    if (url.endsWith('/rpc/bot_config')) return json({ token: '123:ABC', chat: CHAT, secret: SECRET });
    if (url.endsWith('/rpc/bot_action')) return body.p_id === 404 ? json({ message: 'الطلب غير موجود أو تمت مراجعته' }, 400) : json('انتشر ✅');
    if (url.endsWith('/rpc/bot_pending')) return json([{ text: 'إعلان', kb: [[{ text: '✅ نشر', callback_data: 'p:1:approve' }]] }]);
    if (url.endsWith('/rpc/bot_product_ids')) return json([31, 32]);
    if (url.endsWith('/rpc/bot_card')) return json({ text: 'منتج ' + body.p_id, kb: [] });
    if (url.includes('/rest/v1/riders?')) return json([{ name: 'حسين', id_front: 'rider/' + 'a'.repeat(32) + '.webp', id_back: 'rider/' + 'b'.repeat(32) + '.webp' }]);
    if (url.includes('/storage/v1/object/sign/proofs/')) return json({ signedURL: '/object/sign/proofs/x?token=t' });
    if (url.includes('/storage/v1/object/proofs') && init?.method === 'DELETE') return json([]);
    return json([]);
  }) as typeof fetch;
  ({ handle } = await import('../supabase/functions/telegram-bot/index.ts'));
});

const post = (u: unknown, secret = SECRET) => handle(new Request('https://f/telegram-bot', { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': secret, 'Content-Type': 'application/json' }, body: JSON.stringify(u) }));
const button = (data: string, from = Number(CHAT)) => ({ callback_query: { id: 'q1', from: { id: from }, data, message: { message_id: 9, chat: { id: Number(CHAT) }, text: '📥 إعلان جديد' } } });
const tgCalls = (m: string) => calls.filter((c) => c.url.endsWith('/' + m));

test('requests without the webhook secret are refused before anything runs', async () => {
  calls.length = 0;
  assert.equal((await post(button('p:1:approve'), 'wrong')).status, 403);
  assert.equal(calls.filter((c) => c.url.includes('bot_action')).length, 0);
});

test('only the admin chat can press buttons', async () => {
  calls.length = 0;
  await post(button('p:1:approve', 111));
  assert.equal(calls.filter((c) => c.url.includes('bot_action')).length, 0);
  assert.equal(tgCalls('answerCallbackQuery')[0].body.text, 'غير مسموح');
});

test('approve: runs bot_action, answers, and edits the message to show the result without buttons', async () => {
  calls.length = 0;
  assert.equal((await post(button('p:15:approve'))).status, 200);
  assert.deepEqual(calls.find((c) => c.url.endsWith('/rpc/bot_action'))!.body, { p_kind: 'p', p_id: 15, p_action: 'approve' });
  const edit = tgCalls('editMessageText')[0].body;
  assert.equal(edit.text, '📥 إعلان جديد\n\nانتشر ✅'); assert.equal(edit.reply_markup, undefined);
});

test('an already-handled item shows an alert and leaves the message alone', async () => {
  calls.length = 0;
  await post(button('c:404:approve'));
  assert.equal(tgCalls('answerCallbackQuery')[0].body.show_alert, true);
  assert.match(String(tgCalls('answerCallbackQuery')[0].body.text), /تمت مراجعته/);
  assert.equal(tgCalls('editMessageText').length, 0);
});

test('rider ID photos are sent as short-lived signed links, protected from forwarding', async () => {
  calls.length = 0;
  await post(button('r:3:id'));
  const photos = tgCalls('sendPhoto');
  assert.equal(photos.length, 2);
  assert.match(String(photos[0].body.photo), /^https:\/\/x\.supabase\.co\/storage\/v1\/object\/sign\/proofs\/x\?token=t$/);
  assert.equal(photos[0].body.protect_content, true);
  assert.equal(calls.filter((c) => c.url.includes('bot_action')).length, 0);
});

test('deleting a rider removes the record first, then both ID photos', async () => {
  calls.length = 0;
  await post(button('r:3:delete'));
  const i = calls.findIndex((c) => c.url.endsWith('/rpc/bot_action')), j = calls.findIndex((c) => c.url.endsWith('/storage/v1/object/proofs'));
  assert.ok(i >= 0 && j > i, 'record deleted before the files');
  assert.equal((calls[j].body.prefixes as string[]).length, 2);
});

test('/pending sends every waiting card; products can be listed one by one', async () => {
  calls.length = 0;
  await post({ message: { message_id: 1, chat: { id: Number(CHAT) }, text: '/pending' } });
  const sent = tgCalls('sendMessage').map((c) => c.body);
  assert.match(String(sent[0].text), /عندك ١|عندك 1/);
  assert.deepEqual((sent[1].reply_markup as { inline_keyboard: unknown }).inline_keyboard, [[{ text: '✅ نشر', callback_data: 'p:1:approve' }]]);
  calls.length = 0;
  await post(button('M:7:list'));
  assert.deepEqual(tgCalls('sendMessage').map((c) => c.body.text), ['منتج 31', 'منتج 32']);
});

test('strangers who message the bot get a polite refusal and nothing else', async () => {
  calls.length = 0;
  await post({ message: { message_id: 1, chat: { id: 999 }, text: '/pending' } });
  assert.equal(calls.filter((c) => c.url.includes('bot_pending')).length, 0);
  assert.equal(tgCalls('sendMessage')[0].body.chat_id, 999);
});
