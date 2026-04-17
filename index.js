/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';

// Must match android/app/src/main/java/com/hotpicksports/MainActivity.kt
// and ios/HotPickSports/AppDelegate.swift — those are the source of truth.
AppRegistry.registerComponent('HotPickSports', () => App);
