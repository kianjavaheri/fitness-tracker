#!/bin/sh
# Live reload on the iPhone: points the app at the Vite dev server on this Mac, so saved edits show up on the phone in
# seconds. Run it, press Run (▶) in Xcode once with the iPhone selected, then keep editing. The phone must be on the
# same Wi-Fi as the Mac. Stopping it (Ctrl+C) switches the app back to its bundled copy. Release builds (Archive,
# TestFlight) ignore the dev server anyway (AppViewController.instanceDescriptor), so one can't ship pointing at it.
set -e
cd "$(dirname "$0")/.."

IP=$(ipconfig getifaddr en0 || ipconfig getifaddr en1 || true)
if [ -z "$IP" ]; then
  echo "Couldn't find this Mac's Wi-Fi address. Is Wi-Fi on?" >&2
  exit 1
fi
PORT=5173

node scripts/ios-google-scheme.mjs
LIVE_RELOAD_URL="http://$IP:$PORT" npx cap sync ios
# However this ends, the Xcode project goes back to loading the app's bundled copy.
restore() {
  echo ""
  echo "Switching the app back to its bundled copy…"
  npx cap copy ios >/dev/null 2>&1 && echo "Done." || echo "Couldn't; run npm run ios." >&2
}
trap restore EXIT
trap 'exit 130' INT TERM
npx cap open ios
echo ""
echo "In Xcode: pick your iPhone at the top and press Run (▶). The app loads from http://$IP:$PORT."
echo "Leave this running; saved changes reload on the phone. Ctrl+C to stop (the app goes back to its bundled copy)."
echo ""
npx vite --host --port "$PORT" --strictPort
