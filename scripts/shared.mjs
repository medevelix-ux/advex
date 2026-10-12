import fs from 'node:fs/promises';
import path from 'node:path';
import {escape, render, safeLink} from './render.mjs';

export const languages = ['az', 'ru', 'en'];
export const innerPages = ['about','catalog','contacts','delivery','projects','rental','staff','stands'];
export const pageRoute = (lang, page) => (lang === 'az' ? '/' : `/${lang}/`) + page + '.html';

export async function loadShared(root, lang) {
  const json = async file => JSON.parse(await fs.readFile(path.join(root, file), 'utf8'));
  return {
    header: await json(`content/shared/header/${lang}.json`),
    footer: await json(`content/shared/footer/${lang}.json`),
    clients: await json('content/shared/clients.json'),
    headerTemplate: await fs.readFile(path.join(root, `src/partials/header-${lang}.html`), 'utf8'),
    footerTemplate: await fs.readFile(path.join(root, `src/partials/footer-${lang}.html`), 'utf8'),
  };
}

const list = (items, label, max = 48) => {
  if (!Array.isArray(items) || items.length > max) throw new Error(`${label}: expected a list of up to ${max} items`);
  return items;
};

export function renderShared(shared, lang, page = 'index') {
  const {footer, clients} = shared;
  const header = structuredClone(shared.header);
  // The same CTA can target the homepage form from any inner page.
  if (page === 'index' && header.cta.href === 'index.html#contact') header.cta.href = '#contact';
  safeLink(header.cta.href);
  safeLink(header.catalog.href);
  if (!/^tel:\+?[\d ()-]+$/.test(footer.contacts.phoneLink)) throw new Error('Invalid footer phone link');
  if (!/^[^\s<>"@]+@[^\s<>"@]+\.[^\s<>"@]+$/.test(footer.contacts.email)) throw new Error('Invalid footer email');
  const current = href => {
    const resolved = new URL(href, 'https://advex.invalid' + pageRoute(lang,page));
    return page !== 'index' && !href.startsWith('#') && resolved.origin === 'https://advex.invalid' && resolved.pathname === pageRoute(lang,page) && !resolved.hash;
  };
  const link = (item, extra = '') => `<a href="${safeLink(item.href)}"${current(item.href) ? ' class="is-current" aria-current="page"' : ''}>${escape(item.label)}${extra}</a>`;
  const nav = items => list(items,'Navigation').map(i => link(i)).join('\n');
  const ul = items => list(items,'Footer links').map(i => `<li>${link(i)}</li>`).join('\n');
  const special = {
    header_catalog_desktop: list(header.catalog.items,'Catalog').map(i => `<li><a href="${safeLink(i.href)}"><span>${escape(i.label)}</span><svg class="cat-go" width="14" height="14" aria-hidden="true"><use href="#i-arrow"/></svg></a></li>`).join('\n'),
    header_catalog_mobile: nav(header.catalog.items) + `<a href="${safeLink(header.catalog.href)}" class="mnav-cat-all">${escape(header.catalog.allLabel)} →</a>`,
    header_navigation: nav(header.navigation),
    footer_directions: ul(footer.directions.items),
    footer_structures: ul(footer.structures.items),
    footer_company_links: nav(footer.companyLinks),
  };
  const data = {header, footer, routes:Object.fromEntries(languages.map(l => [l,pageRoute(l,page)]))};
  let head = render(shared.headerTemplate,data,special).trimEnd();
  if (current(header.catalog.href)) head = head.replace('class="nav-dd-btn"','class="nav-dd-btn is-current"');
  const partnerList = list(clients.items,'Clients').map(i => `<li class="slot"><img src="${safeLink(i.image)}" alt="${escape(i.alt[lang] || '')}" loading="lazy"></li>`).join('\n');
  if (typeof clients.titles[lang] !== 'string') throw new Error(`Missing clients heading: ${lang}`);
  return {
    shared_header:head,
    shared_footer:render(shared.footerTemplate,data,special).trimEnd(),
    shared_clients:`<section class="wrap" aria-labelledby="clients-title"><div class="clients"><h2 class="h3" id="clients-title">${escape(clients.titles[lang])}</h2><ul class="logos">${partnerList}</ul></div></section>`,
  };
}

export function faqItems(items) {
  return list(items,'FAQ',40).map((item,index) => `<details class="qa" name="faq"><summary><span class="qn mono">${String(index+1).padStart(2,'0')}</span><span class="qt">${escape(item.question)}</span><span class="qi"><svg width="16" height="16" aria-hidden="true"><use href="#i-chev"/></svg></span></summary><p class="qa-a">${escape(item.answer)}</p></details>`).join('\n');
}

export function updateInnerPage(html, blocks, seo) {
  const replaceOne = (pattern, value) => {
    if ([...html.matchAll(pattern)].length !== 1) throw new Error(`Expected exactly one page region: ${pattern}`);
    html = html.replace(pattern, () => value);
  };
  replaceOne(/<header\b[\s\S]*?<\/header>/g, blocks.shared_header);
  replaceOne(/<footer\b[\s\S]*?<\/footer>/g, blocks.shared_footer);
  replaceOne(/<title>[\s\S]*?<\/title>/g, `<title>${escape(seo.title)}</title>`);
  replaceOne(/<meta name="description" content="[^"]*">/g, `<meta name="description" content="${escape(seo.description)}">`);
  return html;
}
