import Capacitor
import HealthKit

/// `AppHealth` in JS (src/native/health.ts). Saves finished workouts to Apple Health as strength training, so they
/// count in Fitness and Health like a workout started on the Watch. Each one carries the session's id
/// (`HKMetadataKeyExternalUUID`): saving a session again (resumed, then finished) replaces its earlier copy.
/// Logs to the Xcode console as [AppHealth].
@objc(AppHealthPlugin)
public class AppHealthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppHealthPlugin"
    public let jsName = "AppHealth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveWorkout", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteWorkout", returnType: CAPPluginReturnPromise),
    ]

    private let store = HKHealthStore()
    private let workoutType = HKObjectType.workoutType()

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": HKHealthStore.isHealthDataAvailable()])
    }

    /// Shows Apple's Health permission sheet the first time (later calls return at once). Asks to write workouts and
    /// to read them back (only to find a session's earlier copy). iOS never says whether writing was allowed, so
    /// `granted` only means the sheet was answered; `canSave` is the actual write permission.
    @objc func requestAuthorization(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.resolve(["granted": false, "canSave": false])
            return
        }
        store.requestAuthorization(toShare: [workoutType], read: [workoutType]) { [weak self] granted, error in
            if let error = error { NSLog("[AppHealth] authorization failed: %@", error.localizedDescription) }
            let canSave = self?.store.authorizationStatus(for: HKObjectType.workoutType()) == .sharingAuthorized
            call.resolve(["granted": granted, "canSave": canSave])
        }
    }

    /// `{ id, name, start, end }` (ISO strings): one strength-training workout over that time.
    @objc func saveWorkout(_ call: CAPPluginCall) {
        guard
            let id = call.getString("id"),
            let start = call.getString("start").flatMap(Self.parseDate),
            let end = call.getString("end").flatMap(Self.parseDate),
            end > start
        else {
            call.reject("Needs id, start and end, with end after start")
            return
        }
        guard store.authorizationStatus(for: workoutType) == .sharingAuthorized else {
            call.reject("Not allowed to save workouts to Health")
            return
        }
        removeCopies(of: id) { [weak self] in
            self?.build(id: id, name: call.getString("name"), start: start, end: end, call: call)
        }
    }

    /// `{ id }`: removes the workout saved for that session (deleted, or reopened to be finished again).
    @objc func deleteWorkout(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else {
            call.reject("Needs id")
            return
        }
        removeCopies(of: id) { call.resolve() }
    }

    private func build(id: String, name: String?, start: Date, end: Date, call: CAPPluginCall) {
        let config = HKWorkoutConfiguration()
        config.activityType = .traditionalStrengthTraining
        config.locationType = .indoor
        let builder = HKWorkoutBuilder(healthStore: store, configuration: config, device: .local())
        var metadata: [String: Any] = [HKMetadataKeyExternalUUID: id, HKMetadataKeyIndoorWorkout: true]
        if let name = name, !name.isEmpty { metadata[HKMetadataKeyWorkoutBrandName] = name }

        builder.beginCollection(withStart: start) { _, error in
            if let error = error { return Self.fail(call, "begin", error) }
            builder.addMetadata(metadata) { _, error in
                if let error = error { return Self.fail(call, "metadata", error) }
                builder.endCollection(withEnd: end) { _, error in
                    if let error = error { return Self.fail(call, "end", error) }
                    builder.finishWorkout { workout, error in
                        if let error = error { return Self.fail(call, "finish", error) }
                        NSLog("[AppHealth] saved %@ (%.0f min)", id, (workout?.duration ?? 0) / 60)
                        call.resolve()
                    }
                }
            }
        }
    }

    /// Deletes this app's workouts saved for the session, then carries on (even if there were none or it failed).
    private func removeCopies(of id: String, then next: @escaping () -> Void) {
        let predicate = NSCompoundPredicate(andPredicateWithSubpredicates: [
            HKQuery.predicateForObjects(withMetadataKey: HKMetadataKeyExternalUUID, allowedValues: [id]),
            HKQuery.predicateForObjects(from: .default()),
        ])
        let query = HKSampleQuery(sampleType: workoutType, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { [weak self] _, samples, _ in
            guard let self = self, let samples = samples, !samples.isEmpty else { return next() }
            self.store.delete(samples) { _, error in
                if let error = error { NSLog("[AppHealth] couldn't remove the earlier copy: %@", error.localizedDescription) }
                next()
            }
        }
        store.execute(query)
    }

    private static func fail(_ call: CAPPluginCall, _ step: String, _ error: Error) {
        NSLog("[AppHealth] %@ failed: %@", step, error.localizedDescription)
        call.reject(error.localizedDescription)
    }

    private static func parseDate(_ text: String) -> Date? {
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return withFraction.date(from: text) ?? ISO8601DateFormatter().date(from: text)
    }
}
