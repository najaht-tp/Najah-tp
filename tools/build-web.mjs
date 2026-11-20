// Fast web build for the live site (Vercel serves the site/ folder).
//
// index.html (tools/build.mjs) packs everything into one ~17 MB file, which works offline but makes phones wait for the
// whole download before the intro can start. This build keeps the page small and lets the browser fetch each file
// only when it is needed:
//   - the page itself, the loader and the hero load first; project images stay lazy (loading="lazy")
//   - the JS is bundled and split: the game is a separate chunk, fetched only on "Play game"
//   - fonts are self-hosted WOFF2 (the brush font subset to the letters the site uses)
//   - the protected Sony LIV case study is encrypted into its own file, fetched only when someone unlocks it;
//     its images are inside that encrypted file, so none of them are published as plain files
import fs from 'fs'; import path from 'path'; import crypto from 'crypto'; import { fileURLToPath } from 'url';
import sharp from 'sharp'; import { build } from 'esbuild';
import { lockArticles } from './lock.mjs';

const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = R + '/site';
const rd = (p) => fs.readFileSync(R + '/' + p);
const b64 = (buf, mime) => 'data:' + mime + ';base64,' + Buffer.from(buf).toString('base64');
const copy = (from, to = from) => { fs.mkdirSync(path.dirname(OUT + '/' + to), { recursive: true }); fs.copyFileSync(R + '/' + from, OUT + '/' + to); };
const write = (to, data) => { fs.mkdirSync(path.dirname(OUT + '/' + to), { recursive: true }); fs.writeFileSync(OUT + '/' + to, data); };
const hash = (buf) => crypto.createHash('sha1').update(buf).digest('hex').slice(0, 10);

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
let html = fs.readFileSync(R + '/index.src.html', 'utf8');

// loader styles inline: the intro must not wait for another request
html = html.replace('<link rel="stylesheet" href="src/loader/loader.css">', () => '<style>' + rd('src/loader/loader.css').toString() + '</style>');

