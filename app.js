/* ================= CONFIG ================= */
const API_REGISTER =
  document.querySelector('meta[name="api-endpoint"]')?.content ||
  'https://nusuk-code-tracker.mahamedabofayz.workers.dev/support';

const API_CODES = API_REGISTER.replace(/\/support\/?$/, '/codes');

// ⚠️ عدّل رابط صفحتك على فيسبوك
const FACEBOOK_URL = 'https://www.facebook.com/mohamedabofayz';

const STORAGE_KEY = 'nsk-used-codes';
const SWIPE_THRESHOLD = 110;

/* ================= Code extraction ================= */
const CODE_PATTERNS = [
  /\bNSK[-_ ]?([A-Z0-9]{4,20})\b/i,
  /\b([A-Z0-9]{6,20})\b/,
];

function extractCode(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  for (const re of CODE_PATTERNS) {
    const m = t.match(re);
    if (m) return (m[1] || m[0]).toUpperCase();
  }
  return null;
}

/* ================= Local storage ================= */
function getUsed() {
  try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')); }
  catch { return new Set(); }
}
function markUsed(code) {
  const set = getUsed();
  set.add(code);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
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

document.getElementById('year').textContent = new Date().getFullYear();

/* ================= Deck state ================= */
let cards = [];   // array of { el, type, code?, url? }
let topIndex = 0;

/* ================= Build deck ================= */
function buildDeck(codeList) {
  $deck.innerHTML = '';
  cards = [];
  topIndex = 0;

  const used = getUsed();
  const items = [];

  codeList.forEach((c, i) => {
    items.push({ type: 'code', ...c });
    // Insert support card after 2nd code (in the middle)
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

      // Detect already-used
      if (used.has(item.code)) el.dataset.used = 'true';

      // CTA click = open + swipe right
      cta.addEventListener('click', (e) => {
        if (!el.dataset.url) { e.preventDefault(); return; }
        // Let browser open, then mark
        setTimeout(() => {
          if (el.dataset.top === 'true') swipeCard(el, 'right');
        }, 50);
      });

      // pointer drag
      attachDrag(el);

      cards.push({ el, type: 'code', code: item.code, url: item.url });
    } else {
      const el = $tplSupport.content.firstElementChild.cloneNode(true);
      el.querySelector('.support__cta').href = FACEBOOK_URL;
      el.querySelector('.support__cta').addEventListener('click', () => {
        setTimeout(() => {
          if (el.dataset.top === 'true') swipeCard(el, 'right');
        }, 50);
      });
      attachDrag(el);
      cards.push({ el, type: 'support' });
    }

    $deck.appendChild(el);
  });

  renderStack();
}

/* ================= Stack rendering ================= */
function renderStack() {
  const total = cards.length;

  cards.forEach((c, i) => {
    const offset = i - topIndex;
    const el = c.el;

    if (offset < 0) {
      el.style.display = 'none';
      return;
    }
    if (offset > 2) {
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
      const scale = 1 - offset * 0.05;
      const ty = offset * 14;
      el.style.transform = `translateY(${ty}px) scale(${scale})`;
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

/* ================= Drag handlers ================= */
function attachDrag(el) {
  let dragging = false;
  let startX = 0, startY = 0, dx = 0, dy = 0;
  let pid = null;

  const onDown = (e) => {
    if (el.dataset.top !== 'true') return;
    if (e.target.closest('a, button')) return;
    dragging = true;
    pid = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    dx = 0; dy = 0;
    el.dataset.dragging = 'true';
    try { el.setPointerCapture(pid); } catch {}
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

    if (dx > SWIPE_THRESHOLD)      swipeCard(el, 'right');
    else if (dx < -SWIPE_THRESHOLD) swipeCard(el, 'left');
    else {
      // Spring back
      el.style.transform = '';
    }
  };

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
}

/* ================= Swipe out ================= */
function swipeCard(el, direction) {
  if (el.dataset.top !== 'true') return;

  const tx = direction === 'right' ? 800 : -800;
  const rot = direction === 'right' ? 32 : -32;

  el.style.transition = 'transform .35s cubic-bezier(.22,1,.36,1), opacity .3s';
  el.style.transform = `translate(${tx}px, 40px) rotate(${rot}deg)`;
  el.style.opacity = 0;

  const cardData = cards.find(c => c.el === el);
  if (direction === 'right' && cardData?.type === 'code' && cardData.code) {
    markUsed(cardData.code);
  }

  setTimeout(() => {
    topIndex++;
    renderStack();
  }, 320);
}

/* ================= Actions buttons ================= */
$skipBtn.addEventListener('click', () => {
  const top = cards[topIndex];
  if (top) swipeCard(top.el, 'left');
});

$openBtn.addEventListener('click', () => {
  const top = cards[topIndex];
  if (!top) return;

  if (top.type === 'code' && top.url) {
    window.open(top.url, '_blank', 'noopener');
  }
  swipeCard(top.el, 'right');
});

/* ================= Format date ================= */
function formatDate(value) {
  if (!value) return 'الآن';
  try {
    return new Intl.DateTimeFormat('ar', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch { return ''; }
}

/* ================= Load codes ================= */
async function loadCodes() {
  try {
    const res = await fetch(API_CODES, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const list = Array.isArray(data.codes) ? data.codes : [];
    buildDeck(list);
  } catch (err) {
    console.warn('[loadCodes]', err);
    // Demo fallback so the UI is always usable
    buildDeck([
      { code: 'NSK-DEMO-0001', url: 'https://example.com/code/1', createdAt: new Date().toISOString() },
      { code: 'NSK-DEMO-0002', url: 'https://example.com/code/2', createdAt: new Date().toISOString() },
      { code: 'NSK-DEMO-0003', url: 'https://example.com/code/3', createdAt: new Date().toISOString() },
    ]);
  }
}

/* ================= Add-form submit ================= */
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

$input.addEventListener('input', () => {
  $input.removeAttribute('aria-invalid');
});

$form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideMsg();

  const raw = $input.value;
  if (!raw.trim()) {
    $input.setAttribute('aria-invalid', 'true');
    showMsg('error', 'الرجاء لصق الكود أو رسالة التحدي أولًا.');
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
  showMsg('success', 'جارٍ التحقق من الكود…');

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

    // Add the new code to the top of the deck
    const newCard = {
      code,
      url: data.url || '#',
      createdAt: new Date().toISOString(),
    };
    cards.unshift({
      el: null, // will be recreated below
      type: 'code',
      code,
      url: newCard.url,
    });
    // Simplest: rebuild with new code
    const existing = cards
      .filter(c => c.type === 'code' && c.el)
      .map(c => ({
        code: c.code,
        url: c.url,
        createdAt: new Date().toISOString(),
      }));
    buildDeck([newCard, ...existing]);

    $input.value = '';
    showMsg('success', `تم تسجيل دعمك للكود ${code}. شكرًا لك!`);

    // Scroll to deck
    document.querySelector('.swiper')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  } catch (err) {
    console.error('[submit]', err);
    showMsg('error', err.message || 'تعذّر إكمال الطلب. حاول مرة أخرى.');
  } finally {
    setLoading(false);
  }
});

/* ================= Init ================= */
loadCodes();
