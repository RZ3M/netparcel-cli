import test from 'node:test';
import assert from 'node:assert/strict';
import { auditPublicFile } from '../lib/public-audit.mjs';

test('credentials, customer inputs, research captures, and PDFs are rejected regardless of file contents', () => {
  for (const file of [
    '.env',
    '.env.production',
    'labels/123/response.json',
    'shipments/new.json',
    'research/results/data.json',
    'nested/labels/example.json',
    'docs/label.pdf',
  ]) {
    assert.ok(auditPublicFile(file, Buffer.from('{}')).includes('private or generated file'));
  }
  assert.deepEqual(
    auditPublicFile('.env.example', Buffer.from('API_USERNAME=\nAPI_PASSWORD=\n')),
    [],
  );
});

test('local credentials are detected in unexpected public file paths', () => {
  assert.deepEqual(
    auditPublicFile('README.md', Buffer.from('a canary credential'), ['canary credential']),
    ['local API credential'],
  );
});

test('token, key, and embedded label checks do not require local credentials', () => {
  const token = 'ghp_' + 'a'.repeat(36);
  const key = '-----BEGIN ' + 'PRIVATE KEY-----';
  const label = JSON.stringify({ base64_encoded_string: 'A'.repeat(100) });
  assert.deepEqual(auditPublicFile('docs/example.txt', Buffer.from(token)), ['GitHub token']);
  assert.deepEqual(auditPublicFile('docs/example.txt', Buffer.from(key)), ['private key']);
  assert.deepEqual(auditPublicFile('docs/example.json', Buffer.from(label)), [
    'embedded shipment document',
  ]);
});
