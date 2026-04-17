// Dynamic Expo config wrapper.
//
// Exists because EAS Build's file-type environment variables (e.g.
// GOOGLE_SERVICES_JSON) are only substituted into fields that resolve
// through a JavaScript config. Static app.json fields like
// android.googleServicesFile receive no substitution — we saw
// "$GOOGLE_SERVICES_JSON" get passed to Gradle as a literal string.
//
// Reads the static config from app.json, then layers on dynamic fields
// that need env-var resolution. Any future EAS file-type env var (e.g.
// ios GoogleService-Info.plist when iOS moves to EAS Build) plugs in
// here the same way.
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
