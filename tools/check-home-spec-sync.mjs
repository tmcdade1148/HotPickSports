#!/usr/bin/env node
// tools/check-home-spec-sync.mjs
//
// Drift guard for the hand-maintained mirrors of the app's Home Screen copy.
// Two files restate copy that actually lives in src/shell/components/home/*:
//   1. tools/hotpick-operator-console_v2.html  — HOME_SCREEN_SPECS (Spec Preview)
//   2. REFERENCE.md §11                      — "Home Screen Copy — two engines"
// Neither can import the app's TS, so they drift silently. This script pulls the
// verbatim phrases each mirror claims the app shows and verifies every one still
// appears in the home components. Exit 1 on any drift, 2 on a structural problem.
//
// Convention (both mirrors): a DOUBLE-QUOTED phrase with NO {…} placeholder is
// verbatim app copy and is checked here. Unquoted or templated text is treated
// as a representation and skipped — so keep representations out of double quotes.
//
// Usage:  node tools/check-home-spec-sync.mjs

import {readFileSync, readdirSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const consolePath = join(root, 'tools', 'hotpick-operator-console_v2.html');
const referencePath = join(root, 'REFERENCE.md');
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

// ── mirror 1: console HOME_SCREEN_SPECS (salutations + headlines) ─────────────
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

// ── mirror 2: REFERENCE.md §11 "Home Screen Copy" section ─────────────────────
const ref = readFileSync(referencePath, 'utf8');
const startIdx = ref.indexOf('### Home Screen Copy');
if (startIdx === -1) {
  fail(
    'Could not find the "### Home Screen Copy" section in REFERENCE.md — ' +
      'if you renamed it, update the anchor in this checker.',
  );
}
const after = ref.slice(startIdx + '### '.length);
const end = after.search(/\n### /); // next subsection heading
const refSection = end === -1 ? after : after.slice(0, end);
const refPhrases = new Set();
for (const m of refSection.matchAll(/"([^"]+)"/g)) {
  if (verbatim(m[1])) refPhrases.add(m[1]);
}

// ── verify every verbatim phrase exists in the app source ────────────────────
const mirrors = [
  {label: 'console HOME_SCREEN_SPECS', phrases: consolePhrases},
  {label: 'REFERENCE.md §11', phrases: refPhrases},
];
let total = 0;
const misses = [];
for (const {label, phrases} of mirrors) {
  for (const phrase of phrases) {
    total++;
    if (!source.includes(phrase)) misses.push({label, phrase});
  }
}

const rel = homeDir.replace(root + '/', '');
console.log(
  `check-home-spec-sync: verified ${total} verbatim phrase(s) ` +
    `(${consolePhrases.size} console, ${refPhrases.size} REFERENCE.md) against ${rel}`,
);
if (misses.length === 0) {
  console.log('✓ In sync — every verbatim phrase still appears in the app source.');
  process.exit(0);
}
console.error(`\n✗ DRIFT — ${misses.length} phrase(s) not found in the app source:`);
for (const {label, phrase} of misses) console.error(`    [${label}]  "${phrase}"`);
console.error('\nFix: update the mirror to match the app copy in ' + rel + ', or correct the app copy.');
console.error('Mirrors: tools/hotpick-operator-console_v2.html (HOME_SCREEN_SPECS), REFERENCE.md §11.');
process.exit(1);
