import test from "node:test";
import assert from "node:assert/strict";
import worker from "./index.js";

const origin = "https://mohamedabofayz.github.io";
const env = {
  ALLOWED_ORIGIN: origin,
  GITHUB_TOKEN: "test-token",
  GITHUB_OWNER: "test-owner",
  GITHUB_REPO: "test-repo",
  RATE_LIMITER: { limit: async () => ({ success: true }) },
};

function makeRequest(body, options = {}) {
  return new Request(`https://worker.example${options.path || "/support"}`, {
    method: options.method || "POST",
    headers: { Origin: options.origin || origin, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test("rejects requests from origins other than the configured Pages site", async () => {
  const response = await worker.fetch(makeRequest({ code: "NG-44kRzeGb" }, { origin: "https://attacker.example" }), env);
  assert.equal(response.status, 403);
});

test("answers browser CORS preflight without a response body", async () => {
  const response = await worker.fetch(makeRequest(undefined, { method: "OPTIONS" }), env);
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);
  assert.match(response.headers.get("Access-Control-Allow-Methods"), /GET/);
  assert.equal(await response.text(), "");
});

test("lists unique Nusuk links from recorded support issues", async (context) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify([
    { title: "دعم نسك: NG-44kRzeGb" },
    { title: "دعم نسك: ng-44KRzeGB" },
    { title: "Unrelated issue" },
  ]), { status: 200 });
  context.after(() => { globalThis.fetch = originalFetch; });

  const response = await worker.fetch(makeRequest(undefined, { method: "GET", path: "/codes" }), env);
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(result.codes, [{
    code: "NG-44kRzeGb",
    url: "https://services.nusuk.sa/app?p=27&id=NG-44kRzeGb",
  }]);
});

test("rejects malformed codes without calling GitHub", async () => {
  const response = await worker.fetch(makeRequest({ code: "not-a-code" }), env);
  assert.equal(response.status, 400);
});

test("rate-limits requests before they reach GitHub", async () => {
  const limitedEnv = { ...env, RATE_LIMITER: { limit: async () => ({ success: false }) } };
  const response = await worker.fetch(makeRequest({ code: "NG-44kRzeGb" }), limitedEnv);
  assert.equal(response.status, 429);
});

test("records only the code and a server-generated timestamp", async (context) => {
  const originalFetch = globalThis.fetch;
  let githubRequest;
  globalThis.fetch = async (url, options) => {
    githubRequest = { url: String(url), options };
    return new Response(JSON.stringify({ html_url: "https://github.com/test-owner/test-repo/issues/1" }), { status: 201 });
  };
  context.after(() => { globalThis.fetch = originalFetch; });

  const response = await worker.fetch(makeRequest({ code: "NG-44kRzeGb", name: "Private Name" }), env);
  const result = await response.json();
  const issue = JSON.parse(githubRequest.options.body);
  assert.equal(response.status, 201);
  assert.equal(result.ok, true);
  assert.match(result.timestamp, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(issue.title, "دعم نسك: NG-44kRzeGb");
  assert.match(issue.body, /Code: NG-44kRzeGb/);
  assert.doesNotMatch(issue.body, /Private Name/);
  assert.match(githubRequest.url, /repos\/test-owner\/test-repo\/issues$/);
});
