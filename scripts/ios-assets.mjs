// iPhone app icon and launch screen, from the same public/app-icon.svg as the web app's icons (run by `npm run icons`).
// The launch screen is the app's dark background with nothing on it, so opening the app doesn't flash a logo.
import sharp from 'sharp';

const assets = 'ios/App/App/Assets.xcassets';
const background = '#0f1011';

// Rendered straight at 1024 px, whatever size the SVG is drawn at (density is dots per 72 SVG units).
async function render(svg, file, { gray = false } = {}) {
  const { width: drawnAt = 64 } = await sharp(svg).metadata();
  let image = sharp(svg, { density: (72 * 1024) / drawnAt }).resize(1024, 1024).flatten({ background });
  if (gray) image = image.grayscale();
  await image.png().toFile(`${assets}/AppIcon.appiconset/${file}`);
}

// The dark icon everywhere, plus a grey one for tinted home screens, which iOS colours itself (Contents.json). No
// white light-mode icon: iOS has no light-only slot, so it would show on every Default home screen, dark mode or not.
await render('public/app-icon.svg', 'AppIcon-512@2x.png');
await render('public/app-icon.svg', 'AppIcon-tinted.png', { gray: true });

const splash = sharp({ create: { width: 2732, height: 2732, channels: 3, background } }).png();
for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  await splash.clone().toFile(`${assets}/Splash.imageset/${name}`);
}
console.log('iPhone app icon and launch screen written');
