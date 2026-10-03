import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { parseEnv } from 'node:util';
import { auditPublicFile } from '../lib/public-audit.mjs';

if (!process.env.npm_execpath) throw new Error('Run this check with npm run check:package.');
const packed = JSON.parse(
  execFileSync(
    process.execPath,
    [process.env.npm_execpath, 'pack', '--dry-run', '--json', '--ignore-scripts'],
    { encoding: 'utf8' },
  ),
)[0];
const fileEnv = fs.existsSync('.env') ? parseEnv(fs.readFileSync('.env', 'utf8')) : {};
const secrets = [
  process.env.API_USERNAME,
  process.env.API_PASSWORD,
  fileEnv.API_USERNAME,
  fileEnv.API_PASSWORD,
].filter(Boolean);
const allowed = new Set([
  'package.json',
  'README.md',
  'LICENSE',
  'SECURITY.md',
  '.env.example',
  'lib/cli.mjs',
  'lib/netparcel.mjs',
  'scripts/netparcel.mjs',
  'examples/shipment.template.json',
]);
for (const file of packed.files) {
  if (!allowed.has(file.path) && !file.path.startsWith('docs/'))
    throw new Error(`Unexpected packaged file: ${file.path}`);
  const findings = auditPublicFile(file.path, fs.readFileSync(file.path), secrets);
  if (findings.length)
    throw new Error(`Package audit failed: ${file.path}: ${findings.join(', ')}`);
}
for (const file of [
  'scripts/netparcel.mjs',
  'lib/cli.mjs',
  'lib/netparcel.mjs',
  'README.md',
  'LICENSE',
]) {
  if (!packed.files.some((entry) => entry.path === file))
    throw new Error(`Missing packaged file: ${file}`);
}
console.log(
  `Package audit passed: ${packed.files.length} files, ${packed.unpackedSize} unpacked bytes.`,
);
