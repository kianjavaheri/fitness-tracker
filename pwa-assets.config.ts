import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// Generates the home-screen and install icons into public/ from public/app-icon.svg:
// npm run icons
const full = { padding: 0, resizeOptions: { background: '#191919' } };

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    transparent: { ...minimal2023Preset.transparent, padding: 0, favicons: [] },
    maskable: { ...minimal2023Preset.maskable, ...full },
    apple: { ...minimal2023Preset.apple, ...full },
  },
  images: ['public/app-icon.svg'],
});
