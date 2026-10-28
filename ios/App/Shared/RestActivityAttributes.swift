import ActivityKit
import Foundation

/// The live workout on the lock screen and in the Dynamic Island: the exercise and set you're on, the time so far, and
/// the rest under way. Shared by the app (which starts, updates and stops it, see RestActivityPlugin) and the
/// RestTimerWidget extension (which draws it).
struct RestActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        /// "Bench Press", or "All sets done".
        var exercise: String
        /// "Set 2 of 3", "Warm-up".
        var detail: String
        /// The rest under way: when it began (kept across ±15 s adjustments, so the bar stays honest) and ends. Nil
        /// when not resting.
        var restStartedAt: Date?
        var restEndsAt: Date?
        /// The app's theme, so the lock screen matches it.
        var dark: Bool
    }

    var workoutName: String
    /// When the workout began, for the time so far.
    var startedAt: Date
}
