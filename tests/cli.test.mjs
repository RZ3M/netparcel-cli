import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runCli } from '../lib/cli.mjs';

fs.mkdirSync('tmp/tests', { recursive: true });
const root = fs.mkdtempSync(path.resolve('tmp/tests/cli-'));
const mockPdf = Buffer.from('%PDF-1.4\nmock label\n').toString('base64');
function options(overrides = {}) {
  const output = [];
  const error = [];
  return {
    output,
    error,
    settings: {
      cwd: root,
      env: {},
      fetchImpl: () => assert.fail('Unexpected network request'),
      stdout: (text) => output.push(text),
      stderr: (text) => error.push(text),
      ...overrides,
    },
  };
}

test('help and version work without credentials or network access', async () => {
  for (const args of [[], ['--help'], ['--version']]) {
    const { settings, output, error } = options();
    assert.equal(await runCli(args, settings), 0);
    assert.equal(output.length, 1);
    assert.equal(error.length, 0);
  }
});

test('crop dispatches the local PDF helper without credentials or network access', async () => {
  let calls = 0;
  const { settings, output, error } = options({
    env: { NETPARCEL_PYTHON: 'configured-python' },
    execPython: (executable, args) => {
      calls++;
      assert.equal(executable, 'configured-python');
      assert.ok(args[0].endsWith('crop-label.py'));
      assert.deepEqual(args.slice(1), [
        path.join(root, 'original.pdf'),
        path.join(root, 'print.pdf'),
        '--page',
        '2',
      ]);
      return JSON.stringify({ output: path.join(root, 'print.pdf'), page_inches: [4, 6] });
    },
  });
  assert.equal(
    await runCli(['crop', 'original.pdf', '--out', 'print.pdf', '--page', '2'], settings),
    0,
  );
  assert.equal(calls, 1);
  assert.deepEqual(JSON.parse(output[0]).page_inches, [4, 6]);
  assert.equal(error.length, 0);
});

test('crop rejects invalid output paths and page numbers before invoking Python', async () => {
  const { settings } = options({ execPython: () => assert.fail('Python must not run') });
  for (const args of [
    ['crop', 'original.pdf', '--out', 'original.pdf'],
    ['crop', 'original.pdf', '--out', 'print.json'],
    ['crop', 'original.pdf', '--out', 'print.pdf', '--page', '0'],
    ['crop', 'original.pdf', '--out', 'print.pdf', '--unknown', 'value'],
  ])
    assert.equal(await runCli(args, settings), 1);
});

test('global-install usage does not read credentials from the source checkout', async () => {
  const { settings, error } = options();
  assert.equal(await runCli(['order', '123'], settings), 1);
  assert.match(error[0], /Missing API_USERNAME or API_PASSWORD/);
});

test('credentials and private outputs use the working directory, with environment overrides', async () => {
  const cwd = path.join(root, 'configured');
  fs.mkdirSync(cwd);
  fs.writeFileSync(
    path.join(cwd, '.env'),
    'API_USERNAME=file-user\nAPI_PASSWORD=file-password\nNETPARCEL_DATA_DIR=private-data\n',
  );
  let calls = 0;
  const { settings, output } = options({
    cwd,
    env: { API_PASSWORD: 'environment-password' },
    fetchImpl: async (url, init) => {
      calls++;
      assert.equal(init.headers.API_USERNAME, 'file-user');
      assert.equal(init.headers.API_PASSWORD, 'environment-password');
      assert.deepEqual(JSON.parse(init.body), { order: { order_id: 123 } });
      return new Response(
        JSON.stringify({
          order: {
            order_id: 123,
            service_name: 'Mock service',
            documents: [{ document_name: 'labels', base64_encoded_string: mockPdf }],
          },
        }),
        { status: 200 },
      );
    },
  });
  assert.equal(await runCli(['order', '123'], settings), 0);
  assert.equal(calls, 1);
  const saved = JSON.parse(output[0]);
  assert.equal(path.dirname(saved.documents[0]), path.join(cwd, 'private-data', '123'));
  assert.ok(fs.existsSync(saved.documents[0]));
});

test('invalid order IDs and incomplete purchase templates cannot reach the network', async () => {
  const { settings, error } = options({
    env: { API_USERNAME: 'dummy-user', API_PASSWORD: 'dummy-password' },
  });
  assert.equal(await runCli(['order', '../123'], settings), 1);
  fs.copyFileSync('examples/shipment.template.json', path.join(root, 'shipment.json'));
  assert.equal(
    await runCli(
      [
        'buy',
        'shipment.json',
        '--service',
        '204',
        '--max-price',
        '20',
        '--currency',
        'CAD',
        '--key',
        'mock-order',
      ],
      settings,
    ),
    1,
  );
  assert.match(error.at(-1), /Complete these fields/);
});

test('partial rate warnings and API errors redact credentials in all CLI output', async () => {
  fs.writeFileSync(path.join(root, 'quote.json'), JSON.stringify({ ship: {} }));
  const { settings, output, error } = options({
    env: { API_USERNAME: 'canary-user', API_PASSWORD: 'canary-password' },
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          rates: [
            {
              service_code: '204',
              total_price: '15',
              currency: 'CAD',
              service_name: 'Mock service',
            },
          ],
          errors: [{ errorMessage: 'canary-user canary-password' }],
        }),
        { status: 200 },
      ),
  });
  assert.equal(await runCli(['quote', 'quote.json'], settings), 0);
  assert.equal(JSON.parse(output[0]).length, 1);
  assert.match(error[0], /\[redacted\] \[redacted\]/);
  assert.doesNotMatch(output.concat(error).join('\n'), /canary-user|canary-password/);
});
