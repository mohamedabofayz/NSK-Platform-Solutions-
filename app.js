/* app.js — NSK Platform Solutions
   Handles: extract → validate → submit → render (skeleton/empty/error). */

// ⚙️ CONFIG — adjust to your Cloudflare Worker endpoint
const API = {
  register: "/api/register",   // POST { code, message } → { ok, id, url }
  codes:    "/api/codes",      // GET → { codes: [{ id, code, url, createdAt, name? }] }
};
const STORAGE_KEY = "nsk-used-codes"; // localStorage key for "used" markers

// 🔍 Code extraction — adjust regex to match Nusuk's real code format
const CODE_PATTERNS = [
  /\bNSK[-_ ]?([A-Z0-9]{4,20})\b/i,   // NSK-XXXX or NSK_XXXX
  /\b([A-Z0-9]{6,20})\b/,             // Generic uppercase alphanumeric (6–20)
];

function extractCode(input) {
  const text = String(input || "").trim();
  if (!text) return null;
  for (const re of CODE_PATTERNS) {
    const m = text.match(re);
    if (m) return (m[1] || m[0]).toUpperCase();
  }
  return null;
}

// 🗂️ Local storage helpers
function getUsedCodes() {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"));
  } catch {
    return new Set();
  }
}
function markUsed(code) {
  const set = getUsedCodes();
  set.add(code);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
}

// 🖼️ UI references
const $form    = document.getElementById("entry-form");
const $input   = document.getElementById("challenge-input");
const $btn     = document.getElementById("submit-btn");
const $btnLbl  = $btn.querySelector(".btn__label");
const $spinner = $btn.querySelector(".btn__spinner");
const $pill    = document.getElementById("status-pill");
const $msg     = document.getElementById("form-message");
const $list    = document.getElementById("code-list");
const $count   = document.getElementById("community-count");
const $tplCard = document.getElementById("code-card-template");
const $tplSk   = document.getElementById("skeleton-template");

document.getElementById("year").textContent = new Date().getFullYear();

// 🎛️ State helpers
function setPill(state, text) {
  $pill.dataset.state = state;
  $pill.textContent = text;
}
function showMessage(state, text) {
  $msg.dataset.state = state;
  $msg.textContent = text;
  $msg.hidden = false;
}
function hideMessage() {
  $msg.hidden = true;
  $msg.textContent = "";
}
function setLoading(on) {
  $btn.disabled = on;
  $spinner.hidden = !on;
  $btnLbl.textContent = on ? "جارٍ التسجيل…" : "تسجيل الدعم";
  $input.disabled = on;
}

// 🧾 Render helpers
function renderSkeletons(count = 3) {
  $list.innerHTML = "";
  $list.setAttribute("aria-busy", "true");
  for (let i = 0; i < count; i++) {
    $list.appendChild($tplSk.content.cloneNode(true));
  }
}

function renderEmpty() {
  $list.innerHTML = "";
  $list.setAttribute("aria-busy", "false");
  const li = document.createElement("li");
  li.className = "empty-state";
  li.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
    <h3>لا توجد أكواد مسجلة بعد</h3>
    <p>كن أول من يسجّل دعمه — الصق كودك في الأعلى وسيظهر هنا مباشرة.</p>
  `;
  $list.appendChild(li);
}

function renderError(message) {
  $list.innerHTML = "";
  $list.setAttribute("aria-busy", "false");
  const li = document.createElement("li");
  li.className = "empty-state";
  li.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="12"/>
      <line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
    <h3>تعذّر تحميل الأكواد</h3>
    <p>${message}</p>
  `;
  $list.appendChild(li);
}

function renderCodes(codes) {
  const used = getUsedCodes();
  $list.innerHTML = "";
  $list.setAttribute("aria-busy", "false");
  $count.textContent = `${codes.length} كود`;

  if (!codes.length) return renderEmpty();

  for (const item of codes) {
    const node = $tplCard.content.cloneNode(true);
    const li = node.querySelector(".code-card");
    const codeEl = node.querySelector(".code-card__code");
    const dateEl = node.querySelector(".code-card__date");
    const openEl = node.querySelector(".code-card__open");
    const useEl  = node.querySelector(".code-card__use");

    codeEl.textContent = item.code;
    dateEl.textContent = formatDate(item.createdAt);
    openEl.href = item.url || "#";

    if (used.has(item.code)) {
      li.dataset.used = "true";
      useEl.disabled = true;
      useEl.textContent = "مُستخدَم";
      useEl.setAttribute("aria-disabled", "true");
    } else {
      useEl.addEventListener("click", () => {
        markUsed(item.code);
        li.dataset.used = "true";
        useEl.disabled = true;
        useEl.textContent = "مُستخدَم";
      });
    }

    $list.appendChild(node);
  }
}

function formatDate(value) {
  if (!value) return "";
  try {
    const d = new Date(value);
    return new Intl.DateTimeFormat("ar", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
  } catch {
    return "";
  }
}

// 🔄 Fetch registered codes
async function loadCodes() {
  renderSkeletons();
  try {
    const res = await fetch(API.codes, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const codes = Array.isArray(data.codes) ? data.codes : [];
    renderCodes(codes);
  } catch (err) {
    console.error("[loadCodes]", err);
    renderError("تحقق من اتصالك بالإنترنت ثم أعد تحميل الصفحة.");
    $count.textContent = "";
  }
}

// 🚀 Submit handler
$form.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideMessage();

  const raw = $input.value;
  const code = extractCode(raw);

  if (!raw.trim()) {
    $input.setAttribute("aria-invalid", "true");
    showMessage("error", "الرجاء لصق الكود أو رسالة التحدي أولًا.");
    $input.focus();
    return;
  }
  if (!code) {
    $input.setAttribute("aria-invalid", "true");
    showMessage("error", "لم نعثر على كود صالح في النص. تأكد من لصق الرسالة كاملة أو الكود مباشرة.");
    $input.focus();
    return;
  }

  $input.removeAttribute("aria-invalid");
  setLoading(true);
  setPill("loading", "جارٍ التسجيل…");
  showMessage("info", "جارٍ التحقق من الكود وتسجيل الدعم…");

  try {
    const res = await fetch(API.register, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ code, message: raw }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || data.ok === false) {
      throw new Error(data.error || `فشل الطلب (HTTP ${res.status})`);
    }

    // Success
    $input.value = "";
    setPill("success", "تم بنجاح");
    showMessage("success", `تم تسجيل دعمك للكود ${code}. شكرًا لك!`);
    markUsed(code);

    // Optimistically prepend the new card
    const currentCodes = Array.from($list.querySelectorAll(".code-card")).map((el) => ({
      code: el.querySelector(".code-card__code").textContent,
      url: el.querySelector(".code-card__open").href,
      createdAt: new Date().toISOString(),
    }));
    renderCodes([
      { code, url: data.url || "#", createdAt: new Date().toISOString() },
      ...currentCodes,
    ]);
  } catch (err) {
    console.error("[submit]", err);
    setPill("error", "فشل التسجيل");
    showMessage("error", err.message || "تعذّر إكمال الطلب. حاول مرة أخرى بعد قليل.");
  } finally {
    setLoading(false);
    // Reset pill after a moment
    setTimeout(() => {
      if ($pill.dataset.state === "success") setPill("idle", "جاهز");
    }, 3000);
  }
});

// ⌨️ Clear aria-invalid on input
$input.addEventListener("input", () => {
  if ($input.hasAttribute("aria-invalid")) $input.removeAttribute("aria-invalid");
});

// 🏁 Init
loadCodes();
