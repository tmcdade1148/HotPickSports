// Dynamic Expo config wrapper.
//
// In a BARE workflow, the android.googleServicesFile field is cosmetic:
// EAS Build skips `expo prebuild` when the android/ directory already
// exists, so this field is read into the resolved config but nothing
// copies the file into the native project. That copy happens via the
// `eas-build-pre-install` npm script in package.json — it reads
// $GOOGLE_SERVICES_JSON (the EAS file-type env var path) and drops the
// file at android/app/google-services.json where the Google Services
// Gradle plugin expects it.
//
// We keep the field here for two reasons:
//   1. Future-proofing: if the native projects are ever regenerated via
//      `expo prebuild`, this field tells prebuild where to pull the file.
//   2. Accuracy: `npx expo config` and the EAS dashboard show this
//      resolved path, which matches what actually lands on disk.
//
// Static app.json fields don't receive env-var substitution (we saw
// "$GOOGLE_SERVICES_JSON" get passed through as a literal string), which
// is why this dynamic wrapper exists at all.
//
// Local dev: process.env.GOOGLE_SERVICES_JSON is undefined, so we fall
// back to the literal on-disk path. The file is gitignored but present
// on the developer's machine.

const appJson = require('./app.json');

module.exports = ({ config }) => {
  const expoConfig = { ...appJson.expo, ...config };

  return {
    ...expoConfig,
    android: {
      ...expoConfig.android,
      googleServicesFile:
        process.env.GOOGLE_SERVICES_JSON ?? './android/app/google-services.json',
    },
  };
};
