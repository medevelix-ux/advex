"""One-time migration of the supplied static homepages. Not needed for deployment."""
from pathlib import Path
from html.parser import HTMLParser
from html import unescape
import json, re

ROOT = Path(__file__).resolve().parents[1]
SECTIONS = ['header', 'hero', 'catalog', 'services', 'projects', 'production', 'steps', 'rental', 'about', 'clients', 'reviews', 'faq', 'contact', 'quote', 'footer']
LABELS = ['Шапка и навигация', 'Первый экран', 'Каталог', 'Направления', 'Проекты на главной', 'Дизайн и производство', 'Порядок работы', 'Аренда', 'О компании', 'Клиенты', 'Отзывы', 'Вопросы и ответы', 'Контакты и форма', 'Форма расчёта', 'Подвал']
for d in ['src/home', 'src/assets', 'content/home', 'tests']:
    (ROOT / d).mkdir(parents=True, exist_ok=True)

def save(path, text):
    (ROOT / path).write_text(text, encoding='utf-8')

schemas = {}
ru_labels = {}
inline_styles = {}

class Extract(HTMLParser):
    def __init__(self, source, lang):
        super().__init__(convert_charrefs=False)
        self.source, self.lang = source, lang
        self.lines = [0]
        for m in re.finditer('\n', source): self.lines.append(m.end())
        self.edits, self.data, self.fields, self.stack = [], {}, {}, []
        self.section, self.section_index = 'seo', -1
        self.counts = {}
        self.feed(source)
    def source_position(self):
        line, col = self.getpos()
        return self.lines[line - 1] + col
    def field(self, value, kind='text', label=None, key=None):
        section = self.section
        self.counts[section] = self.counts.get(section, 0) + 1
        key = key or f'{kind}_{self.counts[section]:03d}'
        self.data.setdefault(section, {})[key] = value
        identity = f'{section}.{key}'
        if self.lang == 'ru': ru_labels[identity] = label or value[:75]
        field = {'name':key, 'label':ru_labels.get(identity, label or value[:75]), 'type':'image' if kind=='image' else ('text' if len(value)>90 else 'string')}
        self.fields.setdefault(section, []).append(field)
        return '{{' + identity + '}}'
    def handle_comment(self, value):
        if re.match(r'\s*={5,}', value):
            self.section_index += 1
            self.section = SECTIONS[self.section_index]
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag not in {'meta','link','img','source','br','hr','input','use','path','polygon','circle','rect','line','stop'}:
            self.stack.append(tag)
        raw = self.get_starttag_text()
        def replace(m):
            name, quote, val = m.group(1), m.group(2), m.group(3)
            value = unescape(val)
            kind = 'text'
            if tag == 'meta' and a.get('name') == 'description' and name == 'content':
                token = self.field(value, label='Meta description', key='description')
            elif tag in ('img','source') and name in ('src','srcset'):
                value = '/' + value.removeprefix('../').lstrip('/')
                token = self.field(value, 'image', label='Изображение: ' + value.split('/')[-1])
            elif name in ('alt','placeholder') and value:
                token = self.field(value, label=('Описание изображения: ' if name=='alt' else 'Подсказка поля: ') + value[:60])
            elif tag=='a' and name=='href' and value.startswith(('tel:','mailto:')):
                token = self.field(value, label='Ссылка: ' + value)
            else: return m.group(0)
            return name + '=' + quote + token + quote
        new = re.sub(r'([\w-]+)=("|\')(.*?)\2', replace, raw)
        if new != raw: self.edits.append((self.source_position(), self.source_position()+len(raw), new))
    def handle_startendtag(self, tag, attrs): self.handle_starttag(tag, attrs)
    def handle_endtag(self, tag):
        if tag in self.stack:
            i=len(self.stack)-1-self.stack[::-1].index(tag)
            del self.stack[i:]
    def handle_data(self, value):
        if any(x in self.stack for x in ('script','style','svg')) or not value.strip(): return
        if '{{' in value or re.fullmatch(r'[\d\s/·*.,—–−+]+',value): return
        clean=value.strip()
        before=len(value)-len(value.lstrip())
        start=self.source_position()+before
        key='title' if self.stack and self.stack[-1]=='title' else None
        label='SEO title' if key else ('Заголовок: ' if any(x in self.stack for x in ('h1','h2','h3')) else '')+clean[:75]
        self.edits.append((start,start+len(clean),self.field(unescape(clean),label=label,key=key)))
    def result(self):
        output=self.source
        for start,end,value in sorted(self.edits,reverse=True): output=output[:start]+value+output[end:]
        return output

