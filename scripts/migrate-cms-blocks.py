"""One-time migration from the homepage pilot; never run after CMS editing resumes."""
from pathlib import Path
from html import unescape
import json, re, shutil

ROOT = Path(__file__).resolve().parents[1]
LANGS = {'ru': 'Русская версия', 'az': 'Азербайджанская версия', 'en': 'Английская версия'}
PAGES = {'stands': 'Изготовление стендов', 'staff': 'Модели на выставку', 'catalog': 'Каталог стендов', 'rental': 'Аренда оборудования', 'projects': 'Наши проекты', 'about': 'О компании', 'contacts': 'Контакты', 'delivery': 'Доставка и оплата'}
assert not (ROOT / 'content/shared/clients.json').exists(), 'Migration already applied'
backup = ROOT / '.cache/cms-before-blocks'
assert not backup.exists(), 'Backup already exists; inspect before retrying'
backup.mkdir(parents=True)
for name in ['content', 'src/home']:
    shutil.copytree(ROOT / name, backup / name)
shutil.copyfile(ROOT / '.pages.yml', backup / '.pages.yml')

def read(p): return (ROOT / p).read_text(encoding='utf-8')
def write(p, value):
    dest = ROOT / p
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(value, encoding='utf-8')
def save(p, obj): write(p, json.dumps(obj, ensure_ascii=False, indent=2) + '\n')
def field(name, label, kind='string', **kw): return dict(name=name, label=label, type=kind, **kw)
def obj(name, label, fields, **kw): return field(name, label, 'object', fields=fields, **kw)
def group(name, label, items): return dict(name=name, label=label, type='group', items=items)
def entry(name, label, path, fields): return dict(name=name, label=label, type='file', path=path, format='json', fields=fields)
def itemlist(name, label, fields, summary='{label}'):
    return obj(name, label, fields, list={'collapsible': {'collapsed': True, 'summary': summary}})
