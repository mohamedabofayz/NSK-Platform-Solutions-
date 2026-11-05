/* ================= CONFIG ================= */
const API_REGISTER =
  document.querySelector('meta[name="api-endpoint"]')?.content ||
  'https://nusuk-code-tracker.mahamedabofayz.workers.dev/support';

const API_CODES = API_REGISTER.replace(/\/support\/?$/, '/codes');

// ⚠️ ضع رابط صفحتك على فيسبوك
const FACEBOOK_URL = 'https://www.facebook.com/p/mohamedabofayz';

const STORAGE_KEY = 'nsk-used-codes';
const SWIPE_THRESHOLD = 110;

/* ================= Debug helper ================= */
const log = (...args) => console.log('[NSK]', ...args);

/* ================= Code extraction ================= */
const CODE_PATTERN = /\bNG-[A-Z0-9]{8,}\b/i;

function extractCode(text) {
  const t = String(text || '').trim();
  return t.match(CODE_PATTERN)?.[0] || null;
}

/* ================= Local storage ================= */
function getUsed() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return new Set(Array.isArray(stored)
      ? stored.filter(code => typeof code === 'string').map(code => code.toLowerCase())
      : []);
  }
  catch { return new Set(); }
}
function markUsed(code) {
  const set = getUsed();
  set.add(code.toLowerCase());
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...set])); }
  catch { log('Could not persist used code'); }
}

/* ================= DOM ================= */
const $deck     = document.getElementById('deck');
const $actions  = document.getElementById('deck-actions');
const $skipBtn  = document.getElementById('skip-btn');
const $openBtn  = document.getElementById('open-btn');
const $form     = document.getElementById('add-form');
const $input    = document.getElementById('code-input');
const $submit   = document.getElementById('submit-btn');
const $btnLbl   = $submit.querySelector('.btn-label');
const $spinner  = $submit.querySelector('.btn-spinner');
const $msg      = document.getElementById('form-message');

const $tplCode    = document.getElementById('tpl-code-card');
const $tplSupport = document.getElementById('tpl-support-card');
const $tplEmpty   = document.getElementById('tpl-empty');
const $tplError   = document.getElementById('tpl-error');

log('DOM ready', { $deck, $tplCode, $tplSupport });

document.getElementById('year').textContent = new Date().getFullYear();

/* ================= Deck state ================= */
let cards = [];
let topIndex = 0;

/* ================= Loading skeleton ================= */
function showSkeleton() {
  $deck.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const s = document.createElement('div');
    s.className = 'card skeleton-card';
    s.style.cssText = `
      background: linear-gradient(90deg, #F4EFE4 0%, #FAF7F0 50%, #F4EFE4 100%);
      background-size: 200% 100%;
      animation: shimmer 1.4s linear infinite;
    `;
    $deck.appendChild(s);
  }
  $actions.hidden = true;
}

/* ================= Build deck ================= */
function buildDeck(codeList) {
  log('buildDeck called with', codeList.length, 'codes');
  $deck.innerHTML = '';
  cards = [];
  topIndex = 0;

  const used = getUsed();
  const items = [];

  const availableCodes = codeList.filter(c => !used.has(c.code.toLowerCase()));
  availableCodes.forEach((c, i) => {
    items.push({ type: 'code', ...c });
    if (i === 1) items.push({ type: 'support' });
  });
  if (!items.some(x => x.type === 'support')) {
    items.push({ type: 'support' });
  }

  items.forEach((item, idx) => {
    if (item.type === 'code') {
      const el = $tplCode.content.firstElementChild.cloneNode(true);
      el.dataset.code = item.code;
      el.dataset.url = item.url || '';
      el.querySelector('.card__code').textContent = item.code;
      el.querySelector('.card__date').textContent = formatDate(item.createdAt);
      el.querySelector('.card__index').textContent = `${idx + 1} / ${items.length}`;
      const cta = el.querySelector('.card__cta');
      cta.href = item.url || '#';

      // CTA click → browser opens the link, we mark + swipe after a beat
      cta.addEventListener('click', (e) => {
        if (!el.dataset.url || el.dataset.url === '#') { e.preventDefault(); return; }
        markUsed(item.code);
        setTimeout(() => {
          if (el.dataset.top === 'true') swipeCard(el, 'right', /* open */ false);
        }, 100);
      });

      attachDrag(el);
      cards.push({ el, type: 'code', code: item.code, url: item.url });
    } else {
      const el = $tplSupport.content.firstElementChild.cloneNode(true);
      el.querySelector('.support__cta').href = FACEBOOK_URL;
      el.querySelector('.support__cta').addEventListener('click', () => {
        setTimeout(() => {
          if (el.dataset.top === 'true') swipeCard(el, 'right', false);
        }, 100);
      });
      attachDrag(el);
      cards.push({ el, type: 'support' });
    }
    $deck.appendChild(el);
  });

  renderStack();
  log('buildDeck finished, cards:', cards.length);
}

