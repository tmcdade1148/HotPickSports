/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { initMonitoring } from '@shared/monitoring/sentry';
import { installFontScaleCap } from '@shared/setup/fontScaleCap';

// Cap OS font scaling app-wide before anything renders, so accessibility
// "Larger Text" enlarges our type only up to a ceiling instead of overflowing
// fixed layouts everywhere (see @shared/setup/fontScaleCap).
installFontScaleCap();

// Initialise crash/error monitoring before anything renders. No-ops safely when
// no DSN is configured or the native module isn't linked yet (see the module
// and docs/SENTRY.md). App.tsx wraps the root component via wrapWithMonitoring.
initMonitoring();

// Must match android/app/src/main/java/com/hotpicksports/MainActivity.kt
// and ios/HotPickSports/AppDelegate.swift — those are the source of truth.
AppRegistry.registerComponent('HotPickSports', () => App);
