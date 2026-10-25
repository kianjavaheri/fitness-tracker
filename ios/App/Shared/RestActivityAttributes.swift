import ActivityKit
import Foundation

/// The rest timer on the lock screen and in the Dynamic Island. Shared by the app (which starts and stops it, see
/// RestActivityPlugin) and the RestTimerWidget extension (which draws it).
struct RestActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        /// When this rest began (kept across ±15 s adjustments, so the progress bar stays honest).
        var startedAt: Date
        var endsAt: Date
    }

    var workoutName: String
}
