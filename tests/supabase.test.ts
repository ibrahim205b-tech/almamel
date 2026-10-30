// يختبر قواعد أمان Supabase (supabase/schema.sql) على PostgreSQL محلي إذا كان متوفراً.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const dir = path.join(import.meta.dirname, '..', 'supabase');
// كـ root نستخدم مستخدم postgres؛ وفي CI يكون للمستخدم الحالي دور superuser.
function psql(args: string): string {
  const cmd = `psql ${args}`;
  const opts = { encoding: 'utf8' as const, stdio: ['ignore', 'pipe', 'pipe'] as ['ignore', 'pipe', 'pipe'] };
  return process.getuid?.() === 0 ? execFileSync('su', ['postgres', '-c', cmd], opts) : execFileSync('sh', ['-c', cmd], opts);
}
let available = true;
try { psql('-d postgres -tAc "select 1"'); } catch { available = false; }

test('Supabase row-level security rules hold', { skip: !available && 'PostgreSQL is not available' }, () => {
  const db = `dalil_rls_${process.pid}`;
  psql(`-d postgres -q -c "drop database if exists ${db}" -c "create database ${db}"`);
  try {
    const run = (f: string) => psql(`-q -v ON_ERROR_STOP=1 -d ${db} -f ${path.join(dir, f)}`);
    run('test/stubs.sql');
    run('schema.sql');
    run('schema.sql'); // آمن للتشغيل مرتين
    const out = run('test/rls.sql');
    assert.match(out, /ALL RLS TESTS PASSED/);
  } finally {
    psql(`-d postgres -q -c "drop database if exists ${db}"`);
  }
});