linkfields = [field('label', 'Текст ссылки', required=True), field('href', 'Адрес ссылки', required=True, description='Например: stands.html, index.html#contact или https://example.com')]
def links(name, label): return itemlist(name, label, linkfields)
def linkgroup(name, label): return obj(name, label, [field('title', 'Заголовок'), links('items', 'Ссылки')])
headerfields = [field('brand', 'Название в логотипе'), obj('catalog', 'Меню каталога', [field('label', 'Название меню'), field('allLabel', 'Кнопка «Весь каталог»'), field('href', 'Адрес каталога'), links('items', 'Категории')]), links('navigation', 'Основное меню — компьютер и телефон'), obj('cta', 'Кнопка обсуждения проекта', linkfields), obj('languages', 'Названия языков', [field(l, LANGS[l]) for l in ['az','ru','en']])]
footerfields = [field('brand', 'Название в логотипе'), field('description', 'Описание компании', 'text'), field('tagline', 'Слоган'), linkgroup('directions', 'Направления'), linkgroup('structures', 'Конструкции'), obj('contacts', 'Контакты', [field('title', 'Название колонки'), field('address', 'Адрес', 'text'), field('phone', 'Телефон — видимый текст'), field('phoneLink', 'Телефон для звонка', description='Формат: tel:+994503161661'), field('email', 'Email')]), links('companyLinks', 'О компании и документы'), field('copyright', 'Копирайт'), field('region', 'Подпись внизу')]
config = json.loads(read('.pages.yml'))
oldentries = {p['name'].split('_')[-1]: p for p in config['content']}
homes, headers, footers = [], [], []
clients = {'titles': {}, 'items': []}
for lang in LANGS:
    data = json.loads(read(f'content/home/{lang}.json'))
    h, f, c = data.pop('header'), data.pop('footer'), data.pop('clients')
    text = lambda d, n: d[f'text_{n:03d}']
    header = {'brand':text(h,1), 'catalog':{'label':text(h,2),'allLabel':text(h,15),'href':'catalog.html','items':[{'label':text(h,i),'href':'catalog.html'} for i in range(3,15)]}, 'navigation':[{'label':text(h,i),'href':route+'.html'} for i,route in zip(range(16,22),['stands','staff','rental','projects','about','contacts'])], 'cta':{'label':text(h,29),'href':'index.html#contact'}, 'languages':{l:text(h,i) for l,i in zip(['az','ru','en'],[24,26,28])}}
    # Desktop and mobile share one list. Abort if an editor has intentionally diverged them.
    for mobile, desktop in [(30,1),(31,2), *zip(range(32,44),range(3,15)), *zip(range(45,51),range(16,22)),(54,29)]:
        assert text(h,mobile)==text(h,desktop), f'Divergent mobile header {lang}: {mobile}'
    assert text(h,44).removesuffix(' →')==text(h,15)
    footer = {'brand':text(f,1),'description':text(f,2),'tagline':text(f,3), 'directions':{'title':text(f,4),'items':[{'label':text(f,i),'href':route+'.html'} for i,route in zip(range(5,10),['catalog','stands','staff','rental','projects'])]}, 'structures':{'title':text(f,10),'items':[{'label':text(f,i),'href':'catalog.html'} for i in range(11,15)]}, 'contacts':{'title':text(f,15),'address':text(f,16),'phone':'+994 50 316 16 61','phoneLink':text(f,17),'email':text(f,19)}, 'companyLinks':[{'label':text(f,i),'href':route} for i,route in zip(range(20,24),['about.html','contacts.html','delivery.html','#'])], 'copyright':text(f,24),'region':text(f,28)}
    assert text(f,18)=='mailto:'+text(f,19), 'Email label and destination differ; reconcile explicitly'
    template = read(f'src/home/{lang}.html')
    hp = re.search(r'<header\b.*?</header>', template, re.S).group()
    fp = re.search(r'<footer\b.*?</footer>', template, re.S).group()
    hp = re.sub(r'(<div class="cat-menu"[^>]*>\s*<ul>).*?(</ul>)',r'\1{{header_catalog_desktop}}\2',hp,flags=re.S)
    hp = re.sub(r'(<div class="mnav-cat-list">).*?(</div>)',r'\1{{header_catalog_mobile}}\2',hp,flags=re.S)
    hp = re.sub(r'(?:\s*<a href="(?:stands|staff|rental|projects|about|contacts)\.html">\{\{header\.text_\d+\}\}</a>){6}', '\n{{header_navigation}}',hp)
    mapping = {1:'brand',2:'catalog.label',15:'catalog.allLabel',24:'languages.az',26:'languages.ru',28:'languages.en',29:'cta.label',30:'brand',31:'catalog.label',54:'cta.label'}
    for i,k in mapping.items(): hp=hp.replace('{{header.text_%03d}}'%i,'{{header.'+k+'}}')
    for i,l in {22:lang.upper(),23:'AZ',25:'RU',27:'EN',51:'AZ',52:'RU',53:'EN'}.items(): hp=hp.replace('{{header.text_%03d}}'%i,l)
    hp=hp.replace('href="catalog.html" class="cat-all"','href="{{header.catalog.href}}" class="cat-all"').replace('href="#contact"','href="{{header.cta.href}}"')
    fp=re.sub(r'(<ul>).*?(</ul>)',lambda m: m.group(1)+('{{footer_directions}}' if 'text_005' in m.group() else '{{footer_structures}}')+m.group(2),fp,flags=re.S)
    fp=re.sub(r'(?:\s*<a href="(?:about.html|contacts.html|delivery.html|#)">\{\{footer\.text_\d+\}\}</a>){4}', '\n{{footer_company_links}}',fp)
    fm={1:'brand',2:'description',3:'tagline',4:'directions.title',10:'structures.title',15:'contacts.title',16:'contacts.address',17:'contacts.phoneLink',19:'contacts.email',24:'copyright',28:'region'}
    for i,k in fm.items(): fp=fp.replace('{{footer.text_%03d}}'%i,'{{footer.'+k+'}}')
    fp=fp.replace('{{footer.text_018}}','mailto:{{footer.contacts.email}}').replace('+994 50 316 16 61','{{footer.contacts.phone}}')
    for i,l in {25:'az',26:'ru',27:'en'}.items(): fp=fp.replace('{{footer.text_%03d}}'%i,'{{header.languages.'+l+'}}')
    for part,name in [(hp,'header'),(fp,'footer')]:
        assert not re.search(r'\{\{(?:header|footer)\.text_',part), name
        # The route changes with the current page, while language labels stay shared.
        part=re.sub(r'href="[^"]+"(?= hreflang="(az|ru|en)")',lambda m:'href="{{routes.'+m.group(1)+'}}"',part)
        write(f'src/partials/{name}-{lang}.html',part+'\n')
    template=re.sub(r'<header\b.*?</header>','{{shared_header}}',template,flags=re.S)
    template=re.sub(r'<footer\b.*?</footer>','{{shared_footer}}',template,flags=re.S)
    template=re.sub(r'<section class="wrap" aria-labelledby="clients-title">.*?</section>','{{shared_clients}}',template,flags=re.S)
    data['clients']={'enabled':True}
    clients['titles'][lang]=text(c,1)
    for index,n in enumerate(range(2,13,2)):
        if lang=='ru': clients['items'].append({'image':c[f'image_{n:03d}'],'alt':{}})
        assert clients['items'][index]['image']==c[f'image_{n:03d}'], 'Localized logos differ; reconcile explicitly'
        clients['items'][index]['alt'][lang]=text(c,n+1)
    # FAQ is an editable, reorderable list; retain the four heading/button fields.
    faq=data['faq']
    data['faq']={k:v for k,v in faq.items() if int(k[-3:])<=4}
    data['faq']['items']=[{'question':text(faq,n),'answer':text(faq,n+1)} for n in range(5,17,2)]
    template=re.sub(r'(<div class="faq-r">).*?(</div>)',r'\1{{faq_items}}\2',template,flags=re.S)
    write(f'src/home/{lang}.html',template)
    save(f'content/home/{lang}.json',data)
    save(f'content/shared/header/{lang}.json',header)
    save(f'content/shared/footer/{lang}.json',footer)
    headers.append(entry(f'header_{lang}',LANGS[lang],f'content/shared/header/{lang}.json',headerfields))
    footers.append(entry(f'footer_{lang}',LANGS[lang],f'content/shared/footer/{lang}.json',footerfields))
    sections={s['name']:s for s in oldentries[lang]['fields']}
    sections['clients']=obj('clients','Клиенты и партнёры',[field('enabled','Показывать блок на этой странице','boolean')],description='Заголовки и логотипы: «Общие настройки → Клиенты и партнёры». Один список для всех языков и страниц, использующих блок.')
    sections['faq']['fields']=sections['faq']['fields'][:4]+[itemlist('items','Вопросы и ответы',[field('question','Вопрос',required=True),field('answer','Ответ','text',required=True)],'{question}')]
    labels={'hero':'Первый экран','services':'Всё для вашего участия в выставке','projects':'Кейсы','production':'От чистого листа до готового стенда','rental':'Детали, которые дополняют пространство','about':'О компании','faq':'FAQ'}
    for k,label in labels.items(): sections[k]['label']=label
    sections['projects']['fields'][-1]['list']={'collapsible':{'collapsed':True,'summary':'{title}'}}
    fields=[sections[k] for k in ['seo','hero','services','projects','production','rental','about','clients','faq']]
    fields.append(obj('additional','Дополнительные секции и формы',[sections[k] for k in ['catalog','steps','reviews','contact','quote']]))
    data['additional']={k:data.pop(k) for k in ['catalog','steps','reviews','contact','quote']}
    for k in data['additional']: template=template.replace('{{'+k+'.','{{additional.'+k+'.')
    write(f'src/home/{lang}.html',template)
    save(f'content/home/{lang}.json',data)
    homes.append(entry(f'home_{lang}',LANGS[lang],f'content/home/{lang}.json',fields))

