export const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function render(template, data, special = {}) {
  return template.replace(/\{\{([\w.]+)\}\}/g, (_, key) => {
    if (Object.hasOwn(special, key)) return special[key];
    const value = key.split('.').reduce((v, k) => v?.[k], data);
    if (typeof value !== 'string') throw new Error(`Missing text field: ${key}`);
    return escape(value);
  });
}

export function safeLink(value) {
  if (typeof value !== 'string' || !value || /[\u0000-\u0020\\]/.test(value) || /^(?:\/\/|javascript:|data:)/i.test(value) || /^(?!https?:)[a-z][a-z\d+.-]*:/i.test(value)) throw new Error('Invalid content link');
  return escape(value);
}
