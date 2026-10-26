import Capacitor
import UIKit

/// The app's web view (SceneDelegate's root view controller): registers plugins that live in this app rather than in
/// npm packages, and brings back iOS's scroll bounce, which Capacitor turns off.
class AppViewController: CAPBridgeViewController {
    private let sidewaysPan = UIPanGestureRecognizer()
    private let sidewaysPanDelegate = SidewaysPanDelegate()

    /// Live reload (`npm run ios:live`) writes the Mac's dev server address into the app's config. A build archived
    /// while that was in place opened the app from the Mac: fine at home, a blank gray screen anywhere else. So only
    /// Debug builds (Run from Xcode) follow it; Release builds (Archive, TestFlight) always open their bundled copy.
    override open func instanceDescriptor() -> InstanceDescriptor {
        let descriptor = super.instanceDescriptor()
        #if !DEBUG
        descriptor.serverURL = nil
        #endif
        return descriptor
    }

    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(RestActivityPlugin())
        bridge?.registerPluginInstance(AppHapticsPlugin())
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        guard let webView = webView else { return }
        // Rubber-band at the top and bottom like any iOS app, even on pages shorter than the screen; never sideways
        // (tabs are swiped by the page itself).
        webView.scrollView.bounces = true
        webView.scrollView.alwaysBounceVertical = true
        webView.scrollView.alwaysBounceHorizontal = false

        // Sideways drags belong to the page (tab swipes, edge swipe back, chart scrubbing). Because the scroll view
        // can always bounce vertically, its pan used to start on almost any drag, and WebKit cancels the page's touch
        // when it does: swipes stopped part-way with the next tab peeking in. This recognizer claims drags that are
        // mostly sideways, and the scroll pan waits for it to fail. It never blocks the page's own touch events.
        sidewaysPan.delegate = sidewaysPanDelegate
        sidewaysPan.cancelsTouchesInView = false
        sidewaysPan.delaysTouchesBegan = false
        sidewaysPan.delaysTouchesEnded = false
        webView.addGestureRecognizer(sidewaysPan)
        webView.scrollView.panGestureRecognizer.require(toFail: sidewaysPan)
    }
}

/// Lets the sideways pan begin only for drags flatter than about 63° (the page's swipe code decides within that), and
/// run alongside every other recognizer, so taps, long presses, text selection and inner sideways scrollers still work.
private final class SidewaysPanDelegate: NSObject, UIGestureRecognizerDelegate {
    func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        guard let pan = gestureRecognizer as? UIPanGestureRecognizer else { return true }
        let moved = pan.translation(in: pan.view)
        return abs(moved.x) > abs(moved.y) * 0.5
    }

    func gestureRecognizer(
        _ gestureRecognizer: UIGestureRecognizer,
        shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
    ) -> Bool {
        true
    }
}
