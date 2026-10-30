import ActivityKit
import Capacitor
import Foundation
import UIKit

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
        CAPPluginMethod(name: "prefetchImages", returnType: CAPPluginReturnPromise),
    ]

    /// `{ workoutName, startedAt, exercise, detail, restEndsAt, dark, image }` (times in ms; restEndsAt 0 = not
    /// resting; image the exercise picture's address or ""). Starts the workout's activity, or updates the one showing.
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
            // Usually saved already (prefetchImages); else fetched now, and left out if that fails (offline).
            var image: String? = nil
            if let url = call.getString("image"), !url.isEmpty {
                image = await Self.savedImage(for: url)
            }
            let state = RestActivityAttributes.ContentState(
                exercise: call.getString("exercise") ?? "",
                detail: call.getString("detail") ?? "",
                restStartedAt: restStartedAt,
                restEndsAt: restEndsAt,
                dark: call.getBool("dark") ?? true,
                image: image
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

    /// `{ urls }`: saves small copies of a workout's exercise pictures ahead of time, so changing exercise shows its
    /// picture at once.
    @objc func prefetchImages(_ call: CAPPluginCall) {
        let urls = (call.getArray("urls") as? [String]) ?? []
        Task {
            for url in urls { _ = await Self.savedImage(for: url) }
            call.resolve()
        }
    }

    /// The saved copy of a picture (its file name in the app group), downloading and shrinking it first if needed.
    /// A GIF's first frame is used. Nil if it can't be had (offline, or the app group isn't available).
    private static func savedImage(for address: String) async -> String? {
        let name = ExerciseImages.fileName(for: address)
        guard let folder = ExerciseImages.folder, let file = ExerciseImages.file(named: name), let url = URL(string: address) else {
            return nil
        }
        if FileManager.default.fileExists(atPath: file.path) { return name }
        do {
            var request = URLRequest(url: url)
            request.timeoutInterval = 8
            let (data, _) = try await URLSession.shared.data(for: request)
            guard let picture = UIImage(data: data), let jpeg = thumbnail(of: picture).jpegData(compressionQuality: 0.85) else {
                return nil
            }
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            try jpeg.write(to: file, options: .atomic)
            return name
        } catch {
            NSLog("[RestActivity] picture not saved: %@", error.localizedDescription)
            return nil
        }
    }

    /// Fitted into a white square (the anatomical drawings are on white), small enough for the lock screen.
    private static func thumbnail(of picture: UIImage) -> UIImage {
        let side: CGFloat = 132
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: format).image { context in
            UIColor.white.setFill()
            context.fill(CGRect(x: 0, y: 0, width: side, height: side))
            let scale = min(side / picture.size.width, side / picture.size.height)
            let size = CGSize(width: picture.size.width * scale, height: picture.size.height * scale)
            picture.draw(in: CGRect(x: (side - size.width) / 2, y: (side - size.height) / 2, width: size.width, height: size.height))
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
