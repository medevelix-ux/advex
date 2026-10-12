// Integration check: edit the same JSON as Pages CMS, build, verify, then restore.
import fs from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const file=new URL('../content/home/ru.json',import.meta.url);
const before=await fs.readFile(file,'utf8');
const oldHTML=await fs.readFile(new URL('../dist/ru/index.html',import.meta.url),'utf8');
const data=JSON.parse(before);
data.seo.title='CMS integration check';
data.seo.description='Description updated through content data';
data.hero.image_001='/img/case/case2.png';
data.projects.items.push({...data.projects.items[0],title:'New project from CMS'});
const changed=JSON.stringify(data,null,2)+'\n';
const build=()=>{const result=spawnSync(process.execPath,['scripts/build.mjs'],{cwd:new URL('../',import.meta.url),stdio:'pipe',encoding:'utf8'});if(result.status!==0)throw new Error(result.stderr);};
try {
  // Locate the desktop hero image by the same field mapping as the template.
  const template=await fs.readFile(new URL('../src/home/ru.html',import.meta.url),'utf8');
  const heroKey=template.match(/class="hero-bg" src="\{\{hero\.([\w]+)\}\}"/)[1];
  data.hero[heroKey]='/img/case/case2.png';
  await fs.writeFile(file,JSON.stringify(data,null,2)+'\n');
  build();
  const html=await fs.readFile(new URL('../dist/ru/index.html',import.meta.url),'utf8');
  assert.ok(html.includes('<title>CMS integration check</title>'));
  assert.ok(html.includes('content="Description updated through content data"'));
  assert.equal((html.match(/class="proj"/g)||[]).length,5);
  assert.ok(html.includes('New project from CMS'));
  assert.notEqual(html.match(/class="hero-bg" src="([^"]+)"/)[1],oldHTML.match(/class="hero-bg" src="([^"]+)"/)[1]);
  console.log('PASS: SEO edit, image replacement and fifth project reach generated HTML.');
} finally {
  const current=await fs.readFile(file,'utf8');
  if(current!==JSON.stringify(data,null,2)+'\n') throw new Error('Concurrent content edit detected; original backup not restored automatically.');
  await fs.writeFile(file,before);
  build();
  assert.equal(await fs.readFile(new URL('../dist/ru/index.html',import.meta.url),'utf8'),oldHTML);
  console.log('PASS: original content and generated page restored exactly.');
}
