# AIRE-Edge Session Steward

A production-quality MVP for **AI Session Intelligence**: a product that monitors whether a long-running technical session is still progressing toward its objective—not merely whether its infrastructure is healthy.

The seeded demo follows an edge-routing experiment from baseline through deployment, healthy infrastructure, missing QoE follow-through, a confidence decline, an evidence-backed intervention, and recovery.

## What the demo shows

- A session contract with an objective, ordered steps, and measurable success criteria
- Replayable event ingestion with realistic timestamps and sources
- Deterministic health states: Progressing, Legitimate wait, Attention needed, Intervention required, and Recovered
- Confidence drift based on meaningful progress and evidence freshness
- A persistent objective-progress strip that separates delivery progress from infrastructure health
- A structured GPT-5.6 assessment with cited signals and stall likelihood
- Detection of missing follow-through after a successful deployment
- A prominent intervention with a 24-minute evidence-gap signal, causal evidence path, and one guarded next action
- Engineer, stakeholder, and retrospective narratives derived from the current state
- A stakeholder decision brief for product, leadership, sales, and commercial audiences
- Responsive product UI and a bespoke share preview

## Run locally

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Open the local URL printed by the development server. The demo starts at the intervention moment. Use the timeline controls to move backward, play forward, or click **Run validation** to watch the session recover.

Production checks:

```bash
npm run build
npm run lint
```

## Architecture

```text
SessionContract + SessionEvent[]
              │
              ▼
     Deterministic engine
  ordering · elapsed time · stale evidence
  missing follow-through · health transitions
              │
              ├── SessionState + confidence history
              │
              ▼
    Intelligence service boundary
    explanations · dual narratives · retrospective
              │
              ▼
       Replayable product UI
```

The deterministic layer owns safety-relevant facts and state transitions. The intelligence boundary explains those facts and changes the narrative for different audiences. This keeps recommendations evidence-backed and makes the demo fully usable without an external API.

### File structure

```text
app/
  layout.tsx                 Metadata and application shell
  page.tsx                   Replay UI and interactive product experience
  globals.css                Responsive visual system
lib/
  session-types.ts           Typed domain model
  demo-session.ts            Seeded session contract and replay events
  session-engine.ts          Deterministic evaluation and confidence logic
  intelligence-service.ts    GPT-ready reasoning service boundary with local output
public/
  og.png                     Product-specific social preview
worker/                      Sites-compatible Cloudflare worker entry
```

## Plugging in real AIRE-Edge events

The UI consumes typed `SessionEvent` objects and has no dependency on the replay source. A future ingestion adapter can normalize WebSocket, SSE, webhook, log, or OpenTelemetry events into that type and append them to the same evaluator. Keep ordering and threshold decisions in `session-engine.ts`; enrich explanations in the intelligence service.

The engine already models the key MVP distinctions:

- **Healthy progress:** an event completes or materially advances a contracted step.
- **Legitimate wait:** non-progress activity remains inside an explicit wait window.
- **Missing follow-through:** successful infrastructure activity is followed by repeated signals that do not advance the next expected step.
- **Repeated failure loop:** represented in `SessionState` and ready for provider-specific retry rules.
- **Objective drift:** represented in `SessionState` and ready for semantic comparison against the contract.

## Where GPT-5.6 fits

`lib/intelligence-service.ts` is the provider boundary for GPT-5.6. In a connected version, the model receives the immutable session contract, deterministic state, and cited evidence IDs. It can then judge whether activity is meaningful, explain confidence changes, draft the intervention, and produce engineer, stakeholder, and retrospective narratives.

GPT-5.6 does **not** decide event order, metric threshold breaches, evidence age, or health-state transitions. Those remain deterministic, testable, and auditable. The checked-in local implementation mirrors the expected response shape so the Build Week demo works offline.

## How Codex helped build this project

Codex was used as an implementation partner to translate the product thesis into a typed domain model, design the replay scenario, implement and verify the state engine, compose the responsive interface, create the social preview, and document the future integration seams. The resulting code keeps product storytelling and engineering architecture aligned around the same evidence.
