#!/usr/bin/env node
// tools/check-home-spec-sync.mjs
//
// Drift guard for the Operator Console's "Home Screen Spec Preview".
// tools/hotpick-operator-console.html hand-mirrors the app's Home Screen copy
// (it's a standalone file and can't import the app's TS). This script extracts
// the exact-copy phrases that preview claims the app shows and verifies each
// still appears somewhere in src/shell/components/home/*.
//
// Convention: in HOME_SCREEN_SPECS, a double-quoted phrase in `salutations` or
// `headlines` with NO {…} placeholder is treated as verbatim app copy and is
// checked here. Unquoted or templated entries are representations and skipped.
//
// Usage:  node tools/check-home-spec-sync.mjs       (exit 1 if drift is found)

import {readFileSync, readdirSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const consolePath = join(root, 'tools', 'hotpick-operator-console.html');
const homeDir = join(root, 'src', 'shell', 'components', 'home');

const html = readFileSync(consolePath, 'utf8');
const block = html.match(/const HOME_SCREEN_SPECS = (\{[\s\S]*?\n\});/);
if (!block) {
  console.error('Could not locate HOME_SCREEN_SPECS in', consolePath);
  process.exit(2);
}

let specs;
try {
  specs = new Function('return (' + block[1] + ')')(); // our own object literal
} catch (e) {
  console.error('Failed to parse HOME_SCREEN_SPECS:', e.message);
  process.exit(2);
}

const source = readdirSync(homeDir)
  .filter((f) => /\.tsx?$/.test(f))
  .map((f) => readFileSync(join(homeDir, f), 'utf8'))
  .join('\n');

const candidates = [];
for (const [state, spec] of Object.entries(specs)) {
  for (const field of ['salutations', 'headlines']) {
    for (const entry of spec[field] || []) {
      const q = entry.match(/"([^"]+)"/); // first double-quoted phrase
      if (!q) continue; // a representation, not verbatim copy
      const phrase = q[1];
      if (phrase.includes('{')) continue; // templated — won't match literally
      candidates.push({state, field, phrase});
    }
  }
}

const missing = candidates.filter((c) => !source.includes(c.phrase));

console.log(
  `check-home-spec-sync: verified ${candidates.length} verbatim phrase(s) against ${homeDir.replace(root + '/', '')}`,
);
if (missing.length === 0) {
  console.log('✓ In sync — every verbatim phrase still appears in the app source.');
  process.exit(0);
}
console.error(`\n✗ DRIFT — ${missing.length} phrase(s) shown by the console are not in the app source:`);
for (const c of missing) console.error(`    [${c.state}.${c.field}]  "${c.phrase}"`);
console.error('\nFix: update HOME_SCREEN_SPECS in tools/hotpick-operator-console.html to match the app,');
console.error('or correct the app copy in src/shell/components/home/*.');
process.exit(1);
