import ActivityKit
import SwiftUI
import WidgetKit

/// The app's coral accent (--accent in dark mode).
private let coral = Color(red: 0xF2 / 255, green: 0x8B / 255, blue: 0x82 / 255)

@main
struct RestTimerWidgetBundle: WidgetBundle {
    var body: some Widget {
        RestTimerLiveActivity()
    }
}

/// The rest timer on the lock screen and in the Dynamic Island. The system counts it down from `endsAt`; once that
/// passes the activity goes stale and shows "Rest over" until the app ends it.
struct RestTimerLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RestActivityAttributes.self) { context in
            LockScreenView(context: context)
                .activityBackgroundTint(Color(red: 0.06, green: 0.063, blue: 0.067))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label("Rest", systemImage: "timer")
                        .font(.headline)
                        .foregroundStyle(coral)
                        .padding(.leading, 6)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Countdown(context: context)
                        .font(.title2.weight(.semibold).monospacedDigit())
                        .padding(.trailing, 6)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    RestProgress(context: context).padding(.horizontal, 6)
                }
            } compactLeading: {
                Image(systemName: "timer").foregroundStyle(coral)
            } compactTrailing: {
                Countdown(context: context)
                    .monospacedDigit()
                    .frame(maxWidth: 46)
            } minimal: {
                Image(systemName: "timer").foregroundStyle(coral)
            }
            .keylineTint(coral)
        }
    }
}

private struct LockScreenView: View {
    let context: ActivityViewContext<RestActivityAttributes>

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 3) {
                    Label("Rest", systemImage: "timer")
                        .font(.headline)
                        .foregroundStyle(coral)
                    Text(context.attributes.workoutName)
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.6))
                        .lineLimit(1)
                }
                Spacer()
                Countdown(context: context)
                    .font(.system(size: 38, weight: .semibold).monospacedDigit())
                    .foregroundStyle(.white)
            }
            RestProgress(context: context)
        }
        .padding(16)
    }
}

/// m:ss counting down to `endsAt`, or "Rest over".
private struct Countdown: View {
    let context: ActivityViewContext<RestActivityAttributes>

    var body: some View {
        let state = context.state
        if context.isStale || state.endsAt <= Date() {
            Text("Rest over")
        } else {
            Text(timerInterval: state.startedAt...state.endsAt, countsDown: true)
                .multilineTextAlignment(.trailing)
        }
    }
}

private struct RestProgress: View {
    let context: ActivityViewContext<RestActivityAttributes>

    var body: some View {
        let state = context.state
        if context.isStale || state.endsAt <= state.startedAt {
            ProgressView(value: 1).tint(coral)
        } else {
            ProgressView(timerInterval: state.startedAt...state.endsAt, countsDown: true) {
                EmptyView()
            } currentValueLabel: {
                EmptyView()
            }
            .tint(coral)
        }
    }
}
