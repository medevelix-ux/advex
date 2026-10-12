// Edit the files used by Pages CMS, rebuild, check real output, then restore.
import fs from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {languages,innerPages,pageRoute} from './shared.mjs';
const root=new URL('../',import.meta.url);
const read=p=>fs.readFile(new URL(p,root),'utf8');
const files=['content/home/ru.json','content/shared/header/ru.json','content/shared/footer/ru.json','content/shared/clients.json','content/pages/contacts/ru.json'];
const before=new Map(await Promise.all(files.map(async p=>[p,await read(p)])));
const data=Object.fromEntries([...before].map(([p,v])=>[p,JSON.parse(v)]));
const pages=languages.flatMap(lang=>['index',...innerPages].map(p=>'dist'+pageRoute(lang,p)));
const oldHTML=new Map(await Promise.all(pages.map(async p=>[p,await read(p)])));
const home=data[files[0]],header=data[files[1]],footer=data[files[2]],clients=data[files[3]];
home.seo.title='CMS integration check';
home.seo.description='Description updated through content data';
home.hero.image_001='/img/case/case2.png';
home.hero.image_002='/img/case/case2.png';
home.projects.items.push({...home.projects.items[0],title:'New project from CMS'});
home.faq.items.push({question:'New FAQ from CMS?',answer:'Server-rendered answer.'});
header.navigation[0].label='Shared menu CMS check';
footer.contacts.address='Shared address CMS check';
footer.contacts.phone='+994 50 123 45 67';
footer.contacts.phoneLink='tel:+994501234567';
clients.items.push({...structuredClone(clients.items[0]),alt:{ru:'Shared partner RU',az:'Shared partner AZ',en:'Shared partner EN'}});
data[files[4]].seo.title='Inner SEO CMS check';
const changed=new Map(files.map(p=>[p,JSON.stringify(data[p],null,2)+'\n']));
const build=()=>{const r=spawnSync(process.execPath,['scripts/build.mjs'],{cwd:root,stdio:'pipe',encoding:'utf8'});if(r.status!==0)throw new Error(r.stderr);};
try {
  for(const [p,v] of changed)await fs.writeFile(new URL(p,root),v);
  build();
  const html=await read('dist/ru/index.html');
  assert.ok(html.includes('<title>CMS integration check</title>'));
  assert.ok(html.includes('content="Description updated through content data"'));
  assert.equal((html.match(/class="proj"/g)||[]).length,5);
  assert.ok(html.includes('New project from CMS'));
  assert.ok(html.includes('New FAQ from CMS?'));
  assert.notEqual(html.match(/class="hero-bg" src="([^"]+)"/)[1],oldHTML.get('dist/ru/index.html').match(/class="hero-bg" src="([^"]+)"/)[1]);
  for(const page of ['index',...innerPages]){
    const ru=await read('dist/ru/'+page+'.html');
    assert.equal((ru.match(/Shared menu CMS check/g)||[]).length,2,page);
    assert.ok(ru.includes('Shared address CMS check'),page);
    assert.ok(ru.includes('href="tel:+994501234567">+994 50 123 45 67</a>'),page);
  }
  for(const lang of languages){
    const page=await read('dist'+pageRoute(lang,'index'));
    assert.ok(page.includes('Shared partner '+lang.toUpperCase()),lang);
    if(lang!=='ru')assert.ok(!page.includes('Shared menu CMS check'),'Language edits must remain separate');
  }
  assert.ok((await read('dist/ru/contacts.html')).includes('<title>Inner SEO CMS check</title>'));
  console.log('PASS: homepage SEO/image/projects/FAQ, shared navigation/footer on nine routes, partners on all languages, and inner-page SEO.');
} finally {
  for(const [p,v] of changed)assert.equal(await read(p),v,'Concurrent edit in '+p+'; recover original from backup before retrying');
  for(const [p,v] of before)await fs.writeFile(new URL(p,root),v);
  build();
  for(const [p,v] of oldHTML)assert.equal(await read(p),v,p);
  console.log('PASS: content and all 27 generated pages restored exactly.');
}
