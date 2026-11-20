// Build-time lock for protected case studies.
//
// An article marked  data-lock="<slug>"  in index.src.html is encrypted with the password in  .secrets/<slug>.txt
// (that folder is never committed). The built page keeps only ciphertext plus a lock screen; the browser decrypts it
// when the right password is typed (see the "case lock" script in index.src.html, which uses the same scheme).
//
// Scheme (pure SHA-256, so it also works on plain-http pages where WebCrypto is unavailable):
//   pw   = password, trimmed, spaces collapsed, lower-cased
//   key  = PBKDF2-HMAC-SHA256(pw, salt, ITER, 64 bytes)  ->  encKey = key[0..32], macKey = key[32..64]
//   data = utf8(article html) XOR keystream, block i = SHA256(encKey || u32be(i))
//   check = HMAC-SHA256(macKey, "unlock")   (tells a wrong password apart without decrypting)
import crypto from 'crypto';
import fs from 'fs';

export const ITER = 40000;
export const normalise = (pw) => pw.trim().replace(/\s+/g, ' ').toLowerCase();

function keystreamXor(buf, encKey) {
  const out = Buffer.alloc(buf.length), ctr = Buffer.alloc(4);
  for (let i = 0, off = 0; off < buf.length; i++, off += 32) {
    ctr.writeUInt32BE(i);
    const block = crypto.createHash('sha256').update(encKey).update(ctr).digest();
    for (let j = 0; j < 32 && off + j < buf.length; j++) out[off + j] = buf[off + j] ^ block[j];
  }
  return out;
}

export function encrypt(text, password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.pbkdf2Sync(normalise(password), salt, ITER, 64, 'sha256');
  const encKey = key.subarray(0, 32), macKey = key.subarray(32);
  const data = keystreamXor(Buffer.from(text, 'utf8'), encKey);
  const check = crypto.createHmac('sha256', macKey).update('unlock').digest();
  return { v: 1, iter: ITER, salt: salt.toString('base64'), check: check.toString('base64'), data: data.toString('base64') };
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

// Replaces every  <article ... data-lock="slug" ...> ... </article>  in html with its locked version.
// payloadFile(slug, payload) -> url: when given, the encrypted data is written to a separate file (fetched on unlock)
export function lockArticles(html, root, { title = {}, logo = {}, payloadFile = null } = {}) {
  return html.replace(/(<article\b[^>]*\bdata-lock="([a-z0-9-]+)"[^>]*>)([\s\S]*?)(<\/article>)/g, (_, open, slug, body, close) => {
    const file = root + '/.secrets/' + slug + '.txt';
    if (!fs.existsSync(file)) throw new Error(`Locked case study "${slug}" has no password: create .secrets/${slug}.txt`);
    const password = fs.readFileSync(file, 'utf8');
    if (!normalise(password)) throw new Error(`.secrets/${slug}.txt is empty`);
    const payload = encrypt(body, password);
    const name = title[slug] || slug;
    const mail = 'mailto:najahuiux@gmail.com?subject=' + encodeURIComponent('Access request: ' + name) + '&amp;body=' + encodeURIComponent('Hi Najah,\n\nCould I have access to the ' + name + ' case study?\n\n');
    const lockUI = `
    <div class="lock" data-lock-ui>
      ${logo[slug] ? `<img class="lock__logo" src="${esc(logo[slug])}" alt="" width="120" height="126">` : ''}
      <p class="lock__eyebrow">Protected case study</p>
      <h1 class="lock__title">${esc(name)}</h1>
      <p class="lock__text">This project is under NDA. Enter the password to view the case study.</p>
      <form class="lock__form" autocomplete="off">
        <label class="lock__label" for="lock-pw-${slug}">Password</label>
        <div class="lock__row">
          <input class="lock__input" id="lock-pw-${slug}" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Enter password" required>
          <button class="btn lock__btn" type="submit">Unlock</button>
        </div>
        <p class="lock__error" role="alert" aria-live="assertive"></p>
      </form>
      <a class="lock__request" href="${mail}">Request access <span aria-hidden="true">↗</span></a>
    </div>
    ${payloadFile ? `<script type="application/json" data-lock-payload data-src="${esc(payloadFile(slug, payload))}"></script>` : `<script type="application/json" data-lock-payload>${JSON.stringify(payload)}</script>`}
  `;
    return open.replace(/\sdata-lock="[^"]*"/, ` data-locked="${slug}"`) + lockUI + close;
  });
}
