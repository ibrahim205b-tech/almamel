// يختبر دالة الإشعارات (supabase/functions/push) بقاعدة بيانات وخدمة إشعارات وهميتين.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';

const calls: { url: string; method: string; body: string }[] = [];
const sentTo: string[] = [];
let handle: (r: Request) => Promise<Response>;
const subs = Array.from({ length: 23 }, (_, i) => ({ id: i + 1, endpoint: `https://push.example/${i + 1}`, p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) }));

before(async () => {
  (globalThis as unknown as { Deno: unknown }).Deno = { env: { get: (k: string) => ({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'svc' } as Record<string, string>)[k] }, serve: () => {} };
  (globalThis as unknown as { __webpush: unknown }).__webpush = {
    setVapidDetails: (s: string, pub: string, priv: string) => { assert.equal(s, 'https://almamel.pages.dev'); assert.equal(pub, 'PUB'); assert.equal(priv, 'PRIV'); },
    sendNotification: async (s: { endpoint: string }, payload: string) => {
      assert.deepEqual(JSON.parse(payload), { title: 'دليل المعامل: خبر جديد', body: 'الأمطار تعود', url: '/news/', tag: 'news' });
      if (s.endpoint.endsWith('/5')) throw Object.assign(new Error('gone'), { statusCode: 410 });
      if (s.endpoint.endsWith('/7')) throw Object.assign(new Error('boom'), { statusCode: 500 });
      sentTo.push(s.endpoint);
    },
  };
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input), method = init?.method ?? 'GET';
    calls.push({ url, method, body: String(init?.body ?? '') });
    const json = (d: unknown) => new Response(JSON.stringify(d), { headers: { 'Content-Type': 'application/json' } });
    if (url.endsWith('/rpc/push_config')) return json({ public: 'PUB', private: 'PRIV', secret: 'S'.repeat(64), subject: 'https://almamel.pages.dev' });
    if (url.includes('/push_subscriptions?select=')) { const off = Number(new URL(url).searchParams.get('offset')); return json(subs.slice(off, off + 500)); }
    return json([]);
  }) as typeof fetch;
  ({ handle } = await import('../supabase/functions/push/index.ts'));
});

const post = (body: unknown, secret = 'S'.repeat(64)) => handle(new Request('https://f/push', { method: 'POST', headers: { 'x-push-secret': secret, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));

test('push: wrong secret is refused and nothing is sent', async () => {
  assert.equal((await post({ title: 'x' }, 'nope')).status, 403);
  assert.equal(sentTo.length, 0);
});

test('push: sends to every subscriber, removes dead ones, and records the result', async () => {
  const r = await post({ title: 'دليل المعامل: خبر جديد', body: 'الأمطار تعود', url: '/news/', tag: 'news', log_id: 9 });
  assert.deepEqual(await r.json(), { sent: 21, failed: 1, removed: 1 });
  assert.equal(sentTo.length, 21);
  const del = calls.find((c) => c.method === 'DELETE')!;
  assert.match(del.url, /push_subscriptions\?id=in\.\(5\)$/);
  const log = calls.find((c) => c.method === 'PATCH')!;
  assert.match(log.url, /push_log\?id=eq\.9$/); assert.deepEqual(JSON.parse(log.body), { sent: 21, failed: 1 });
});
