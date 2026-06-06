// `internal import` (not plain `import`) so the access level matches the
// generated ExpoModulesProvider.swift, which imports Expo as internal under
// Expo SDK 55 / Swift 6. Mixing implicit + explicit levels for the same module
// triggers "ambiguous implicit access level for import of 'Expo'".
internal import Expo
import React
import ReactAppDependencyProvider
import RNBootSplash

// Subclasses ExpoAppDelegate so ExpoModulesCore boots and forwards lifecycle
// (incl. deep links / universal links) to its subscribers. ExpoReactNativeFactory
// installs the `expo` JSI global (ExpoGlobal) the expo-* JS modules read at load.
@main
class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "HotPickSports",
      in: window,
      launchOptions: launchOptions
    )

    // ExpoAppDelegate dispatches didFinishLaunching to all subscribers.
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    // bridge.bundleURL first so expo-dev-client returns the correct URL.
    bridge.bundleURL ?? bundleURL()
  }

  override func customize(_ rootView: RCTRootView) {
    super.customize(rootView)
    RNBootSplash.initWithStoryboard("BootSplash", rootView: rootView)
  }

  override func bundleURL() -> URL? {
#if DEBUG
    // Expo's virtual entry (not "index") — matches expo/metro-config, which the
    // project uses so EAS can produce OTA-compatible bundles.
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
