const form = document.querySelector("#support-form");
const messageInput = document.querySelector("#message");
const consentInput = document.querySelector("#consent");
const submitButton = document.querySelector("#submit-button");
const formMessage = document.querySelector("#form-message");
const extractStatus = document.querySelector("#extract-status");
const charCount = document.querySelector("#char-count");
const codesList = document.querySelector("#codes-list");
const codesStatus = document.querySelector("#codes-status");
const endpoint = document.querySelector('meta[name="api-endpoint"]')?.content.trim();
const codesEndpoint = endpoint?.replace(/\/support\/?$/, "/codes");
const storageKey = "nusuk-supported-codes-v1";
const codePattern = /\bNG-[A-Za-z0-9]{8,}\b/i;

function extractCode(text) {
  return text.match(codePattern)?.[0] ?? "";
}

function setFormMessage(text, state = "") {
  formMessage.textContent = text;
  formMessage.dataset.state = state;
}

function getSubmittedCodes() {
  const stored = JSON.parse(localStorage.getItem(storageKey) || "[]");
  return Array.isArray(stored) ? stored : [];
}

async function loadCodes() {
  codesList.replaceChildren();
  if (!codesEndpoint || codesEndpoint === endpoint) {
    codesStatus.textContent = "قائمة الأكواد غير مهيأة حالياً.";
    return;
  }

  codesStatus.textContent = "جارٍ تحميل الأكواد...";
  try {
    const response = await fetch(codesEndpoint);
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "تعذّر تحميل الأكواد.");

    const uniqueCodes = new Map();
    for (const entry of result.codes || []) {
      if (typeof entry.code !== "string" || !/^NG-[A-Za-z0-9]{8,}$/i.test(entry.code)) continue;
      if (!uniqueCodes.has(entry.code.toLowerCase())) uniqueCodes.set(entry.code.toLowerCase(), entry.code);
    }

    const items = [...uniqueCodes.values()].map((code) => {
      const item = document.createElement("li");
      const link = document.createElement("a");
      const codeLabel = document.createElement("span");
      const actionLabel = document.createElement("span");
      const url = new URL("https://services.nusuk.sa/app");
      url.searchParams.set("p", "27");
      url.searchParams.set("id", code);
      link.className = "code-link";
      link.href = url.href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      codeLabel.className = "code-value";
      codeLabel.textContent = code;
      actionLabel.className = "code-action";
      actionLabel.textContent = "فتح في نسك ↗";
      link.append(codeLabel, actionLabel);
      item.append(link);
      return item;
    });

    codesList.replaceChildren(...items);
    codesStatus.textContent = items.length
      ? `${new Intl.NumberFormat("ar").format(items.length)} كود متاح`
      : "لا توجد أكواد مسجلة بعد.";
  } catch {
    codesStatus.textContent = "تعذّر تحميل الأكواد. حاول تحديث الصفحة.";
  }
}

function updatePreview() {
  const code = extractCode(messageInput.value);
  extractStatus.textContent = code ? `الكود المستخرج: ${code}` : "سيظهر الكود المستخرج هنا";
  extractStatus.dataset.state = code ? "found" : "";
  charCount.textContent = `${new Intl.NumberFormat("ar").format(messageInput.value.length)} / ٤٠٠٠`;
  if (formMessage.dataset.state === "error") setFormMessage("");
}

messageInput.addEventListener("input", updatePreview);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setFormMessage("");

  const code = extractCode(messageInput.value);
  if (!code) {
    extractStatus.textContent = "لم نعثر على كود صالح بصيغة NG-XXXXXXXX";
    extractStatus.dataset.state = "invalid";
    setFormMessage("تحقق من النص؛ نحتاج كود نسك مثل NG-44kRzeGb.", "error");
    messageInput.focus();
    return;
  }

  if (!consentInput.checked) {
    setFormMessage("يرجى الموافقة على التسجيل العلني قبل المتابعة.", "error");
    consentInput.focus();
    return;
  }

  let submittedCodes;
  try {
    submittedCodes = getSubmittedCodes();
  } catch {
    setFormMessage("تعذّر الوصول إلى التخزين المحلي؛ تحقق من إعدادات المتصفح وحاول مجدداً.", "error");
    return;
  }

  if (submittedCodes.some((savedCode) => savedCode.toLowerCase() === code.toLowerCase())) {
    setFormMessage("تم تسجيل دعمك لهذا الكود مسبقاً، جزاك الله خيراً.", "error");
    return;
  }

  if (!endpoint) {
    setFormMessage("خدمة التسجيل غير مهيأة بعد. يرجى المحاولة لاحقاً.", "error");
    return;
  }

  submitButton.disabled = true;
  submitButton.querySelector("span").textContent = "جارٍ التسجيل...";
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "تعذّر تسجيل الدعم.");

    localStorage.setItem(storageKey, JSON.stringify([...submittedCodes, code]));
    setFormMessage("تم تسجيل دعمك بنجاح، بارك الله فيك!", "success");
    messageInput.value = "";
    consentInput.checked = false;
    updatePreview();
    await loadCodes();
  } catch (error) {
    setFormMessage(error.message || "تعذّر الاتصال بالخدمة. تحقق من اتصالك وحاول مجدداً.", "error");
  } finally {
    submitButton.disabled = false;
    submitButton.querySelector("span").textContent = "تسجيل الدعم";
  }
});

updatePreview();
loadCodes();