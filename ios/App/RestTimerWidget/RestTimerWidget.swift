import ActivityKit
import SwiftUI
import WidgetKit

/// Colours from src/index.css, so the lock screen matches the app's theme: dark is the warm sweep (orange to red) on
/// near-black, light the blue one (indigo to sky) on the light grey page.
private struct Palette {
    let background: Color
    let text: Color
    let muted: Color
    let sweep: [Color]
    /// One colour from the sweep for the countdown and its bar: the system only keeps a timer ticking on the lock
    /// screen when it's drawn plainly, and a gradient (fill or mask) flattens it into a still picture.
    let accent: Color

    static func of(dark: Bool) -> Palette {
        dark
            ? Palette(background: rgb(0x0F1011), text: .white, muted: .white.opacity(0.55),
                      sweep: [rgb(0xF58A5C), rgb(0xF28F82), rgb(0xEF6266), rgb(0xEA5560)], accent: rgb(0xF27870))
            : Palette(background: rgb(0xF2F1F6), text: rgb(0x111111), muted: .black.opacity(0.5),
                      sweep: [rgb(0x3D4AD0), rgb(0x2563CF), rgb(0x1A78C4), rgb(0x1488BB)], accent: rgb(0x2563CF))
    }

    var gradient: LinearGradient { LinearGradient(colors: sweep, startPoint: .leading, endPoint: .trailing) }
}

private func rgb(_ hex: Int) -> Color {
    Color(red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255, blue: Double(hex & 0xFF) / 255)
}

@main
struct RestTimerWidgetBundle: WidgetBundle {
    var body: some Widget {
        RestTimerLiveActivity()
    }
}

/// The live workout on the lock screen and in the Dynamic Island: the exercise and set you're on, and while resting
/// the countdown and its bar. The system counts down from the dates, so it stays right while the app is asleep.
struct RestTimerLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RestActivityAttributes.self) { context in
            let palette = Palette.of(dark: context.state.dark)
            LockScreenView(context: context, palette: palette)
                .activityBackgroundTint(palette.background)
                .activitySystemActionForegroundColor(palette.text)
        } dynamicIsland: { context in
            // The Dynamic Island is always black, so it uses the dark colours.
            let palette = Palette.of(dark: true)
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 8) {
                        if let picture = ExercisePicture.load(context.state.image) {
                            ExercisePicture(image: picture, size: 30)
                        } else {
                            LogoMark().fill(palette.gradient).frame(width: 22, height: 16)
                        }
                        Text(context.state.exercise).font(.headline).lineLimit(1)
                    }
                    .padding(.leading, 6)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if isResting(context) {
                        VStack(alignment: .trailing, spacing: 0) {
                            RestCaption(palette: palette)
                            Countdown(context: context)
                                .font(.title2.weight(.semibold).monospacedDigit())
                                .foregroundStyle(palette.accent)
                        }
                        .padding(.trailing, 6)
                    } else {
                        Text(context.state.detail).font(.subheadline).foregroundStyle(palette.muted).padding(.trailing, 6)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    if isResting(context) {
                        RestBar(context: context, palette: palette).padding(.horizontal, 6)
                    } else {
                        Text(context.state.detail).font(.caption).foregroundStyle(palette.muted)
                    }
                }
            } compactLeading: {
                LogoMark().fill(palette.gradient).frame(width: 20, height: 14)
            } compactTrailing: {
                if isResting(context) {
                    Countdown(context: context).monospacedDigit().foregroundStyle(palette.accent).frame(maxWidth: 46)
                } else {
                    Text(context.attributes.startedAt, style: .timer).monospacedDigit().frame(maxWidth: 52)
                }
            } minimal: {
                LogoMark().fill(palette.gradient).frame(width: 18, height: 13)
            }
            .keylineTint(palette.sweep[1])
        }
    }
}

private func isResting(_ context: ActivityViewContext<RestActivityAttributes>) -> Bool {
    context.state.restEndsAt != nil
}

/// Like Hevy's: the logo and workout quietly at the top, then the exercise and set; while resting, the countdown on
/// the right and the bar underneath.
private struct LockScreenView: View {
    let context: ActivityViewContext<RestActivityAttributes>
    let palette: Palette

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 7) {
                LogoMark().fill(palette.muted).frame(width: 19, height: 14)
                Text(context.attributes.workoutName).lineLimit(1)
                Spacer()
                // The workout's time so far (the stopwatch), as opposed to the rest countdown below. One piece of text:
                // a timer takes all the width it's offered, so as separate views the icon couldn't stay beside the
                // digits; in the same line, right-aligned, it moves along as they grow.
                Text("\(Image(systemName: "stopwatch")) \(Text(context.attributes.startedAt, style: .timer))")
                    .monospacedDigit()
                    .multilineTextAlignment(.trailing)
                    .frame(maxWidth: 120, alignment: .trailing)
            }
            .font(.subheadline)
            .foregroundStyle(palette.muted)

            HStack(alignment: .center, spacing: 12) {
                if let picture = ExercisePicture.load(context.state.image) {
                    ExercisePicture(image: picture, size: 44)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(context.state.exercise)
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(palette.text)
                        .lineLimit(2)
                        // Very long names shrink a little before they'd be cut off.
                        .minimumScaleFactor(0.8)
                    Text(context.state.detail)
                        .font(.subheadline)
                        .foregroundStyle(palette.muted)
                }
                Spacer(minLength: 12)
                if isResting(context) {
                    VStack(alignment: .trailing, spacing: 0) {
                        RestCaption(palette: palette)
                        Countdown(context: context)
                            .font(.system(size: 34, weight: .semibold).monospacedDigit())
                            .foregroundStyle(palette.accent)
                    }
                }
            }

            if isResting(context) {
                RestBar(context: context, palette: palette)
            }
        }
        .padding(16)
    }
}

