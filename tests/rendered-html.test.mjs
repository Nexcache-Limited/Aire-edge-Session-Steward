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
  assert.match(html, /Progressing/i);
  assert.match(html, /Objective progress/i);
  assert.match(html, /GPT-5\.6 assessment/i);
  assert.match(html, /Causal evidence path/i);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("keeps the session engine and intelligence layer separate", async () => {
  const [engine, intelligence, types, page, packageJson] = await Promise.all([
    readFile(new URL("../lib/session-engine.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/intelligence-service.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/session-types.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(engine, /missingFollowThrough/);
  assert.match(engine, /intervention_required/);
  assert.match(intelligence, /generateIntelligence/);
  assert.match(intelligence, /businessStatus/);
  assert.match(intelligence, /recommendedAction/);
  assert.match(types, /interface SessionContract/);
  assert.match(types, /interface Retrospective/);
  assert.match(page, /const demoStops = \[4, 6, 7, 8, 10\]/);
  assert.match(page, /const replayPositions = \[1, \.\.\.demoStops\]/);
  assert.match(page, /useState\(replayPositions\[0\]\)/);
  assert.match(page, /setVisibleCount\(replayPositions\[0\]\)/);
  assert.match(page, /function runValidation\(\)[\s\S]*?setPlaying\(false\);[\s\S]*?setVisibleCount\(8\);/);
  assert.match(page, /if \(nextStop === demoEvents\.length\) setPlaying\(false\);/);
  assert.match(page, /Intervention required/);
  assert.match(page, /24 minutes/);
  assert.match(page, /passed with no new objective evidence/);
  assert.match(page, /Recommendation justified/);
  assert.match(page, /If validation does not begin within 8 minutes/);
  assert.doesNotMatch(page, /Objective evidence · not uptime|None · evidence advancing|CURRENT POSITION/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await access(new URL("../public/og.png", import.meta.url));
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
});

test("keeps the authenticated operator workflow isolated from the competition replay", async () => {
  const [operatorPage, workspace, publicPage] = await Promise.all([
    readFile(new URL("../app/operator/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/operator/workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(operatorPage, /requireChatGPTUser\("\/operator"\)/);
  assert.match(workspace, /New template/);
  assert.match(workspace, /Replace template for this run only/);
  assert.match(workspace, /\/api\/steward\/templates/);
  assert.match(workspace, /Apply contract to session/);
  assert.match(workspace, /Persisted staging data/);
  assert.match(workspace, /attention_needed/);
  assert.match(workspace, /intervention_required/);
  assert.match(workspace, /Recovered/);
  assert.match(workspace, /RECOMMENDED NEXT ACTION/);
  assert.doesNotMatch(publicPage, /OperatorWorkspace|New template/);
});
