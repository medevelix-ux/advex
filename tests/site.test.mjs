import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {render} from '../scripts/build.mjs';
import {loadShared,renderShared,faqItems,languages,innerPages,pageRoute} from '../scripts/shared.mjs';

const root=new URL('../',import.meta.url);
const read=async p=>fs.readFile(new URL(p,root),'utf8');

test('all CMS fields exist in their matching language content',async()=>{
  const config=JSON.parse(await read('.pages.yml'));
  assert.equal(config.content.length,6);
  const pages=[],names=new Set();
  const walk=entries=>entries.forEach(p=>{assert.ok(!names.has(p.name),`duplicate CMS entry: ${p.name}`);names.add(p.name);if(p.type==='group')walk(p.items);else pages.push(p);});
  walk(config.content);
  assert.equal(pages.length,34);
  const check=(fields,data,prefix)=>{
    assert.deepEqual(Object.keys(data).sort(),fields.map(f=>f.name).sort(),`unmapped data at ${prefix}`);
    for(const f of fields){
      const value=data[f.name],key=prefix+'.'+f.name;
      assert.notEqual(value,undefined,key);
      if(f.list){assert.ok(Array.isArray(value),key);if(f.fields)value.forEach((v,i)=>check(f.fields,v,key+'.'+i));}
      else if(f.fields)check(f.fields,value,key);
      else assert.equal(typeof value,f.type==='boolean'?'boolean':'string',key);
    }
  };
  for(const page of pages) check(page.fields,JSON.parse(await read(page.path)),page.name);
  for(const lang of languages){
    const home=pages.find(p=>p.name==='home_'+lang);
    assert.ok(!home.fields.some(f=>f.name==='header'||f.name==='footer'));
    assert.deepEqual(home.fields.slice(1,9).map(f=>f.name),['hero','services','projects','production','rental','about','clients','faq']);
  }
});

test('editing homepage text and SEO produces escaped, server-visible HTML',async()=>{
  const data=JSON.parse(await read('content/home/ru.json'));
  data.seo.title='CMS title <test>';
  data.seo.description='CMS description "quoted"';
  const hero=Object.keys(data.hero).find(key=>data.hero[key].startsWith('Выставочные стенды.'));
  data.hero[hero]='Заголовок из CMS';
  const html=render(await read('src/home/ru.html'),data,{...renderShared(await loadShared(fileURLToPath(root),'ru'),'ru'),faq_items:faqItems(data.faq.items),projects_cards:'',form_fields_lead:'',form_fields_quote:''});
  assert.match(html,/<title>CMS title &lt;test&gt;<\/title>/);
  assert.match(html,/content="CMS description &quot;quoted&quot;"/);
  assert.match(html,/<h1[^>]*>Заголовок из CMS/);
});

test('generated homepages have external assets, native Netlify forms and optimized images',async()=>{
  for(const lang of ['az','ru','en']){
    const html=await read('dist/'+(lang==='az'?'index.html':lang+'/index.html'));
    assert.doesNotMatch(html,/<style\b|\sstyle=|<script\b(?![^>]*\bsrc=)|\son\w+=/i);
    assert.equal((html.match(/data-netlify="true"/g)||[]).length,2);
    for(const type of ['lead','quote']) assert.ok(html.includes(`name="home-${lang}-${type}"`));
    assert.equal((html.match(/netlify-honeypot="website"/g)||[]).length,2);
    assert.equal((html.match(/<h1\b/g)||[]).length,1);
    assert.doesNotMatch(html,/\{\{[\w.]+\}\}/);
    assert.doesNotMatch(html,/<img[^>]+src="[^" ]+\.png"/);
    for(const [,url] of html.matchAll(/(?:src|href)="(\/assets\/[^" ]+)"/g)) assert.ok((await fs.stat(new URL('dist'+url,root))).isFile());
  }
});

