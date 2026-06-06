// `internal import` (not plain `import`) so the access level matches the
// generated ExpoModulesProvider.swift, which imports Expo as internal under
// Expo SDK 55 / Swift 6. Mixing implicit + explicit levels for the same module
// triggers "ambiguous implicit access level for import of 'Expo'".
internal import Expo
import React
import ReactAppDependencyProvider
import RNBootSplash

// Subclasses ExpoAppDelegate (not a bare UIResponder). ExpoAppDelegate boots
// ExpoModulesCore and forwards UIApplicationDelegate lifecycle events to every
// ExpoAppDelegateSubscriber (expo-notifications, expo-updates, expo-linking…).
// ExpoReactNativeFactory installs the `expo` JSI global (ExpoGlobal) that the
// expo-* JS modules read at load time — the piece that was missing before.
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
    bindReactNativeFactory(factory)

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "HotPickSports",
      in: window,
      launchOptions: launchOptions
    )

    // ExpoAppDelegate.application(_:didFinishLaunchingWithOptions:) dispatches
    // didFinishLaunching to all subscribers — must be called.
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  // Deep links (hotpick://) and universal links (https://hotpick.app) are now
  // handled by ExpoAppDelegate's openURL / continueUserActivity, which forward
  // to RCTLinkingManager and the Expo subscribers. The previous manual
  // NotificationCenter RCTOpenURLNotification workaround was needed only for the
  // bare RCTReactNativeFactory; keeping it here would double-fire the url event.
}

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func customize(_ rootView: RCTRootView) {
    super.customize(rootView)
    RNBootSplash.initWithStoryboard("BootSplash", rootView: rootView)
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
