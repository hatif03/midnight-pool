// Regenerate PWA icons from public/favicon.svg. Run: npm run gen-icons
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

mkdirSync('public/icons', { recursive: true });

// Rasterize once at 1024 (viewBox 512 at 192 dpi) so every output is a downscale.
const master = await sharp('public/favicon.svg', { density: 192 })
  .resize(1024, 1024)
  .png()
  .toBuffer();

await sharp(master).png().toFile('public/logo-source.png');

async function write(size, file) {
  await sharp(master).resize(size, size).png().toFile(`public/icons/${file}`);
}

await write(192, 'icon-192.png');
await write(512, 'icon-512.png');
await write(180, 'apple-touch-icon.png');
await write(64, 'favicon-64.png');
// Ball + gold rim sit inside the maskable safe zone in the SVG (~69% of the canvas).
// Full-bleed felt is the field, so Android's circle crop shows cloth, not a letterbox.
await write(512, 'icon-512-maskable.png');
console.log('Icons written to public/icons/ (source: public/favicon.svg)');
