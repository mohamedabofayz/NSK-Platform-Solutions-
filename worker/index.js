const codePattern = /^NG-[A-Za-z0-9]{8,}$/i;

function jsonResponse(body, status, origin) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type";
    headers["Access-Control-Max-Age"] = "86400";
  }
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    if (!env.ALLOWED_ORIGIN || origin !== env.ALLOWED_ORIGIN) {
      return jsonResponse({ error: "Origin not allowed." }, 403);
    }

    if (request.method === "OPTIONS") return jsonResponse({}, 204, origin);
    if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405, origin);
    if (!env.GITHUB_TOKEN || !env.GITHUB_OWNER || !env.GITHUB_REPO) {
      return jsonResponse({ error: "Service is not configured." }, 503, origin);
    }
    if (!env.RATE_LIMITER) return jsonResponse({ error: "Service is not configured." }, 503, origin);

    const clientIp = request.headers.get("CF-Connecting-IP") || "unknown";
    const { success } = await env.RATE_LIMITER.limit({ key: clientIp });
    if (!success) return jsonResponse({ error: "تم تجاوز عدد المحاولات. يرجى الانتظار قليلاً." }, 429, origin);

    let payload;
    try {
      payload = await request.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON." }, 400, origin);
    }

    if (!payload || typeof payload.code !== "string" || !codePattern.test(payload.code)) {
      return jsonResponse({ error: "Invalid Nusuk code." }, 400, origin);
    }

    const timestamp = new Date().toISOString();
    const githubResponse = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}/issues`,
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "Nusuk-Code-Tracker",
        },
        body: JSON.stringify({
          title: `دعم نسك: ${payload.code}`,
          body: `Code: ${payload.code}\nRecorded at: ${timestamp}`,
        }),
      },
    );

    if (!githubResponse.ok) {
      return jsonResponse({ error: "تعذّر حفظ الدعم حالياً. حاول مجدداً لاحقاً." }, 502, origin);
    }

    return jsonResponse({ ok: true, timestamp }, 201, origin);
  },
};