// fonts: self-hosted WOFF2 instead of Google Fonts (one fewer connection) and the brush font subset (1.2 MB -> ~150 KB)
html = html.replace(/<link rel="preconnect"[^>]*>\n?/g, '').replace(/<link href="https:\/\/fonts\.googleapis[^>]*>\n?/, '');
html = html.replace(/<link rel="modulepreload" href="https:[^>]*>\n?/g, '');
for (const f of ['manrope', 'grotesk', 'YoruKaze-Light', 'YoruKaze-WpYa9']) copy('tools/fonts/' + f + '.woff2', 'assets/fonts/' + f + '.woff2');
html = html.replace('url("assets/fonts/YoruKaze-Light.ttf") format("truetype")', 'url("assets/fonts/YoruKaze-Light.woff2") format("woff2")')
           .replace('url("assets/fonts/YoruKaze-WpYa9.otf") format("opentype")', 'url("assets/fonts/YoruKaze-WpYa9.woff2") format("woff2")');
if (/YoruKaze-[^"]*\.(ttf|otf)/.test(html)) throw new Error('brush font @font-face not rewritten to woff2');
const faces = '@font-face{font-family:"Manrope";font-weight:200 800;font-display:swap;src:url(assets/fonts/manrope.woff2) format("woff2")}\n'
  + '@font-face{font-family:"Space Grotesk";font-weight:400;font-display:swap;src:url(assets/fonts/grotesk.woff2) format("woff2")}\n';
html = html.replace('<style>\n', '<style>\n' + faces);
const preloads = ['assets/fonts/YoruKaze-Light.woff2', 'assets/fonts/manrope.woff2']
  .map((f) => `<link rel="preload" as="font" type="font/woff2" href="${f}" crossorigin>`).join('\n');
html = html.replace('<link rel="preload" as="image" href="assets/ninja-still.webp">', () => preloads + '\n<link rel="preload" as="image" href="assets/ninja-still.webp">');

// the protected case study: its images go inside the encrypted file, which is written separately
const lockedArt = html.match(/<article\b[^>]*\bdata-lock="sony-live"[^>]*>[\s\S]*?<\/article>/);
if (!lockedArt) throw new Error('Sony LIV article not found');
let art = lockedArt[0];
for (const f of fs.readdirSync(R + '/assets/projects/sony-live')) art = art.split('assets/projects/sony-live/' + f).join(b64(rd('assets/projects/sony-live/' + f), 'image/webp'));
html = html.replace(lockedArt[0], () => art);
html = lockArticles(html, R, {
  title: { 'sony-live': 'Sony LIV' }, logo: { 'sony-live': 'assets/projects/sony-live/thumb5.webp' },
  payloadFile: (slug, payload) => { const body = JSON.stringify(payload); const name = `locked/${slug}.${hash(body)}.json`; write(name, body); return name; },
});
if (/data-lock="/.test(html)) throw new Error('a case study marked data-lock was not encrypted');

// JS: one module bundle (three, gsap, loader, hero) plus a separate chunk for the game, with content hashes for caching
const NM = R + '/node_modules';
const m = html.match(/<script type="importmap">[\s\S]*?<\/script>\s*<script type="module" src="src\/main\.js(?:\?[^"]*)?"><\/script>/);
if (!m) throw new Error('entry script tags not found');
const js = await build({
  entryPoints: { main: R + '/src/main.js' }, nodePaths: [NM], bundle: true, minify: true, format: 'esm', splitting: true,
  outdir: OUT + '/js', entryNames: '[name]-[hash]', chunkNames: 'chunks/[name]-[hash]', target: 'es2020', metafile: true,
  alias: { 'three/addons': NM + '/three/examples/jsm' }, logLevel: 'warning',
});
const mainFile = Object.keys(js.metafile.outputs).find((f) => js.metafile.outputs[f].entryPoint).replace(/^(?:.*\/)?site\//, '');
html = html.replace(m[0], () => `<script type="module" src="${mainFile}"></script>`);
html = html.replace('</title>', () => `</title>\n<link rel="modulepreload" href="${mainFile}">`);

// assets the page and the scripts ask for (the original-size and protected files are left out)
const avatar = await sharp(rd('assets/avatar.png')).resize(160, 160, { fit: 'cover' }).png({ compressionLevel: 9 }).toBuffer();
write('assets/avatar.png', avatar);
for (const f of ['ninja-still.webp', 'shimmer-texture.webp', 'cursor-sword.png', 'cursor-sword@2x.png', 'favicon.svg', 'favicon-32.png', 'apple-touch-icon.png',
  'monogram.svg', 'atmosphere.svg', 'available.svg', 'ninja-clap.min.glb', 'tex-base.webp', 'tex-normal.webp', 'tex-mr.webp']) copy('assets/' + f);
for (const dir of ['loader', 'game', 'voice']) for (const f of fs.readdirSync(R + '/assets/' + dir)) if (!f.startsWith('.')) copy(`assets/${dir}/${f}`);
const walk = (d) => fs.readdirSync(R + '/' + d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(d + '/' + e.name) : [d + '/' + e.name]);
for (const f of walk('assets/projects')) {
  if (f.startsWith('assets/projects/sony-live/') && !f.endsWith('/thumb5.webp')) continue;     // protected: only the card image is public
  if (/\.(webp|png|jpe?g)$/i.test(f)) copy(f);
}
// every asset path left in the page must exist
for (const ref of new Set(html.match(/assets\/[A-Za-z0-9_@\-/.]+\.(?:webp|png|svg|jpe?g|woff2|glb|m4a)/g) || [])) {
  if (!fs.existsSync(OUT + '/' + ref)) throw new Error('missing asset in site/: ' + ref);
}
write('index.html', html);

const size = (dir) => fs.readdirSync(dir, { withFileTypes: true }).reduce((s, e) => s + (e.isDirectory() ? size(dir + '/' + e.name) : fs.statSync(dir + '/' + e.name).size), 0);
const first = Buffer.byteLength(html) + fs.statSync(OUT + '/' + mainFile).size;
console.log(`site/ ${(size(OUT) / 1048576).toFixed(1)} MB in total · page ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB · main script ${(fs.statSync(OUT + '/' + mainFile).size / 1024).toFixed(0)} KB · first load ${(first / 1048576).toFixed(2)} MB before assets`);
