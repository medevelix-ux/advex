import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const sharp = require(process.env.ADVEX_SHARP_MODULE || 'sharp');
const out = path.resolve(root, 'dist');
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const get = (obj, key) => key.split('.').reduce((v, k) => v?.[k], obj);
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 12);

export function render(template, data, special = {}) {
  return template.replace(/\{\{([\w.]+)\}\}/g, (_, key) => {
    if (Object.hasOwn(special, key)) return special[key];
    const value = get(data, key);
    if (typeof value !== 'string') throw new Error(`Missing text field: ${key}`);
    return escape(value);
  });
}

function safeLink(value) {
  if (typeof value !== 'string' || !value || /[\u0000-\u0020\\]/.test(value) || /^(?:\/\/|javascript:|data:)/i.test(value) || /^(?!https?:)[a-z][a-z\d+.-]*:/i.test(value)) throw new Error('Invalid project link');
  return escape(value);
}
function projectCards(items) {
  if (!Array.isArray(items) || items.length > 24) throw new Error('Projects must be a list of up to 24 cards');
  return items.map((p, i) => `<li class="p-${'abcd'[i % 4]}"><a href="${safeLink(p.link)}" class="proj"><img src="${escape(p.image)}" width="479" height="271" alt="${escape(p.alt || '')}" loading="lazy"><span class="chip pos-tl"><span class="dot"></span>${escape(p.badge || '')}</span><div class="proj-info"><div class="row"><h3>${escape(p.title)}</h3><span class="mono">${String(i + 1).padStart(2, '0')}</span></div><span class="muted">${escape(p.subtitle || '')}</span></div><span class="proj-go"><svg width="22" height="22" aria-hidden="true"><use href="#i-arrow-ur"/></svg></span></a></li>`).join('\n');
}

