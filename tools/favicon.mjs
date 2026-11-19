// Builds the favicons from the Nh monogram: white mark on a dark rounded square with a soft crimson glow.
import sharp from 'sharp'; import fs from 'fs';
import { fileURLToPath } from 'url'; const R = fileURLToPath(new URL('..', import.meta.url));
const mark = fs.readFileSync(R + 'assets/monogram.svg', 'utf8').replace(/<svg[^>]*>/, '').replace('</svg>', '');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs><radialGradient id="g" cx="50%" cy="78%" r="70%"><stop offset="0" stop-color="#c31826" stop-opacity=".75"/><stop offset="1" stop-color="#c31826" stop-opacity="0"/></radialGradient></defs>
  <rect width="64" height="64" rx="14" fill="#090f17"/><rect width="64" height="64" rx="14" fill="url(#g)"/>
  <g transform="translate(11.5 13) scale(1)">${mark}</g>
</svg>`;
fs.writeFileSync(R + 'assets/favicon.svg', svg);
await sharp(Buffer.from(svg)).resize(32, 32).png().toFile(R + 'assets/favicon-32.png');
await sharp(Buffer.from(svg)).resize(180, 180).png().toFile(R + 'assets/apple-touch-icon.png');
console.log('favicons written');
