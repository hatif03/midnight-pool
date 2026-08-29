// Regenerate PWA icons from public/favicon.svg. Run: node scripts/gen-icons.mjs
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

mkdirSync('public/icons', { recursive: true });
const svg = 'public/favicon.svg';
const bg = '#04080a';

async function plain(size, file) {
  await sharp(svg).resize(size, size).png().toFile(`public/icons/${file}`);
}

// Maskable icons need the art inside a safe zone (~80% of the canvas) so Android
// doesn't crop it when applying a circle/squircle mask.
async function maskable(size, file) {
  const inner = Math.round(size * 0.8);
  const art = await sharp(svg).resize(inner, inner).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: bg } })
    .composite([{ input: art, gravity: 'center' }])
    .png()
    .toFile(`public/icons/${file}`);
}

await plain(192, 'icon-192.png');
await plain(512, 'icon-512.png');
await plain(180, 'apple-touch-icon.png');
await maskable(512, 'icon-512-maskable.png');
console.log('Icons written to public/icons/');
