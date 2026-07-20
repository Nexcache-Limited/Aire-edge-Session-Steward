import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Session Steward product", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /AIRE.Edge Session Steward/i);
  assert.match(html, /The system is healthy\. The session is not\./i);
  assert.match(html, /QoE validation/i);
  assert.match(html, /Intervention required/i);
  assert.match(html, /Objective progress/i);
  assert.match(html, /GPT-5\.6 assessment/i);
  assert.match(html, /Causal evidence path/i);
  assert.match(html, /24 minutes.*no new objective evidence/i);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("keeps the session engine and intelligence layer separate", async () => {
  const [engine, intelligence, types, packageJson] = await Promise.all([
    readFile(new URL("../lib/session-engine.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/intelligence-service.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/session-types.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(engine, /missingFollowThrough/);
  assert.match(engine, /intervention_required/);
  assert.match(intelligence, /generateIntelligence/);
  assert.match(intelligence, /businessStatus/);
  assert.match(intelligence, /recommendedAction/);
  assert.match(types, /interface SessionContract/);
  assert.match(types, /interface Retrospective/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await access(new URL("../public/og.png", import.meta.url));
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
});
