// Node built-ins via require + local ambient declarations. The repo's tsconfig
// sets `types: ["jest"]` (no @types/node), so importing 'fs'/'path' or using
// __dirname directly fails `tsc --noEmit`. Declaring them locally keeps this
// file self-contained and avoids adding "node" to the global types array (which
// would shift setTimeout/Buffer typings across the whole RN codebase).
declare const __dirname: string;
const {readFileSync} = require('fs') as {readFileSync: (p: string, enc: string) => string};
const {join} = require('path') as {join: (...parts: string[]) => string};

// =============================================================================
// Version-consistency guard (runs in the same CI gate as the rest of the suite).
//
// This is a BARE Expo workflow: native iOS/Android folders are committed, so the
// version strings live in MULTIPLE files and are bumped by hand. Two invariants
// must hold or releases break:
//
//   1. runtimeVersion MUST be identical in app.json, iOS Expo.plist, and Android
//      strings.xml. It's the OTA compatibility key — an EAS Update only lands on
//      a build whose runtimeVersion matches. If these drift, OTA silently fails
//      to deliver (the update is "incompatible" and is skipped).
//
//   2. The marketing version (iOS MARKETING_VERSION, Android versionName) must
//      match across platforms, and runtimeVersion must track it (per the
//      CLAUDE.md rule: bump runtimeVersion simultaneously when bumping the
//      marketing version). We encode that as runtimeVersion starting with the
//      marketing version (e.g. "1.1.0" starts with "1.1").
//
// The `appVersion` runtimeVersion policy is NOT supported in a bare workflow, so
// a literal-string check like this is the only safeguard against drift.
// =============================================================================

const ROOT = join(__dirname, '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

// app.json → expo.runtimeVersion (must be a literal string in bare workflow)
function appJsonRuntimeVersion(): string {
  const app = JSON.parse(read('app.json'));
  const rv = app?.expo?.runtimeVersion;
  if (typeof rv !== 'string') {
    throw new Error(
      `app.json expo.runtimeVersion must be a literal string in a bare workflow, got: ${JSON.stringify(rv)}`,
    );
  }
  return rv;
}

// iOS Expo.plist → <key>EXUpdatesRuntimeVersion</key><string>X</string>
function iosRuntimeVersion(): string {
  const plist = read('ios/HotPickSports/Supporting/Expo.plist');
  const m = plist.match(/<key>EXUpdatesRuntimeVersion<\/key>\s*<string>([^<]+)<\/string>/);
  if (!m) throw new Error('EXUpdatesRuntimeVersion not found in ios/HotPickSports/Supporting/Expo.plist');
  return m[1].trim();
}

// Android strings.xml → <string name="expo_runtime_version">X</string>
function androidRuntimeVersion(): string {
  const xml = read('android/app/src/main/res/values/strings.xml');
  const m = xml.match(/<string name="expo_runtime_version">([^<]+)<\/string>/);
  if (!m) throw new Error('expo_runtime_version not found in android/app/src/main/res/values/strings.xml');
  return m[1].trim();
}

// iOS pbxproj → every `MARKETING_VERSION = X;` (Debug + Release configs)
function iosMarketingVersions(): string[] {
  const pbx = read('ios/HotPickSports.xcodeproj/project.pbxproj');
  const matches = [...pbx.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map((m) => m[1].trim());
  if (matches.length === 0) throw new Error('MARKETING_VERSION not found in project.pbxproj');
  return matches;
}

// Android build.gradle → versionName "X"
function androidVersionName(): string {
  const gradle = read('android/app/build.gradle');
  const m = gradle.match(/versionName\s+"([^"]+)"/);
  if (!m) throw new Error('versionName not found in android/app/build.gradle');
  return m[1].trim();
}

describe('app version consistency (bare workflow drift guard)', () => {
  test('runtimeVersion is identical across app.json, iOS, and Android', () => {
    const app = appJsonRuntimeVersion();
    const ios = iosRuntimeVersion();
    const android = androidRuntimeVersion();
    // Compare iOS + Android against app.json in one assertion so a failure shows
    // exactly which file drifted and to what value.
    expect({ios, android}).toEqual({ios: app, android: app});
  });

  test('marketing version matches across all iOS configs and Android', () => {
    const iosVersions = iosMarketingVersions();
    const android = androidVersionName();
    const all = [...iosVersions, android];
    const unique = [...new Set(all)];
    // One unique value ⇒ every iOS config + Android agree.
    expect(unique).toEqual([android]);
  });

  test('runtimeVersion tracks the marketing version (bump them together)', () => {
    const runtime = appJsonRuntimeVersion();
    const marketing = androidVersionName(); // already proven == iOS above
    // e.g. runtime "1.1.0" must start with marketing "1.1". Catches a marketing
    // bump (1.1 → 1.2) that forgot to bump runtimeVersion, and vice-versa.
    expect(runtime.startsWith(marketing)).toBe(true);
  });
});
