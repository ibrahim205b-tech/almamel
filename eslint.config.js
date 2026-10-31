import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules/', 'data/', 'backups/', 'coverage/', 'dist/', 'dist-admin/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      'no-restricted-syntax': ['error',
        { selector: "CallExpression[callee.property.name='exec'][arguments.0.type='TemplateLiteral']", message: 'لا تبنِ SQL بقوالب نصية؛ استخدم prepare مع معاملات.' }],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
    },
  },
  {
    files: ['public/js/**/*.js'],
    languageOptions: { sourceType: 'script', globals: { window: 'readonly', document: 'readonly', navigator: 'readonly', URL: 'readonly', URLSearchParams: 'readonly', FormData: 'readonly', fetch: 'readonly', location: 'readonly', setTimeout: 'readonly', alert: 'readonly', prompt: 'readonly', confirm: 'readonly', crypto: 'readonly', createImageBitmap: 'readonly', Intl: 'readonly', Uint8Array: 'readonly', Promise: 'readonly', localStorage: 'readonly', IntersectionObserver: 'readonly', Option: 'readonly' } },
    rules: { 'no-var': 'off' },
  },
);
