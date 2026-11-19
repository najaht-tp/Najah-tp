import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url'; import sharp from 'sharp'; import { build } from 'esbuild';
const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');   // the project root, wherever it lives
const T = R + '/tools';
let html = fs.readFileSync(R + '/index.src.html', 'utf8');
const b64 = (buf, mime) => 'data:' + mime + ';base64,' + Buffer.from(buf).toString('base64');
const rd = p => fs.readFileSync(R + '/' + p);
html = html.replace('<link rel="stylesheet" href="src/loader/loader.css">', () => '<style>' + rd('src/loader/loader.css').toString() + '</style>');

// optimised raster assets
const standing = await sharp(rd('assets/ninja-still.webp')).resize({ height: 1000 }).webp({ quality: 88, alphaQuality: 95 }).toBuffer();
const avatar   = await sharp(rd('assets/avatar.png')).resize(160, 160, { fit: 'cover' }).webp({ quality: 85 }).toBuffer();
const uri = {
  'assets/ninja-still.webp': b64(standing, 'image/webp'),
  'assets/avatar.png': b64(avatar, 'image/webp'),
  'assets/shimmer-texture.webp': b64(rd('assets/shimmer-texture.webp'), 'image/webp'),
  'assets/cursor-sword.png': b64(rd('assets/cursor-sword.png'), 'image/png'),
  'assets/cursor-sword@2x.png': b64(rd('assets/cursor-sword@2x.png'), 'image/png'),
  'assets/favicon.svg': b64(rd('assets/favicon.svg'), 'image/svg+xml'),
  'assets/favicon-32.png': b64(rd('assets/favicon-32.png'), 'image/png'),
  'assets/apple-touch-icon.png': b64(rd('assets/apple-touch-icon.png'), 'image/png'),
  'assets/monogram.svg': b64(rd('assets/monogram.svg'), 'image/svg+xml'),
  'assets/atmosphere.svg': b64(rd('assets/atmosphere.svg'), 'image/svg+xml'),
  'assets/available.svg': b64(rd('assets/available.svg'), 'image/svg+xml'),
  'assets/fonts/YoruKaze-Light.ttf': b64(rd('assets/fonts/YoruKaze-Light.ttf'), 'font/ttf'),
  'assets/fonts/YoruKaze-WpYa9.otf': b64(rd('assets/fonts/YoruKaze-WpYa9.otf'), 'font/otf'),
};
// project images (assets/projects/<name>/*.webp) are embedded the same way
const walk = (d) => fs.readdirSync(R + '/' + d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(d + '/' + e.name) : [d + '/' + e.name]);
if (fs.existsSync(R + '/assets/projects')) for (const f of walk('assets/projects')) if (/\.(webp|png|jpe?g)$/i.test(f)) uri[f] = b64(rd(f), f.endsWith('.webp') ? 'image/webp' : f.endsWith('.png') ? 'image/png' : 'image/jpeg');
for (const [k, v] of Object.entries(uri)) html = html.split(k).join(v);

// replace the Google Fonts link/preconnects with embedded latin subsets
html = html.replace(/<link rel="preconnect"[^>]*>\n?/g, '').replace(/<link href="https:\/\/fonts\.googleapis[^>]*>\n?/, '');
html = html.replace(/<link rel="preload"[^>]*>\n?/g, '').replace(/<link rel="modulepreload"[^>]*>\n?/g, '');
const manrope = b64(fs.readFileSync(T + '/fonts/manrope.woff2'), 'font/woff2'), grot = b64(fs.readFileSync(T + '/fonts/grotesk.woff2'), 'font/woff2');
const faces = '@font-face{font-family:"Manrope";font-weight:200 800;font-display:swap;src:url(' + manrope + ') format("woff2")}\n@font-face{font-family:"Space Grotesk";font-weight:400;font-display:swap;src:url(' + grot + ') format("woff2")}\n';
html = html.replace('<style>\n', '<style>\n' + faces);

// bundle src/main.js (three, gsap, hero ninja, loader) into one script; models come from embedded base64
const NM = R + '/node_modules';
const m = html.match(/<script type="importmap">[\s\S]*?<\/script>\s*<script type="module" src="src\/main\.js(?:\?[^"]*)?"><\/script>/);
if (!m) throw new Error('entry script tags not found');
const out = await build({
  entryPoints: [R + '/src/main.js'], nodePaths: [NM],
  bundle: true, minify: true, format: 'iife', write: false, target: 'es2020',
  alias: { 'three/addons': NM + '/three/examples/jsm' },
});
const glb = rd('assets/ninja-clap.min.glb').toString('base64');
const tex = JSON.stringify({ base: b64(rd('assets/tex-base.webp'),'image/webp'), normal: b64(rd('assets/tex-normal.webp'),'image/webp'), mr: b64(rd('assets/tex-mr.webp'),'image/webp') });
const lglb = rd('assets/loader/ninja-loader.glb').toString('base64');
const ltex = JSON.stringify({ base: b64(rd('assets/loader/tex-base.webp'),'image/webp'), normal: b64(rd('assets/loader/tex-normal.webp'),'image/webp'), mr: b64(rd('assets/loader/tex-mr.webp'),'image/webp') });
// the ninja game (loaded only when a visitor presses Play game, but embedded so the single file works offline)
const gglb = fs.existsSync(R + '/assets/game/ninja-game.glb') ? rd('assets/game/ninja-game.glb').toString('base64') : '';
const kglb = fs.existsSync(R + '/assets/game/katana.glb') ? rd('assets/game/katana.glb').toString('base64') : '';
const gbg = fs.existsSync(R + '/assets/game/background.webp') ? b64(rd('assets/game/background.webp'), 'image/webp') : '';
const voice = {}; for (const f of fs.readdirSync(R + '/assets/voice')) if (f.endsWith('.m4a')) voice[f.replace('.m4a','')] = rd('assets/voice/' + f).toString('base64');
const script = '<script>window.__VOICE__=' + JSON.stringify(voice) + (gglb ? ';window.__GAME_GLB__="' + gglb + '";window.__KATANA_GLB__="' + kglb + '";window.__GAME_BG__="' + gbg + '"' : '') + ';window.__NINJA_GLB__="' + glb + '";window.__NINJA_TEX__=' + tex + ';window.__LOADER_GLB__="' + lglb + '";window.__LOADER_TEX__=' + ltex + ';</script>\n<script>' + out.outputFiles[0].text.replace(/<\/script>/g, '<\\/script>') + '</script>';
html = html.replace(m[0], () => script);
fs.writeFileSync(R + '/index.html', html);
console.log('index.html', (html.length / 1048576).toFixed(2), 'MB');
