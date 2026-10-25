import Capacitor
import UIKit

/// The app's web view (set as the storyboard's view controller) — registers plugins that live in this app rather than
/// in npm packages.
class AppViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(RestActivityPlugin())
    }
}