test('all 24 inner pages preserve their content and receive global header/footer and SEO',async()=>{
  for(const lang of languages) for(const name of innerPages) {
    const route=pageRoute(lang,name).slice(1);
    const source=await read(route),built=await read('dist/'+route);
    const omitRegions=html=>html.replace(/<header\b[\s\S]*?<\/header>|<footer\b[\s\S]*?<\/footer>|<title>[\s\S]*?<\/title>|<meta name="description" content="[^"]*">/g,'');
    assert.equal(omitRegions(built),omitRegions(source),route);
    const shared=renderShared(await loadShared(fileURLToPath(root),lang),lang,name);
    assert.ok(built.includes(shared.shared_header),route);
    assert.ok(built.includes(shared.shared_footer),route);
    for(const l of languages) assert.ok(built.includes(`href="${pageRoute(l,name)}" hreflang="${l}"`),route);
    assert.doesNotMatch(built,/\{\{[\w.]+\}\}/);
  }
});

test('shared settings apply to desktop/mobile menus, contacts and partner lists safely',async()=>{
  const data=await loadShared(fileURLToPath(root),'ru');
  data.header.navigation[0].label='Изменённое меню <test>';
  data.footer.contacts.phone='+994 50 123 45 67';
  data.footer.contacts.phoneLink='tel:+994501234567';
  data.clients.items.push({image:'/img/partners/aic.png',alt:{ru:'Новый клиент',az:'New AZ',en:'New EN'}});
  const result=renderShared(data,'ru','stands');
  assert.equal((result.shared_header.match(/Изменённое меню &lt;test&gt;/g)||[]).length,2);
  assert.match(result.shared_header,/href="stands.html" class="is-current" aria-current="page"/);
  assert.ok(result.shared_footer.includes('href="tel:+994501234567">+994 50 123 45 67</a>'));
  assert.ok(result.shared_clients.includes('alt="Новый клиент"'));
  assert.doesNotMatch(result.shared_footer,/href="#" class="is-current"/);
  data.header.navigation[0].href='javascript:alert(1)';
  assert.throws(()=>renderShared(data,'ru'),/Invalid content link/);
});

test('homepage image bytes reduced by at least 75 percent',async()=>{
  const report=JSON.parse(await read('.cache/build-report.json'));
  assert.ok(report.optimizedLargestVariantsBytes < report.originalBytes*.25);
});

