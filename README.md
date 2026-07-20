# AIRE-Edge Session Steward

[Live Demo](https://steward.nexcache.com/) · [Source Code](https://github.com/Nexcache-Limited/Aire-edge-Session-Steward)

**AIRE-Edge Session Steward** is an objective-aware intelligence layer for long-running technical work.

It detects when activity stops advancing a session objective, explains the evidence behind that judgement, and recommends the next action most likely to restore confidence.

> **The system is healthy. The session is not.**

---

## Why it matters

Traditional observability tools answer:

> What is happening in the system?

Session Steward answers:

> Is this work still accomplishing its objective, and what should happen next?

In AI, edge-computing, research, deployment, and validation workflows, infrastructure can remain healthy while the actual work quietly stalls.

A deployment may complete successfully, but the required validation never runs. Teams may continue polling healthy systems without producing new evidence. Failures may repeat without a changed hypothesis. Activity continues, but the objective no longer advances.

Session Steward is designed to detect that gap.

---

## Demo scenario

The seeded Build Week demo follows an edge-routing experiment with the objective:

> Validate whether a new edge-routing policy improves video QoE under constrained bandwidth without increasing packet loss.

The session contract defines six required steps:

1. Run a baseline QoE test.
2. Deploy the new routing configuration.
3. Complete infrastructure health checks.
4. Rerun the QoE validation suite.
5. Compare the result against the baseline.
6. Produce a promotion recommendation.

The replay initially progresses normally:

- The baseline test completes.
- The routing policy changes.
- Deployment succeeds across 12 edge nodes.
- Health checks pass.

The infrastructure remains healthy, but the expected QoE validation does not begin.

Instead, the system continues polling deployment status without producing new objective evidence.

Session Steward detects:

- Missing follow-through
- Aging evidence
- Repeated activity that does not advance the objective
- Declining confidence in the session outcome

It then raises an intervention:

> **The system is healthy. The session is not.**

The steward recommends one guarded action:

> Run the low-bandwidth QoE validation suite, compare the results against the baseline, and halt promotion if packet loss exceeds 1.2%.

When validation resumes, the session recovers. Fresh evidence shows:

- QoE improved from 71.4 to 79.2.
- QoE increased by 10.9%.
- Packet loss remained at 0.9%.
- All three bandwidth tiers passed.

The stakeholder brief then recommends a controlled promotion to a 25% cohort.

---

## What the product demonstrates

- A session contract with an objective, ordered steps, and measurable success criteria
- Replayable technical events with realistic timestamps and sources
- Objective progress separated from infrastructure uptime
- Deterministic session states: Progressing, Legitimate wait, Attention needed, Intervention required, and Recovered
- Confidence drift based on progress and evidence freshness
- Detection of missing follow-through after a successful deployment
- A visible 24-minute gap with no new objective evidence
- A structured session assessment grounded in cited signals
- A causal evidence path explaining how the judgement was reached
- One evidence-backed intervention rather than a list of generic suggestions
- Engineer, stakeholder, and retrospective narratives
- A stakeholder decision brief for product, leadership, sales, and commercial teams
- A replayable recovery path from stalled work to a justified decision

---

## Run locally

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Open the local URL printed by the development server.

The demo starts at the baseline at `00:00`. Press **Play** to move through Progressing, Attention needed, Intervention required, Recovered, and Recommendation justified. You can also use the timeline controls or click **Run validation** during the intervention.

For production checks, run:

```bash
npm run build
npm run lint
```

The hosted Vercel project uses the Next.js preset with `next build`. The repository's default `npm run build` command retains the Vinext/Cloudflare build path.

---

## Product model

Session Steward is built around five concepts.

### 1. Session objective

Every session begins with a declared goal.

For the demo:

> Improve video QoE under constrained bandwidth without increasing packet loss.

### 2. Session contract

The contract defines:

- The expected sequence of work
- The evidence required at each step
- The measurable success criteria
- The conditions under which the session can be considered complete

### 3. Objective evidence

The system tracks evidence that advances the objective, not merely infrastructure activity.

A health check can prove that a deployment is operational, but it does not prove that the new routing policy improved QoE.

### 4. Session judgement

The steward evaluates whether the work is:

- Advancing
- Legitimately waiting
- Losing momentum
- Stalled
- Recovering

### 5. Evidence-backed intervention

When progress stops, the product explains:

- What is missing
- Why it matters
- Which events support the judgement
- How confidence changed
- What action should happen next

---

## Confidence drift

Confidence is a transparent session-readiness indicator.

It is derived from:

- Contract completion
- Evidence freshness
- Expected-step timing
- Repeated non-progress activity
- Unresolved failures
- Current success-criteria evidence

It is not presented as a statistical probability that the project will succeed.

Instead, it communicates how strongly the current evidence supports the session's present conclusion.

Confidence falls when:

- Validation is missing
- Evidence becomes stale
- Retries occur without changed inputs
- Repeated polling produces no decision-grade evidence
- Conclusions depend on measurements captured before a meaningful change

Confidence recovers when fresh evidence advances the contract.

---

## Architecture

```text
Session Contract + Session Events
                 │
                 ▼
       Deterministic Session Engine
       ────────────────────────────
       Event ordering
       Expected-step progression
       Elapsed-time windows
       Evidence freshness
       Missing follow-through
       Repeated non-progress activity
       Contract-completion tracking
       Session-state transitions
                 │
                 ▼
       Structured Session State
       ────────────────────────
       Current contract position
       Objective progress
       Confidence history
       Evidence IDs
       Candidate intervention state
                 │
                 ▼
       Intelligence Service Boundary
       ─────────────────────────────
       Session interpretation
       Evidence-linked explanation
       Recommended next action
       Engineer narrative
       Stakeholder narrative
       Retrospective
                 │
                 ▼
          Replayable Product UI
```

The deterministic layer owns safety-relevant facts and state transitions.

The intelligence boundary interprets those facts, explains the current judgement for different audiences, and recommends next actions without taking control of event ordering or threshold evaluation.

This keeps the system evidence-backed, testable, and usable even when no external model provider is connected.

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

worker/
  index.ts                   Sites-compatible Cloudflare worker entry
```

---

## Plugging in real AIRE-Edge events

This Build Week MVP runs entirely on a seeded replay. No live AIRE-Edge production data is required to run or judge the demo.

The UI consumes typed `SessionEvent` objects and has no dependency on the replay source.

A future ingestion adapter can normalize WebSocket, SSE, webhook, log, or OpenTelemetry events into that type and append them to the same evaluator.

Keep ordering and threshold decisions in `session-engine.ts`. Enrich explanations, narratives, and recommendations in the intelligence service.

The engine already models the key MVP distinctions:

- **Healthy progress:** an event completes or materially advances a contracted step
- **Legitimate wait:** non-progress activity remains inside an explicit wait window
- **Missing follow-through:** successful infrastructure activity is followed by repeated signals that do not advance the next expected step
- **Repeated failure loop:** represented in `SessionState` and ready for provider-specific retry rules
- **Objective drift:** represented in `SessionState` and ready for semantic comparison against the contract

---

## Where GPT-5.6 fits

`lib/intelligence-service.ts` is the provider boundary for GPT-5.6.

In a connected version, the model receives:

- The immutable session contract
- Deterministic session state
- Confidence history
- Evidence IDs
- Current contract position
- Intervention eligibility

It can then:

- Judge whether recent activity is meaningful
- Explain why confidence changed
- Draft the intervention
- Summarize the state for engineers
- Translate the state for stakeholders
- Produce a retrospective of what happened and why it mattered

GPT-5.6 does **not** decide:

- Event order
- Metric threshold breaches
- Evidence age
- Step completion
- Session-state transitions

Those remain deterministic, testable, and auditable.

The checked-in local implementation mirrors the expected response shape so the Build Week demo works offline.

---

## How Codex helped build this project

Codex was used as an implementation partner to translate the product thesis into a typed domain model, design the replay scenario, implement and verify the session engine, compose the responsive interface, create the product copy structure, and document the future integration seams.

The result is a codebase where product narrative, deterministic logic, and intelligence boundaries all align around the same evidence.

---

## Submission framing

AIRE-Edge Session Steward is not an observability dashboard and not an AI summarizer for DevOps logs.

It is a product for **objective-aware session intelligence**.

Its purpose is to detect when technically healthy activity has stopped producing meaningful progress toward a declared outcome, explain why that matters, and guide the next evidence-backed action.

That is the central idea behind the demo, the architecture, and the intervention moment:

> **The system is healthy. The session is not.**
