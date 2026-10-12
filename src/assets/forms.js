/* Homepage pilot: form submission, quote dialog and a persistent equipment list. */
(() => {
  'use strict';
  const lang = document.documentElement.lang;
  const words = {
    ru: {pending:'Отправляем…',sent:'Спасибо! Заявка принята. Мы свяжемся с вами.',error:'Не удалось отправить заявку. Попробуйте ещё раз или свяжитесь с нами по телефону.',unavailable:'Отправка пока не настроена. Свяжитесь с нами по телефону.',file:'Выберите документ или изображение размером до 7 МБ.',selected:'Оборудование в заявке',remove:'Убрать',add:'Добавить в подборку: ',verify:'Подтвердите проверку перед отправкой.'},
    az: {pending:'Göndərilir…',sent:'Təşəkkür edirik! Sorğunuz qəbul edildi. Sizinlə əlaqə saxlayacağıq.',error:'Sorğunu göndərmək mümkün olmadı. Yenidən cəhd edin və ya bizə zəng edin.',unavailable:'Göndərmə hələ qurulmayıb. Bizə zəng edin.',file:'7 MB-dək sənəd və ya şəkil seçin.',selected:'Sorğudakı avadanlıq',remove:'Sil',add:'Seçimə əlavə et: ',verify:'Göndərməzdən əvvəl yoxlamanı tamamlayın.'},
    en: {pending:'Sending…',sent:'Thank you! Your request has been accepted. We will contact you.',error:'Your request could not be sent. Please try again or call us.',unavailable:'Online requests are not configured yet. Please call us.',file:'Choose a document or image up to 7 MB.',selected:'Equipment in this request',remove:'Remove',add:'Add to selection: ',verify:'Complete the verification before sending.'}
  }[lang] || {};
  const forms = [...document.querySelectorAll('[data-lead-form], [data-quote-form]')];
  const modal = document.getElementById('quote-modal');
  const opener = document.querySelector('[data-quote-open]');
  opener?.addEventListener('click', event => { event.preventDefault(); modal.showModal(); document.documentElement.classList.add('menu-open'); });
  modal?.querySelector('[data-quote-close]')?.addEventListener('click', () => modal.close());
  modal?.addEventListener('click', event => { if(event.target === modal) modal.close(); });
  modal?.addEventListener('close', () => { document.documentElement.classList.remove('menu-open'); opener?.focus({preventScroll:true}); });

  const storageKey='advex-home-equipment-v1';
  const buttons=[...document.querySelectorAll('[data-add]')];
  let selected={};
  try { const saved=JSON.parse(localStorage.getItem(storageKey) || '{}'); if(saved && typeof saved==='object' && !Array.isArray(saved)) selected=saved; } catch { /* Storage may be disabled. */ }
  const available=new Map(buttons.map(b=>[b.dataset.add,b.closest('li')?.querySelector('h3')?.textContent || b.dataset.name]));
  selected=Object.fromEntries(Object.entries(selected).filter(([id,n])=>available.has(id) && Number.isInteger(n) && n>=1 && n<=99));
  const list=document.createElement('fieldset');
  list.className='home-selection';
  const legend=document.createElement('legend'); legend.textContent=words.selected; list.append(legend);
  const items=document.createElement('div'); list.append(items);
  forms[0]?.insertBefore(list,forms[0].querySelector('.grid2'));
  function renderSelection() {
    try { localStorage.setItem(storageKey,JSON.stringify(selected)); } catch { /* Keep in-memory selection. */ }
    buttons.forEach(b=>{b.setAttribute('aria-pressed',String(Boolean(selected[b.dataset.add]))); b.setAttribute('aria-label',(selected[b.dataset.add]?words.remove+': ':words.add)+available.get(b.dataset.add));});
    document.querySelectorAll('[data-cart-count]').forEach(n=>n.textContent=Object.keys(selected).length);
    document.querySelector('[data-cart-button]')?.setAttribute('aria-label',words.selected+': '+Object.keys(selected).length);
    list.hidden=!Object.keys(selected).length;
    items.replaceChildren();
    for(const [id,quantity] of Object.entries(selected)) {
      const row=document.createElement('div'); row.className='home-selection-row';
      const label=document.createElement('label'); label.textContent=available.get(id);
      const input=document.createElement('input'); input.type='number'; input.min='1'; input.max='99'; input.value=quantity; input.className='inp'; label.append(input);
      input.addEventListener('change',()=>{ selected[id]=Math.max(1,Math.min(99,parseInt(input.value,10)||1)); renderSelection(); });
      const remove=document.createElement('button'); remove.type='button'; remove.className='btn btn-ghost btn-sm'; remove.textContent=words.remove;
      remove.addEventListener('click',()=>{delete selected[id];renderSelection();});
      row.append(label,remove); items.append(row);
    }
  }
  buttons.forEach(b=>b.addEventListener('click',()=>{const id=b.dataset.add;if(selected[id]) delete selected[id];else selected[id]=1;renderSelection();}));
  document.querySelector('[data-cart-button]')?.addEventListener('click',()=>{document.getElementById('contact').scrollIntoView({behavior:'smooth'});});
  renderSelection();

  for (const form of forms) {
    const submit=form.querySelector('[type="submit"]');
    const feedback=form.querySelector('.form-feedback');
    submit.before(feedback);
    const file=form.querySelector('[type="file"]');
    const requestId=form.elements.namedItem('request_id');
    let pending=false, accepted=false;
    const display=(message,isError)=>{feedback.textContent=message;feedback.hidden=false;feedback.classList.toggle('is-error',isError);feedback.focus({preventScroll:true});};
    const validateFile=()=>{
      const selected=file?.files[0];
      const valid=!selected || (selected.size<=7*1024*1024 && /\.(png|jpe?g|webp|gif|pdf|docx?|xlsx?|pptx?|txt|rtf|odt|ods|odp)$/i.test(selected.name));
      file?.setCustomValidity(valid?'':words.file);return valid;
    };
    file?.addEventListener('change',()=>{validateFile();file.reportValidity();});
    form.addEventListener('input',()=>{if(!pending){requestId.value='';if(accepted){accepted=false;submit.disabled=false;feedback.hidden=true;}}});
    form.addEventListener('submit',async event=>{
      event.preventDefault();
      if(pending || accepted || !validateFile() || !form.reportValidity()) return;
      pending=true; submit.disabled=true;form.setAttribute('aria-busy','true');
      display(words.pending,false);
      try {
        requestId.value ||= crypto.randomUUID();
        form.elements.namedItem('equipment').value=JSON.stringify(Object.entries(selected).map(([id,quantity])=>({id,name:available.get(id),quantity})));
        const response=await fetch(form.action,{method:'POST',body:new FormData(form),signal:AbortSignal.timeout(30000)});
        if(!response.ok) {display(response.status===503?words.unavailable:words.error,true);return;}
        accepted=true;display(words.sent,false);
      } catch(error) {display(error.message==='unconfigured' || error.message==='config'?words.unavailable:words.error,true);}
      finally {pending=false;submit.disabled=accepted;form.removeAttribute('aria-busy');}
    });
  }
})();