test('browser: responsive pages, dialogs, selection, failed and successful form responses',async t=>{
  const require=createRequire(import.meta.url);
  let chromium;
  try {({chromium}=require(process.env.ADVEX_PLAYWRIGHT_MODULE||'playwright'));}
  catch {t.skip('Install Playwright to run browser checks against npm run preview');return;}
  const browser=await chromium.launch({headless:true});
  try {
    for(const width of [1440,390]) for(const lang of ['az','ru','en']){
      const context=await browser.newContext({viewport:{width,height:1000}});
      const page=await context.newPage();const errors=[],badResponses=[];
      page.on('pageerror',e=>errors.push(e.message));
      page.on('response',r=>{if(r.url().startsWith('http://127.0.0.1:4173/') && r.status()>=400)badResponses.push(r.url());});
      const url='http://127.0.0.1:4173/'+(lang==='az'?'':lang+'/');
      await page.goto(url,{waitUntil:'networkidle'});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${lang} ${width} overflow`);
      if(width===390){await page.locator('[data-menu-toggle]').click();assert.equal(await page.locator('#mobile-nav').evaluate(el=>el.classList.contains('is-open')),true);await page.keyboard.press('Escape');}
      await page.locator('[data-quote-open]').click();assert.equal(await page.locator('#quote-modal').evaluate(el=>el.open),true);await page.keyboard.press('Escape');
      await page.locator('[data-add]').first().click();assert.equal(await page.locator('[data-cart-count]').first().textContent(),'1');
      await page.reload({waitUntil:'networkidle'});assert.equal(await page.locator('[data-add]').first().getAttribute('aria-pressed'),'true');
      await page.locator('.home-selection input').fill('3');await page.locator('.home-selection input').dispatchEvent('change');
      await page.locator('#f-name').fill('Тест ADVEX');await page.locator('#f-phone').fill('+994501234567');await page.locator('[data-lead-form] [name="consent"]').check();
      // These response fixtures test the UI only; they do not claim an email was sent.
      let body='';await page.route('**/form-success.html',async route=>{body=route.request().postData()||'';await route.fulfill({status:500,body:'failure'});});
      await page.locator('[data-lead-form] [type="submit"]').click();await page.locator('[data-lead-form] .form-feedback.is-error').waitFor();assert.equal(await page.locator('[data-lead-form] [type="submit"]').isEnabled(),true);
      await page.unroute('**/form-success.html');await page.route('**/form-success.html',async route=>{body=route.request().postData()||'';await route.fulfill({status:200,body:'received'});});
      await page.locator('[data-lead-form] [type="submit"]').click();await page.waitForFunction(()=>!document.querySelector('[data-lead-form]').hasAttribute('aria-busy'));
      assert.equal(await page.locator('[data-lead-form] [type="submit"]').isDisabled(),true);assert.ok(body.includes(`home-${lang}-lead`));assert.ok(body.includes('"quantity":3'));
      await page.locator('[data-quote-open]').click();await page.locator('#q-name').fill('Тест расчёта');await page.locator('#q-contact').fill('test@example.com');await page.locator('[data-quote-form] [name="consent"]').check();
      await page.locator('#q-file').setInputFiles({name:'brief.txt',mimeType:'text/plain',buffer:Buffer.from('Test brief')});await page.locator('[data-quote-form] [type="submit"]').click();await page.waitForFunction(()=>!document.querySelector('[data-quote-form]').hasAttribute('aria-busy'));
      assert.ok(body.includes('brief.txt'));assert.ok(body.includes(`home-${lang}-quote`));
      await page.keyboard.press('Escape');
      for(let y=0;y<await page.evaluate(()=>document.body.scrollHeight);y+=800){await page.evaluate(y=>scrollTo(0,y),y);await page.waitForTimeout(30);}
      await page.waitForTimeout(200);
      assert.equal(await page.locator('img').evaluateAll(images=>images.filter(i=>i.complete && !i.naturalWidth).length),0);
      assert.deepEqual(errors,[]);
      assert.deepEqual(badResponses.filter(u=>!u.endsWith('/form-success.html')),[]);
      if(width===390 && lang==='ru'){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join('.cache','home-mobile.png')});}
      await context.close();
    }
  } finally {await browser.close();}
});

test('browser: shared navigation on inner pages at desktop and mobile widths',async t=>{
  const require=createRequire(import.meta.url);
  let chromium;
  try {({chromium}=require(process.env.ADVEX_PLAYWRIGHT_MODULE||'playwright'));}
  catch {t.skip('Install Playwright to run browser checks');return;}
  const browser=await chromium.launch({headless:true});
  try {
    for(const width of [1440,390]) for(const lang of languages){
      const page=await browser.newPage({viewport:{width,height:1000}});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto('http://127.0.0.1:4173'+pageRoute(lang,'catalog'),{waitUntil:'networkidle'});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      assert.equal(await page.locator('.nav-dd-btn').evaluate(el=>el.classList.contains('is-current')),true);
      const other=lang==='en'?'ru':'en';
      if(width===390){
        await page.locator('[data-menu-toggle]').click();
        assert.equal(await page.locator('#mobile-nav').evaluate(el=>el.classList.contains('is-open')),true);
        await page.locator(`.mnav-lang a[hreflang="${other}"]`).click();
      } else {
        await page.locator('.lang-dd > button').click();
        await page.locator(`#lang-menu a[hreflang="${other}"]`).click();
      }
      await page.waitForURL('**/'+other+'/catalog.html');
      assert.equal(await page.locator('html').getAttribute('lang'),other);
      assert.equal(await page.locator('.hdr-cta').getAttribute('href'),'index.html#contact');
      assert.deepEqual(errors,[]);
      if(width===390 && lang==='ru')await page.screenshot({path:path.join('.cache','shared-inner-mobile.png')});
      await page.close();
    }
  } finally {await browser.close();}
});
