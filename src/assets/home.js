
/* ADVEX — интерактив главной страницы.
   Весь контент уже есть в HTML; скрипт только добавляет поведение. */
(function () {
  'use strict';

  /* ---------- Мобильное меню ---------- */
  var burger = document.querySelector('[data-menu-toggle]');
  var mnav = document.getElementById('mobile-nav');
  if (burger && mnav) {
    var closeBtn = mnav.querySelector('[data-menu-close]');
    var setMenu = function (open) {
      mnav.classList.toggle('is-open', open);
      document.documentElement.classList.toggle('menu-open', open);
      burger.setAttribute('aria-expanded', String(open));
      if (open && closeBtn) closeBtn.focus();
      if (!open) burger.focus({ preventScroll: true });
    };
    burger.addEventListener('click', function () { setMenu(true); });
    if (closeBtn) closeBtn.addEventListener('click', function () { setMenu(false); });
    mnav.addEventListener('click', function (e) {
      if (e.target.closest('a')) setMenu(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && mnav.classList.contains('is-open')) setMenu(false);
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth > 1280 && mnav.classList.contains('is-open')) setMenu(false);
    });
  }

  /* ---------- Аккордеон направлений ---------- */
  var panels = document.querySelectorAll('[data-acc] .acc-p');
  panels.forEach(function (panel) {
    var toggle = panel.querySelector('.acc-toggle');
    if (!toggle) return;
    toggle.addEventListener('click', function () {
      panels.forEach(function (p) {
        var on = p === panel;
        p.classList.toggle('is-on', on);
        var t = p.querySelector('.acc-toggle');
        if (t) t.setAttribute('aria-expanded', String(on));
      });
      var link = panel.querySelector('.acc-open a');
      if (link) setTimeout(function () { link.focus({ preventScroll: true }); }, 350);
    });
  });

  /* ---------- Эскиз → готовый стенд ---------- */
  document.querySelectorAll('[data-ba]').forEach(function (ba) {
    var range = ba.querySelector('.ba-range');
    if (!range) return;
    var update = function () { ba.style.setProperty('--pos', range.value + '%'); };
    range.addEventListener('input', update);
    update();
  });

  /* ---------- Тексты для скрипта на разных языках ---------- */
  var LANG = (document.documentElement.lang || 'ru').slice(0, 2);
  var T = {
    ru: { add: 'Добавить в подборку: ', remove: 'Убрать из подборки: ' },
    az: { add: 'Seçimə əlavə et: ', remove: 'Seçimdən çıxar: ' },
    en: { add: 'Add to selection: ', remove: 'Remove from selection: ' }
  }[LANG] || { add: 'Добавить в подборку: ', remove: 'Убрать из подборки: ' };

  /* ---------- Каталог стендов в шапке (клик / клавиатура; на десктопе открывается и при наведении) ---------- */
  document.querySelectorAll('[data-nav-dd]').forEach(function (dd) {
    var btn = dd.querySelector('.nav-dd-btn');
    var close = function () { dd.classList.remove('is-open'); btn.setAttribute('aria-expanded', 'false'); };
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = dd.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', function (e) { if (!dd.contains(e.target)) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && dd.classList.contains('is-open')) { close(); btn.focus(); } });
  });

  /* ---------- Выбор языка ---------- */
  document.querySelectorAll('[data-lang-dd]').forEach(function (dd) {
    var btn = dd.querySelector('.lang');
    var close = function () { dd.classList.remove('is-open'); btn.setAttribute('aria-expanded', 'false'); };
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = dd.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', function (e) { if (!dd.contains(e.target)) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && dd.classList.contains('is-open')) { close(); btn.focus(); } });
  });

  /* ---------- Слайдер отзывов ---------- */
  var track = document.querySelector('[data-rev-track]');
  if (track) {
    var prevs = document.querySelectorAll('[data-rev-prev]');
    var nexts = document.querySelectorAll('[data-rev-next]');
    var bar = document.querySelector('[data-rev-bar]');
    var step = function () {
      var card = track.querySelector('.rev-card');
      var gap = parseFloat(getComputedStyle(track).columnGap) || 0;
      return card ? card.getBoundingClientRect().width + gap : track.clientWidth;
    };
    var sync = function () {
      var max = track.scrollWidth - track.clientWidth;
      prevs.forEach(function (b) { b.disabled = track.scrollLeft <= 2; });
      nexts.forEach(function (b) { b.disabled = track.scrollLeft >= max - 2; });
      if (bar) {
        var w = track.clientWidth / track.scrollWidth;
        bar.style.width = (w * 100) + '%';
        bar.style.left = (max > 0 ? (track.scrollLeft / max) * (1 - w) * 100 : 0) + '%';
      }
    };
    prevs.forEach(function (b) { b.addEventListener('click', function () { track.scrollBy({ left: -step(), behavior: 'smooth' }); }); });
    nexts.forEach(function (b) { b.addEventListener('click', function () { track.scrollBy({ left: step(), behavior: 'smooth' }); }); });
    track.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    sync();
  }

  /* ---------- Кнопка «Наверх» ---------- */
  var toTop = document.querySelector('[data-to-top]');
  if (toTop) {
    var onScroll = function () { toTop.classList.toggle('is-visible', window.scrollY > 600); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    toTop.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }


})();