/* ================= Render stack ================= */
function renderStack() {
  const total = cards.length;

  cards.forEach((c, i) => {
    const offset = i - topIndex;
    const el = c.el;

    if (offset < 0 || offset > 2) {
      el.style.display = 'none';
      return;
    }
    el.style.display = '';

    if (offset === 0) {
      el.style.zIndex = 100;
      el.style.transform = '';
      el.style.opacity = 1;
      el.dataset.top = 'true';
    } else {
      el.style.zIndex = 100 - offset;
      el.style.transform = `translateY(${offset * 14}px) scale(${1 - offset * 0.05})`;
      el.style.opacity = 1 - offset * 0.12;
      el.dataset.top = 'false';
    }
  });

  const done = topIndex >= total;
  $actions.hidden = done;

  if (done) {
    const empty = $tplEmpty.content.cloneNode(true);
    $deck.appendChild(empty);
  }
}

/* ================= Drag ================= */
function attachDrag(el) {
  let dragging = false;
  let startX = 0, startY = 0, dx = 0, dy = 0;

  const onDown = (e) => {
    if (el.dataset.top !== 'true') return;
    if (e.target.closest('a, button')) return;
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    dx = 0; dy = 0;
    el.dataset.dragging = 'true';
    try { el.setPointerCapture(e.pointerId); } catch {}
  };

  const onMove = (e) => {
    if (!dragging) return;
    dx = e.clientX - startX;
    dy = e.clientY - startY;
    const rot = dx * 0.06;
    el.style.transform = `translate(${dx}px, ${dy}px) rotate(${rot}deg)`;
    if (dx > 30) el.dataset.swipe = 'right';
    else if (dx < -30) el.dataset.swipe = 'left';
    else delete el.dataset.swipe;
  };

  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    el.dataset.dragging = 'false';
    delete el.dataset.swipe;

    if (dx > SWIPE_THRESHOLD)        swipeCard(el, 'right');
    else if (dx < -SWIPE_THRESHOLD)  swipeCard(el, 'left');
    else el.style.transform = '';
  };

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
}

/* ================= Swipe ================= */
function swipeCard(el, direction, shouldOpen = true) {
  if (el.dataset.top !== 'true') return;
  const data = cards.find(c => c.el === el);
  if (!data) return;

  // Open URL only once, directly in gesture chain (avoids popup blocker)
  if (direction === 'right' && shouldOpen && data.type === 'code'
      && data.url && data.url !== '#') {
    window.open(data.url, '_blank', 'noopener');
  }

  if (direction === 'right' && data.type === 'code' && data.code) {
    markUsed(data.code);
  }

  const tx = direction === 'right' ? 800 : -800;
  const rot = direction === 'right' ? 32 : -32;

  el.style.transition = 'transform .35s cubic-bezier(.22,1,.36,1), opacity .3s';
  el.style.transform = `translate(${tx}px, 40px) rotate(${rot}deg)`;
  el.style.opacity = 0;

  setTimeout(() => {
    topIndex++;
    renderStack();
  }, 320);
}

