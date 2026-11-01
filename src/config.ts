import path from 'node:path';

export interface Config {
  env: 'production' | 'development' | 'test';
  host: string;
  port: number;
  baseUrl: string;
  sessionSecret: string;
  databasePath: string;
  uploadDir: string;
  backupDir: string;
  trustProxy: boolean;
  cookieSecure: boolean;
  adminRequireMfa: boolean;
  staticMode: boolean;
  repo: string; // owner/name على GitHub (لروابط النشر في النسخة الثابتة)
  supabaseUrl: string; // النسخة الثابتة: مشروع Supabase للنماذج والحسابات (فارغ = غير مفعّل)
  supabaseAnonKey: string;
  /** موقع الإدارة المنفصل (نسخة ثابتة): صفحات الإدارة فقط. */
  adminSite: boolean;
  /** صفحة تسجيل المحلات الخاصة (رابط يُرسل للزبون فقط). */
  registerSite: boolean;
  /** موقع المطعم المنفصل: استلام الطلبات وإدارة القائمة. */
  kitchenSite: boolean;
  /** رابط الموقع العام (يظهر في موقع الإدارة). */
  publicUrl: string;
}

const bool = (v: string | undefined, def: boolean) => (v === undefined || v === '' ? def : v === 'true' || v === '1');

export function loadConfig(overrides: Partial<Config> = {}, env = process.env): Config {
  const mode = (env.NODE_ENV === 'production' || env.NODE_ENV === 'test' ? env.NODE_ENV : 'development') as Config['env'];
  const prod = mode === 'production';
  const cfg: Config = {
    env: mode,
    host: env.HOST || '127.0.0.1',
    port: Number(env.PORT || 3000),
    // على Render يُضبط RENDER_EXTERNAL_URL تلقائياً؛ BASE_URL (عند ربط نطاق خاص) له الأولوية
    baseUrl: (env.BASE_URL || env.RENDER_EXTERNAL_URL || `http://localhost:${env.PORT || 3000}`).replace(/\/+$/, ''),
    sessionSecret: env.SESSION_SECRET || (prod ? '' : 'development-only-secret-not-for-production-use-000000'),
    databasePath: path.resolve(env.DATABASE_PATH || './data/dalil.db'),
    uploadDir: path.resolve(env.UPLOAD_DIR || './data/uploads'),
    backupDir: path.resolve(env.BACKUP_DIR || './backups'),
    trustProxy: bool(env.TRUST_PROXY, false),
    cookieSecure: bool(env.COOKIE_SECURE, prod),
    adminRequireMfa: bool(env.ADMIN_REQUIRE_MFA, prod),
    staticMode: false,
    repo: env.GITHUB_REPOSITORY || 'ibrahim205b-tech/almamel',
    supabaseUrl: '',
    supabaseAnonKey: '',
    adminSite: false,
    registerSite: false,
    kitchenSite: false,
    publicUrl: '',
    ...overrides,
  };
  if (cfg.sessionSecret.length < 32 || cfg.sessionSecret === 'replace-with-a-long-random-value') {
    throw new Error('SESSION_SECRET must be set to a random value of at least 32 characters.');
  }
  if (prod && !cfg.baseUrl.startsWith('https://')) {
    throw new Error('BASE_URL must use https:// in production.');
  }
  return cfg;
}
