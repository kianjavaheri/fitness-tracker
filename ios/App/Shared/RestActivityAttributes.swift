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
        /// A small picture of the exercise: a file in `ExerciseImages.folder` (the widget can't download), or nil.
        var image: String? = nil
    }

    var workoutName: String
    /// When the workout began, for the time so far.
    var startedAt: Date
}

/// Exercise pictures for the lock screen. The widget extension can't load anything from the internet, so the app saves
/// small copies in the app group both belong to, and the widget reads them from there.
enum ExerciseImages {
    static let appGroup = "group.com.kianjavaheri.fitnesstracker"

    static var folder: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup)?
            .appendingPathComponent("ExerciseImages", isDirectory: true)
    }

    /// The saved copy's file name for a picture's address (a stable hash, so the same picture is saved once).
    static func fileName(for url: String) -> String {
        var hash: UInt64 = 5381
        for byte in url.utf8 { hash = (hash &* 33) &+ UInt64(byte) }
        return "\(String(hash, radix: 16)).jpg"
    }

    static func file(named name: String) -> URL? { folder?.appendingPathComponent(name) }
}