/* ================= Buttons ================= */
$skipBtn.addEventListener('click', () => {
  const top = cards[topIndex];
  if (top) swipeCard(top.el, 'left');
});

$openBtn.addEventListener('click', () => {
  const top = cards[topIndex];
  if (top) swipeCard(top.el, 'right');
});

/* ================= Date format ================= */
function formatDate(value) {
  if (!value) return 'الآن';
  try {
    return new Intl.DateTimeFormat('ar', {
      dateStyle: 'medium', timeStyle: 'short',
    }).format(new Date(value));
  } catch { return ''; }
}

/* ================= Load ================= */
function showLoadError(message) {
  console.warn('[loadCodes] failed:', message);
  $deck.replaceChildren($tplError.content.cloneNode(true));
  $deck.querySelector('.deck-error p').textContent = message;
  $deck.querySelector('.btn-retry').addEventListener('click', loadCodes);
  $actions.hidden = true;
}

async function loadCodes() {
  showSkeleton();
  log('Loading codes from', API_CODES);
  let res;
  try {
    res = await fetch(API_CODES, { headers: { Accept: 'application/json' } });
  } catch (err) {
    showLoadError('تعذر الاتصال بخدمة الأكواد. تحقق من الشبكة ثم أعد المحاولة.');
    return;
  }

  log('Response', res.status);
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    showLoadError(data?.error || `خدمة الأكواد غير متاحة الآن (${res.status}).`);
    return;
  }
  if (!Array.isArray(data?.codes)) {
    showLoadError('وصل رد غير متوقع من خدمة الأكواد. أعد المحاولة بعد قليل.');
    return;
  }

  try {
    buildDeck(data.codes);
  } catch (err) {
    console.error('[loadCodes] render failed:', err);
    showLoadError('تعذر تجهيز بطاقات الأكواد. أعد المحاولة بعد قليل.');
  }
}

/* ================= Form ================= */
function showMsg(state, text) {
  $msg.dataset.state = state;
  $msg.textContent = text;
  $msg.hidden = false;
}
function hideMsg() { $msg.hidden = true; $msg.textContent = ''; }

function setLoading(on) {
  $submit.disabled = on;
  $spinner.hidden = !on;
  $btnLbl.textContent = on ? 'جارٍ التسجيل…' : 'تسجيل الدعم';
  $input.disabled = on;
}

$input.addEventListener('input', () => $input.removeAttribute('aria-invalid'));

$form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideMsg();

  const raw = $input.value;
  if (!raw.trim()) {
    $input.setAttribute('aria-invalid', 'true');
    showMsg('error', 'الرجاء لصق الكود أولًا.');
    $input.focus();
    return;
  }
  const code = extractCode(raw);
  if (!code) {
    $input.setAttribute('aria-invalid', 'true');
    showMsg('error', 'لم نعثر على كود صالح. الصق الرسالة كاملة أو الكود مباشرة.');
    $input.focus();
    return;
  }

  setLoading(true);
  showMsg('success', 'جارٍ التحقق…');

  try {
    const res = await fetch(API_REGISTER, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ code, message: raw }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || `فشل الطلب (${res.status})`);
    }

    $input.value = '';
    showMsg('success', `تم تسجيل دعمك للكود ${code}. شكرًا لك!`);

    // Prepend new card
    const existing = cards
      .filter(c => c.type === 'code' && c.el)
      .map(c => ({ code: c.code, url: c.url, createdAt: new Date().toISOString() }));
    buildDeck([{ code, url: data.url || '#', createdAt: new Date().toISOString() }, ...existing]);

    document.querySelector('.swiper')?.scrollIntoView({ behavior: 'smooth' });

  } catch (err) {
    console.error('[submit]', err);
    showMsg('error', err.message || 'تعذّر إكمال الطلب.');
  } finally {
    setLoading(false);
  }
});

/* ================= Init ================= */
loadCodes();
