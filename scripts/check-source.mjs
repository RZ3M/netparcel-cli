import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

let checked = 0;
for (const directory of ['lib', 'scripts', 'tests']) {
  for (const name of fs.readdirSync(directory)) {
    if (
      !name.endsWith('.mjs') ||
      name.startsWith('netparcel-soap-') ||
      name === 'netparcel-rates.mjs'
    )
      continue;
    execFileSync(process.execPath, ['--check', path.join(directory, name)], { stdio: 'inherit' });
    checked++;
  }
}
for (const file of ['package.json', 'package-lock.json', 'examples/shipment.template.json']) {
  JSON.parse(fs.readFileSync(file, 'utf8'));
}
console.log(`Syntax checked ${checked} JavaScript files and public JSON files.`);
