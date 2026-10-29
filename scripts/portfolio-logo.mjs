// The portfolio's logo images: the app icon's mark on a 1920x1080 tile, dark and light (node scripts/portfolio-logo.mjs).
import { readFileSync } from 'node:fs';
import sharp from 'sharp';

async function write(svgPath, out) {
  const icon = readFileSync(svgPath, 'utf8');
  const inner = icon.slice(icon.indexOf('<svg'), icon.lastIndexOf('</svg>') + 6);
  const tile = /<linearGradient id="tile"[\s\S]*?<\/linearGradient>/.exec(icon)[0].replace('id="tile"', 'id="bg"');
  const body = inner
    .replace('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">', '<svg x="480" y="60" width="960" height="960" viewBox="0 0 1024 1024">')
    .replace(/<rect width="1024" height="1024"( rx="512")? fill="url\(#tile\)"\/>/, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><defs>${tile}</defs><rect width="1920" height="1080" fill="url(#bg)"/>${body}</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(out);
  console.log('wrote', out);
}

await write('public/app-icon.svg', 'portfolio/rerack-logo-1080p.png');
await write('public/app-icon-light.svg', 'portfolio/rerack-logo-light-1080p.png');
