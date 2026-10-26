// iPhone app icon and launch screen, from the same public/app-icon.svg as the web app's icons (run by `npm run icons`).
// The launch screen is the app's dark background with nothing on it, so opening the app doesn't flash a logo.
import sharp from 'sharp';

const assets = 'ios/App/App/Assets.xcassets';
const background = '#0f1011';

// Rendered straight at 1024 px, whatever size the SVG is drawn at (density is dots per 72 SVG units).
const { width: drawnAt = 64 } = await sharp('public/app-icon.svg').metadata();
await sharp('public/app-icon.svg', { density: (72 * 1024) / drawnAt })
  .resize(1024, 1024)
  .flatten({ background })
  .png()
  .toFile(`${assets}/AppIcon.appiconset/AppIcon-512@2x.png`);

const splash = sharp({ create: { width: 2732, height: 2732, channels: 3, background } }).png();
for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  await splash.clone().toFile(`${assets}/Splash.imageset/${name}`);
}
console.log('iPhone app icon and launch screen written');