async function main() {
  // Never remove anything other than this project's generated, non-symlink dist.
  if (path.dirname(out) !== path.resolve(root) || path.basename(out) !== 'dist') throw new Error('Unsafe output directory');
  const old = await fs.lstat(out).catch(() => null);
  if (old?.isSymbolicLink()) throw new Error('Refusing symlink output');
  await fs.rm(out, { recursive: true, force: true });
  await fs.mkdir(path.join(out, 'assets/home-images'), { recursive: true });
  for (const dir of ['', 'ru', 'en']) {
    await fs.mkdir(path.join(out, dir), { recursive: true });
    for (const name of await fs.readdir(path.join(root, dir))) {
      if (name.endsWith('.html')) await fs.copyFile(path.join(root, dir, name), path.join(out, dir, name));
    }
  }
  await fs.cp(path.join(root, 'img'), path.join(out, 'img'), { recursive: true });
  const assets = {};
  for (const name of ['home.css', 'home.js', 'forms.js']) {
    const data = await fs.readFile(path.join(root, 'src/assets', name));
    const ext = path.extname(name);
    assets[name] = `/assets/${path.basename(name, ext)}.${hash(data)}${ext}`;
    await fs.writeFile(path.join(out, assets[name]), data);
  }

  const optimized = new Map();
  const cache = path.join(root, '.cache/home-images');
  await fs.mkdir(cache, { recursive: true });
  async function image(url) {
    url=decodeURIComponent(url.replaceAll('&amp;','&'));
    // Only repo image files may enter the optimizer. No remote fetches or traversal.
    if (!url.startsWith('/img/') || url.includes('..') || /[?#\\]/.test(url)) throw new Error(`Invalid homepage image: ${url}`);
    if (optimized.has(url)) return optimized.get(url);
    const source = path.resolve(root, '.' + url);
    const real = await fs.realpath(source);
    if (!real.startsWith(path.resolve(root, 'img') + path.sep)) throw new Error('Image outside img directory');
    const bytes = await fs.readFile(source);
    const max = /partners\//.test(url) ? 400 : /category\//.test(url) ? 640 : /bg(?:_m)?\./.test(url) ? 1600 : 1200;
    const meta = await sharp(bytes, { limitInputPixels: 40_000_000 }).metadata();
    const widths = [...new Set([400, 800, max].map(w => Math.min(w, meta.width, max)))].sort((a,b) => a-b);
    const key = hash(Buffer.concat([bytes, Buffer.from(`webp-82-v1-${max}`)]));
    const variants = [];
    for (const width of widths) {
      const filename = `${key}-${width}.webp`;
      const cached = path.join(cache, filename);
      if (!(await fs.stat(cached).catch(() => null))) {
        await sharp(bytes, { limitInputPixels: 40_000_000 }).rotate().resize({ width, withoutEnlargement: true }).webp({ quality:82, effort:5 }).toFile(cached);
      }
      await fs.copyFile(cached, path.join(out, 'assets/home-images', filename));
      variants.push({ url:'/assets/home-images/' + filename, width, bytes:(await fs.stat(cached)).size });
    }
    const result = { source:url, originalBytes:bytes.length, variants, primary:variants.at(-1) };
    optimized.set(url, result);
    return result;
  }
  async function optimizeHTML(html) {
    const matches = [...html.matchAll(/<(?:img|source)\b[^>]*>/g)];
    for (const match of matches.reverse()) {
      const tag=match[0], attr=tag.startsWith('<source') ? 'srcset' : 'src';
      const found=tag.match(new RegExp(`\\b${attr}="([^"]+)"`));
      if (!found) continue;
      const data=await image(found[1]);
      let updated=tag.replace(found[0], `${attr}="${data.primary.url}"`);
      if (attr==='src') {
        updated=updated.replace(/>$/, ` decoding="async" srcset="${data.variants.map(v=>`${v.url} ${v.width}w`).join(', ')}" sizes="${tag.includes('hero-bg') ? '100vw' : '(max-width: 640px) 100vw, 50vw'}">`);
      }
      html=html.slice(0,match.index)+updated+html.slice(match.index+tag.length);
    }
    return html;
  }
  const fieldHTML = (type, lang) => `<input type="hidden" name="form-name" value="home-${lang}-${type}"><input type="hidden" name="subject" value="ADVEX — ${type==='lead'?'заявка':'расчёт стоимости'} (${lang.toUpperCase()})"><input type="hidden" name="lang" value="${lang}"><input type="hidden" name="request_id"><input type="hidden" name="equipment"><div class="form-trap" aria-hidden="true"><label>Website<input type="text" name="website" tabindex="-1" autocomplete="off"></label></div><p class="form-feedback" role="status" tabindex="-1" hidden></p>`;
  for (const lang of ['az', 'ru', 'en']) {
    const template=await fs.readFile(path.join(root,'src/home',lang+'.html'),'utf8');
    const data=JSON.parse(await fs.readFile(path.join(root,'content/home',lang+'.json'),'utf8'));
    let html=render(template,data,{projects_cards:projectCards(data.projects.items),form_fields_lead:fieldHTML('lead',lang),form_fields_quote:fieldHTML('quote',lang)});
    for(const type of ['lead','quote']) html=html.replace(`data-${type}-form>`,`data-${type}-form name="home-${lang}-${type}" data-netlify="true" netlify-honeypot="website">`);
    html=html.replaceAll('action="/api/lead"','action="/form-success.html"');
    for (const [name,url] of Object.entries(assets)) html=html.replaceAll('/assets/'+name,url);
    html=await optimizeHTML(html.replace(/<!--[\s\S]*?-->/g,''));
    if (/<style\b|\sstyle=|<script\b(?![^>]*\bsrc=)|\son\w+=/i.test(html)) throw new Error(`Inline CSS/JS in ${lang}`);
    await fs.writeFile(path.join(out,lang==='az'?'index.html':lang+'/index.html'),html);
  }
  // This is a staging pilot; promotion to the real domain is a separate explicit step.
  await fs.writeFile(path.join(out,'robots.txt'),'User-agent: *\nDisallow: /\n');
  await fs.writeFile(path.join(out,'_headers'),'/*\n  X-Robots-Tag: noindex, nofollow\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n');
  await fs.writeFile(path.join(out,'form-success.html'),'<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ADVEX — заявка принята</title><link rel="stylesheet" href="'+assets['home.css']+'"><main class="wrap sec"><h1>Спасибо! / Thank you! / Təşəkkür edirik!</h1><p>Заявка принята. / Request received. / Sorğunuz qəbul edildi.</p><p><a href="/ru/">Русский</a> · <a href="/">Azərbaycanca</a> · <a href="/en/">English</a></p></main></html>');
  const report={images:optimized.size,originalBytes:[...optimized.values()].reduce((n,x)=>n+x.originalBytes,0),optimizedLargestVariantsBytes:[...optimized.values()].reduce((n,x)=>n+x.primary.bytes,0)};
  await fs.writeFile(path.join(root,'.cache/build-report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({pages:27,homeLanguages:['az','ru','en'],images:report},null,2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