save('content/shared/clients.json',clients)
clientfields=[obj('titles','Заголовки по языкам',[field(l,LANGS[l]) for l in LANGS]),itemlist('items','Логотипы',[field('image','Логотип','image',required=True),obj('alt','Название / описание логотипа',[field(l,LANGS[l]) for l in LANGS])],'{alt.ru}')]
seo=[obj('seo','SEO',[field('title','Title',required=True),field('description','Description','text',required=True)],description='На внутренних страницах пока редактируются SEO и общие Header/Footer. Содержание страницы сохранено в исходном макете.')]
inner={}
for page,label in PAGES.items():
    versions=[]
    for lang in LANGS:
        source=read(('' if lang=='az' else lang+'/')+page+'.html')
        data={'seo':{'title':unescape(re.search(r'<title>(.*?)</title>',source,re.S).group(1)), 'description':unescape(re.search(r'<meta name="description" content="([^"]*)"',source).group(1))}}
        p=f'content/pages/{page}/{lang}.json'
        save(p,data)
        versions.append(entry(f'{page}_{lang}',LANGS[lang],p,seo))
    inner[page]=group(page,label,versions)
config['content']=[group('home','Главная страница',homes),group('services','Услуги',[inner['stands'],inner['staff']]),group('equipment','Каталог оборудования',[inner['catalog'],inner['rental']]),inner['projects'],group('information','Информационные страницы',[inner['about'],inner['contacts'],inner['delivery']]),group('shared','Общие настройки (Header / Footer)',[group('header','Header — шапка сайта',headers),group('footer','Footer — подвал сайта',footers),entry('clients','Клиенты и партнёры','content/shared/clients.json',clientfields)])]
save('.pages.yml',config)
print('Migrated 3 homepages, 6 shared header/footer files, one partner list and SEO for 24 inner pages.')
