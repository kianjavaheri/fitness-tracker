import ActivityKit
import Capacitor
import Foundation

/// `RestActivity` in JS (src/native/rest.ts): shows the live workout as a Live Activity on the lock screen and in the
/// Dynamic Island: the exercise and set you're on, and the rest under way. Countdowns are drawn by the system from
/// dates, so they stay right while the app is asleep; the "rest over" buzz is a local notification.
@objc(RestActivityPlugin)
public class RestActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "RestActivityPlugin"
    public let jsName = "RestActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
    ]

    /// `{ workoutName, startedAt, exercise, detail, restEndsAt, dark }` (times in ms; restEndsAt 0 = not resting).
    /// Starts the workout's activity, or updates the one showing.
    @objc func start(_ call: CAPPluginCall) {
        let workoutName = call.getString("workoutName") ?? "Workout"
        let startedAt = Date(timeIntervalSince1970: (call.getDouble("startedAt") ?? Date().timeIntervalSince1970 * 1000) / 1000)
        let restEndsAtMs = call.getDouble("restEndsAt") ?? 0
        let restEndsAt = restEndsAtMs > 0 ? Date(timeIntervalSince1970: restEndsAtMs / 1000) : nil
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            call.resolve(["shown": false])
            return
        }

        Task {
            let running = Activity<RestActivityAttributes>.activities
            let active = running.first { $0.activityState == .active }
            // The name and start are fixed for an activity's life, so a renamed workout gets a new one.
            let current = active.flatMap { $0.attributes.workoutName == workoutName && $0.attributes.startedAt == startedAt ? $0 : nil }
            for other in running where other.id != current?.id {
                await other.end(nil, dismissalPolicy: .immediate)
            }
            // A rest still counting down that's only been adjusted (±15 s) keeps its start; otherwise it starts now.
            var restStartedAt: Date? = nil
            if let restEndsAt {
                let previous = active?.content.state
                if let start = previous?.restStartedAt, let end = previous?.restEndsAt, end > Date(), start < restEndsAt {
                    restStartedAt = start
                } else {
                    restStartedAt = Date()
                }
            }
            let state = RestActivityAttributes.ContentState(
                exercise: call.getString("exercise") ?? "",
                detail: call.getString("detail") ?? "",
                restStartedAt: restStartedAt,
                restEndsAt: restEndsAt,
                dark: call.getBool("dark") ?? true
            )
            let content = ActivityContent(state: state, staleDate: nil)
            if let current {
                await current.update(content)
            } else {
                do {
                    _ = try Activity.request(attributes: RestActivityAttributes(workoutName: workoutName, startedAt: startedAt), content: content)
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