/// The exercise's picture, small, on white (the app saves it in the app group; see ExerciseImages).
private struct ExercisePicture: View {
    let image: UIImage
    let size: CGFloat

    static func load(_ name: String?) -> UIImage? {
        guard let name, let file = ExerciseImages.file(named: name) else { return nil }
        return UIImage(contentsOfFile: file.path)
    }

    var body: some View {
        Image(uiImage: image)
            .resizable()
            .scaledToFit()
            .frame(width: size, height: size)
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: size * 0.22, style: .continuous))
    }
}

/// "REST" over the countdown, so it's clear which of the two times it is (the other is the workout's, by the stopwatch).
private struct RestCaption: View {
    let palette: Palette

    var body: some View {
        Text("REST").font(.caption2.weight(.semibold)).kerning(0.6).foregroundStyle(palette.muted)
    }
}

/// m:ss counting down to the end of the rest, or "Over".
private struct Countdown: View {
    let context: ActivityViewContext<RestActivityAttributes>

    var body: some View {
        if let start = context.state.restStartedAt, let end = context.state.restEndsAt, end > Date() {
            // A timer takes all the width it's offered, which left the exercise's name little room. Laid over an invisible
            // "0:00" (in the same font) it only gets what its digits need.
            Text(end.timeIntervalSince(start) >= 600 ? "00:00" : "0:00")
                .hidden()
                .overlay(alignment: .trailing) {
                    Text(timerInterval: start...end, countsDown: true)
                        .multilineTextAlignment(.trailing)
                }
        } else {
            // Under the "REST" caption (or alone in the island, beside the logo).
            Text("Over")
        }
    }
}

/// The rest's bar, emptying as it counts down. A plain ProgressView in the theme's colour, so the system animates it
/// (see Palette.accent).
private struct RestBar: View {
    let context: ActivityViewContext<RestActivityAttributes>
    let palette: Palette

    var body: some View {
        if let start = context.state.restStartedAt, let end = context.state.restEndsAt, end > start, end > Date() {
            ProgressView(timerInterval: start...end, countsDown: true) {
                EmptyView()
            } currentValueLabel: {
                EmptyView()
            }
            .tint(palette.accent)
        } else {
            ProgressView(value: 1).tint(palette.accent)
        }
    }
}

/// The app's mark (public/app-icon.svg) as a shape: the barbell, an r on the left (arm at the top) and an upside-down r
/// on the right (foot at the bottom). Drawn from the icon's 1024-unit coordinates, scaled to fit.
private struct LogoMark: Shape {
    func path(in rect: CGRect) -> Path {
        // The mark spans x 176…848 and y 296…728 in the icon (the letters' 80-unit strokes reach 40 further up and down).
        let box = CGRect(x: 176, y: 256, width: 672, height: 512)
        let scale = min(rect.width / box.width, rect.height / box.height)
        let dx = rect.midX - box.midX * scale
        let dy = rect.midY - box.midY * scale
        func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: x * scale + dx, y: y * scale + dy) }

        var letters = Path()
        letters.move(to: p(312, 728))
        letters.addLine(to: p(312, 356))
        letters.addQuadCurve(to: p(372, 296), control: p(312, 296))
        letters.addLine(to: p(458, 296))
        letters.move(to: p(712, 296))
        letters.addLine(to: p(712, 668))
        letters.addQuadCurve(to: p(652, 728), control: p(712, 728))
        letters.addLine(to: p(566, 728))

        var bar = Path()
        bar.move(to: p(236, 440))
        bar.addLine(to: p(788, 440))

        var mark = letters.strokedPath(StrokeStyle(lineWidth: 80 * scale))
        mark.addPath(bar.strokedPath(StrokeStyle(lineWidth: 46 * scale, lineCap: .round)))
        for x in [176.0, 788.0] {
            mark.addRoundedRect(in: CGRect(origin: p(x, 350), size: CGSize(width: 60 * scale, height: 180 * scale)),
                                cornerSize: CGSize(width: 18 * scale, height: 18 * scale))
        }
        return mark
    }
}
