import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { parseEnv } from 'node:util';
import { auditPublicFile } from '../lib/public-audit.mjs';

const mode = process.argv[2];
if (mode && !['--staged', '--history'].includes(mode))
  throw new Error('Use --staged, --history, or no option.');
const git = (args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
const fileEnv = fs.existsSync('.env') ? parseEnv(fs.readFileSync('.env', 'utf8')) : {};
const secrets = [
  process.env.API_USERNAME,
  process.env.API_PASSWORD,
  fileEnv.API_USERNAME,
  fileEnv.API_PASSWORD,
].filter(Boolean);
const failures = [];
let checked = 0;
function check(filename, contents) {
  checked++;
  const findings = auditPublicFile(filename, contents, secrets);
  if (findings.length) failures.push(`${filename}: ${findings.join(', ')}`);
}
if (mode === '--history') {
  const revisions = git(['rev-list', '--all']).trim().split('\n').filter(Boolean);
  const seen = new Set();
  for (const revision of revisions) {
    const entries = git(['ls-tree', '-rz', revision]).split('\0').filter(Boolean);
    for (const entry of entries) {
      const separator = entry.indexOf('\t');
      const [, type, oid] = entry.slice(0, separator).split(' ');
      const filename = entry.slice(separator + 1);
      if (type !== 'blob' || seen.has(`${oid}:${filename}`)) continue;
      seen.add(`${oid}:${filename}`);
      check(filename, Buffer.from(git(['cat-file', 'blob', oid])));
    }
  }
} else {
  const files = git(
    mode === '--staged'
      ? ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']
      : ['ls-files', '-z'],
  )
    .split('\0')
    .filter(Boolean);
  for (const filename of files) {
    const contents =
      mode === '--staged' ? Buffer.from(git(['show', `:${filename}`])) : fs.readFileSync(filename);
    check(filename, contents);
  }
}
if (failures.length) {
  console.error('Public-file audit failed:\n' + failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(
    `Public-file audit passed: ${checked} files${mode === '--history' ? ' across Git history' : ''}.`,
  );
}
