// Resize + compress project images into assets/projects/<name>/ (WebP). Usage: node tools/optimize-images.mjs <src-dir> <name> file:maxWidth[:newName] ...
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url'; import sharp from 'sharp';
const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [src, name, ...specs] = process.argv.slice(2);
const out = R + '/assets/projects/' + name; fs.mkdirSync(out, { recursive: true });
for (const spec of specs) {
  const [file, w, as] = spec.split(':');
  const dest = out + '/' + (as || path.basename(file, path.extname(file))) + '.webp';
  const info = await sharp(path.join(src, file)).resize({ width: +w, withoutEnlargement: true }).webp({ quality: 80, effort: 5 }).toFile(dest);
  console.log(path.basename(dest), info.width + 'x' + info.height, (info.size / 1024).toFixed(0) + ' KB');
}
