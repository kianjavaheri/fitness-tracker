import ActivityKit
import Capacitor
import Foundation

/// `RestActivity` in JS (src/native/rest.ts): shows the running rest as a Live Activity. The countdown is drawn by the
/// system from `endsAt`, so it stays right while the app is asleep; the "rest over" buzz is a local notification.
@objc(RestActivityPlugin)
public class RestActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "RestActivityPlugin"
    public let jsName = "RestActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
    ]

    /// Starts the rest, or moves the end of the one that's running (±15 s, or a new rest during the same workout).
    @objc func start(_ call: CAPPluginCall) {
        guard let endsAtMs = call.getDouble("endsAt") else {
            call.reject("endsAt is required")
            return
        }
        let endsAt = Date(timeIntervalSince1970: endsAtMs / 1000)
        let workoutName = call.getString("workoutName") ?? "Workout"
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            call.resolve(["shown": false])
            return
        }

        Task {
            let running = Activity<RestActivityAttributes>.activities
            let current = running.first { $0.attributes.workoutName == workoutName && $0.activityState == .active }
            for other in running where other.id != current?.id {
                await other.end(nil, dismissalPolicy: .immediate)
            }
            // Still counting down: an adjustment, so keep its start. Otherwise this is a fresh rest.
            let startedAt = current.flatMap { $0.content.state.endsAt > Date() ? $0.content.state.startedAt : nil } ?? Date()
            let content = ActivityContent(
                state: RestActivityAttributes.ContentState(startedAt: startedAt, endsAt: endsAt),
                staleDate: endsAt
            )
            if let current {
                await current.update(content)
            } else {
                do {
                    _ = try Activity.request(attributes: RestActivityAttributes(workoutName: workoutName), content: content)
                } catch {
                    call.reject(error.localizedDescription)
                    return
                }
            }
            call.resolve(["shown": true])
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        Task {
            for activity in Activity<RestActivityAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
            call.resolve()
        }
    }
}
