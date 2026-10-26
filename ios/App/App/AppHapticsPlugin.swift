import AudioToolbox
import Capacitor
import CoreHaptics
import UIKit

/// `AppHaptics` in JS (src/utils/haptics.ts). Plays taps through Core Haptics, driving the Taptic Engine directly:
/// UIImpactFeedbackGenerator calls went through (logged) but were silent inside this web view app. Falls back to the
/// system "peek" tap if Core Haptics can't run. Logs to the Xcode console as [AppHaptics].
@objc(AppHapticsPlugin)
public class AppHapticsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppHapticsPlugin"
    public let jsName = "AppHaptics"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "prepare", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "impact", returnType: CAPPluginReturnPromise),
    ]

    private var engine: CHHapticEngine?
    private let supported = CHHapticEngine.capabilitiesForHardware().supportsHaptics

    /// Main thread only. Starts (or restarts) the engine; iOS stops it when the app goes to the background.
    private func startedEngine() -> CHHapticEngine? {
        guard supported else { return nil }
        if engine == nil {
            do {
                let made = try CHHapticEngine()
                made.playsHapticsOnly = true
                made.isAutoShutdownEnabled = true
                made.resetHandler = { [weak self] in
                    DispatchQueue.main.async { try? self?.engine?.start() }
                }
                made.stoppedHandler = { reason in NSLog("[AppHaptics] engine stopped (%d)", reason.rawValue) }
                engine = made
            } catch {
                NSLog("[AppHaptics] couldn't create engine: %@", error.localizedDescription)
                return nil
            }
        }
        do {
            try engine?.start()
        } catch {
            NSLog("[AppHaptics] couldn't start engine: %@", error.localizedDescription)
            return nil
        }
        return engine
    }

    private func intensity(_ call: CAPPluginCall) -> Float {
        switch call.getString("style") {
        case "light": return 0.5
        case "heavy": return 1.0
        default: return 0.75
        }
    }

    @objc func prepare(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            _ = self.startedEngine()
            call.resolve()
        }
    }

    @objc func impact(_ call: CAPPluginCall) {
        let intensity = intensity(call)
        DispatchQueue.main.async {
            if let engine = self.startedEngine() {
                do {
                    let event = CHHapticEvent(
                        eventType: .hapticTransient,
                        parameters: [
                            CHHapticEventParameter(parameterID: .hapticIntensity, value: intensity),
                            CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.5),
                        ],
                        relativeTime: 0
                    )
                    let player = try engine.makePlayer(with: CHHapticPattern(events: [event], parameters: []))
                    try player.start(atTime: CHHapticTimeImmediate)
                    NSLog("[AppHaptics] core haptics tap %.2f", intensity)
                    call.resolve()
                    return
                } catch {
                    NSLog("[AppHaptics] core haptics failed: %@", error.localizedDescription)
                }
            }
            // 1519 is the system "peek" tap: a short vibration with no sound.
            AudioServicesPlaySystemSound(1519)
            NSLog("[AppHaptics] fallback system tap")
            call.resolve()
        }
    }
}
