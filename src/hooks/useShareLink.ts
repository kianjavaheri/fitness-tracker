import { useFeedback } from '../components/Feedback';
import { shareUrl, type SharePayload } from '../core/share';
import { isNative, SITE_URL } from '../native/platform';

/** Shares a workout/routine link: the iOS share sheet where available, otherwise copies it. */
export function useShareLink() {
  const { notify } = useFeedback();
  return async (title: string, payload: SharePayload) => {
    // In the iPhone app the page's origin is capacitor://localhost, which nobody else can open.
    const url = shareUrl(payload, isNative ? SITE_URL : window.location.origin);
    if (navigator.share) {
      try {
        await navigator.share({ title, text: `${title}: add it to your workouts`, url });
        return;
      } catch (err) {
        if ((err as Error).name === 'AbortError') return; // closed the share sheet
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      notify('Link copied. Anyone with the app can add it.');
    } catch {
      notify("Couldn't share or copy the link here.");
    }
  };
}