for lang in ['ru','az','en']:
    source = (ROOT / ('index.html' if lang=='az' else f'{lang}/index.html')).read_text(encoding='utf-8')
    css = re.search(r'<style>(.*?)</style>',source,re.S).group(1)
    scripts = re.findall(r'<script>(.*?)</script>',source,re.S)
    # Reuse navigation/sliders; the pilot owns cart and form handlers separately.
    js=scripts[0].split('  /* ---------- Форма заявки ---------- */')[0]+'\n})();\n'
    start=js.index('  /* ---------- Подборка оборудования ---------- */')
    end=js.index('  /* ---------- Слайдер отзывов ---------- */')
    js=js[:start]+js[end:]
    if lang=='ru': save('src/assets/home.js',js)
    source=re.sub(r'<style>.*?</style>','<link rel="stylesheet" href="/assets/home.css">',source,flags=re.S)
    source=re.sub(r'<script>.*?</script>','',source,flags=re.S)
    source=source.replace('</body>','<script src="/assets/home.js" defer></script>\n<script src="/assets/forms.js" defer></script>\n</body>')
    # Convert the four existing inline styles to reusable CSS classes.
    def style_tag(m):
        tag=m.group(0)
        sm=re.search(r'\sstyle="([^"]*)"',tag)
        if not sm:return tag
        style=sm.group(1)
        if style not in inline_styles:inline_styles[style]='home-style-'+str(len(inline_styles)+1)
        cl=inline_styles[style]
        tag=tag.replace(sm.group(0),'')
        return tag.replace('class="','class="'+cl+' ',1) if 'class="' in tag else tag[:-1]+' class="'+cl+'">'
    source=re.sub(r'<[^>]+\sstyle="[^"]*"[^>]*>',style_tag,source)
    # Point homepage category cards at the existing catalogue during this pilot.
    source=re.sub(r'href="stands/[^\"]+/index.html"','href="catalog.html"',source)
    source=source.replace('href="#" class="btn btn-dark"','href="stands.html" class="btn btn-dark"')
    # Extract repeatable projects before generic text fields.
    from lxml import html as lh
    tree=lh.fromstring(source)
    projects=[]
    for li in tree.xpath('//li[a[contains(concat(" ",normalize-space(@class)," ")," proj ")]]'):
        a=li.find('a'); img=a.find('img')
        projects.append({'title':a.xpath('.//h3')[0].text_content(),'subtitle':a.xpath('.//span[@class="muted"]')[0].text_content(),'image':'/'+img.get('src').removeprefix('../'),'alt':img.get('alt',''),'link':a.get('href'),'badge':a.xpath('.//span[contains(@class,"pos-tl")]')[0].text_content()})
    source=re.sub(r'    <li class="p-[a-d]">.*?</li>\n',lambda m:'    {{projects_cards}}\n' if 'class="p-a"' in m.group() else '',source)
    source=re.sub(r'<form([^>]+)action="#"',r'<form\1action="/api/lead" enctype="multipart/form-data"',source)
    source=source.replace('data-lead-form>','data-lead-form>\n{{form_fields_lead}}')
    source=source.replace('data-quote-form>','data-quote-form>\n{{form_fields_quote}}')
    hint={'ru':'Документ или изображение · до 7 МБ · будет приложен к заявке','az':'Sənəd və ya şəkil · 7 MB-dək · sorğuya əlavə ediləcək','en':'Document or image · up to 7 MB · attached to your request'}[lang]
    source=re.sub(r'(<p[^>]+id="q-file-hint">).*?(</p>)',lambda m:m[1]+hint+m[2],source)
    source=re.sub(r'(<div class="sent"[^>]*data-quote-status[^>]*>).*?(</div>)',r'\1\2',source)
    ex=Extract(source,lang)
    ex.data['projects']['items']=projects
    ex.fields['projects'].append({'name':'items','label':'Карточки проектов — добавить / удалить / переставить','type':'object','list':True,'fields':[{'name':n,'label':l,'type':t} for n,l,t in [('title','Название','string'),('subtitle','Описание','string'),('image','Фотография','image'),('alt','Описание фотографии','string'),('link','Ссылка','string'),('badge','Подпись на фотографии','string')]]})
    save(f'src/home/{lang}.html',ex.result())
    save(f'content/home/{lang}.json',json.dumps(ex.data,ensure_ascii=False,indent=2)+'\n')
    schemas[lang]={'name':'home_'+lang,'label':'Главная · '+lang.upper(),'type':'file','path':f'content/home/{lang}.json','format':'json','fields':[{'name':k,'label':dict(zip(SECTIONS,LABELS)).get(k,'SEO'),'type':'object','fields':v} for k,v in ex.fields.items()]}

save('src/assets/home.css',css+'\n'+ '\n'.join('.'+v+'{'+k+'}' for k,v in inline_styles.items())+'\n')
(ROOT / 'img/home-uploads').mkdir(parents=True, exist_ok=True)
save('img/home-uploads/.gitkeep','')
config={'media':{'input':'img/home-uploads','output':'/img/home-uploads','extensions':['png','jpg','jpeg','webp'],'rename':'safe'},'content':[schemas[l] for l in ['ru','az','en']]}
# JSON is valid YAML; no YAML package is required to read or maintain this schema.
save('.pages.yml',json.dumps(config,ensure_ascii=False,indent=2)+'\n')
print('Imported three homepages, shared CSS/JS and Pages CMS fields. Original HTML unchanged.')
