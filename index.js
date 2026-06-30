/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { installFontScaleCap } from '@shared/setup/fontScaleCap';

// Cap OS font scaling app-wide before anything renders, so accessibility
// "Larger Text" enlarges our type only up to a ceiling instead of overflowing
// fixed layouts everywhere (see @shared/setup/fontScaleCap).
installFontScaleCap();

// Must match android/app/src/main/java/com/hotpicksports/MainActivity.kt
// and ios/HotPickSports/AppDelegate.swift — those are the source of truth.
AppRegistry.registerComponent('HotPickSports', () => App);
