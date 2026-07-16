#!/usr/bin/env node
// tools/check-home-spec-sync.mjs
//
// Drift guard for the hand-maintained mirror of the app's Home Screen copy.
// tools/hotpick-operator-console_v2.html restates copy that actually lives in
// src/shell/components/home/* (its HOME_SCREEN_SPECS / Spec Preview block). It
// can't import the app's TS, so it drifts silently. This script pulls the
// verbatim phrases the mirror claims the app shows and verifies every one still
// appears in the home components. Exit 1 on any drift, 2 on a structural problem.
//
// Convention: a DOUBLE-QUOTED phrase with NO {…} placeholder is verbatim app
// copy and is checked here. Unquoted or templated text is treated as a
// representation and skipped — so keep representations out of double quotes.
//
// SCOPE: console <-> app only. REFERENCE.md §11 was a second mirror and was
// checked here until its "Home Screen Copy" section was deleted. Home modules,
// state→content mapping and copy are now canonical in
// CLAUDE HQ / SOURCE OF TRUTH / HOME_MODULE_MAP.md, which lives outside CI's
// checkout — it cannot be verified from here, so it is deliberately not mirrored.
//
// Usage:  node tools/check-home-spec-sync.mjs

import {readFileSync, readdirSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const consolePath = join(root, 'tools', 'hotpick-operator-console_v2.html');
const homeDir = join(root, 'src', 'shell', 'components', 'home');

function fail(msg) {
  console.error(msg);
  process.exit(2);
}

// A quoted phrase is a verbatim candidate unless it carries a {…} placeholder.
const verbatim = (phrase) => !phrase.includes('{');

// ── source of truth: the app's home components ───────────────────────────────
const source = readdirSync(homeDir)
  .filter((f) => /\.tsx?$/.test(f))
  .map((f) => readFileSync(join(homeDir, f), 'utf8'))
  .join('\n');

// ── mirror: console HOME_SCREEN_SPECS (salutations + headlines) ───────────────
const html = readFileSync(consolePath, 'utf8');
const block = html.match(/const HOME_SCREEN_SPECS = (\{[\s\S]*?\n\});/);
if (!block) fail('Could not locate HOME_SCREEN_SPECS in ' + consolePath);
let specs;
try {
  specs = new Function('return (' + block[1] + ')')(); // our own object literal
} catch (e) {
  fail('Failed to parse HOME_SCREEN_SPECS: ' + e.message);
}
const consolePhrases = new Set();
for (const spec of Object.values(specs)) {
  for (const field of ['salutations', 'headlines']) {
    for (const entry of spec[field] || []) {
      const q = entry.match(/"([^"]+)"/); // first double-quoted phrase
      if (q && verbatim(q[1])) consolePhrases.add(q[1]);
    }
  }
}

// ── verify every verbatim phrase exists in the app source ────────────────────
const misses = [];
for (const phrase of consolePhrases) {
  if (!source.includes(phrase)) misses.push(phrase);
}

const rel = homeDir.replace(root + '/', '');
console.log(
  `check-home-spec-sync: verified ${consolePhrases.size} verbatim phrase(s) ` +
    `from the Operator Console against ${rel}`,
);
if (misses.length === 0) {
  console.log('✓ In sync — every verbatim phrase still appears in the app source.');
  process.exit(0);
}
console.error(`\n✗ DRIFT — ${misses.length} phrase(s) not found in the app source:`);
for (const phrase of misses) console.error(`    "${phrase}"`);
console.error('\nFix: update the mirror to match the app copy in ' + rel + ', or correct the app copy.');
console.error('Mirror: tools/hotpick-operator-console_v2.html (HOME_SCREEN_SPECS).');
process.exit(1);
