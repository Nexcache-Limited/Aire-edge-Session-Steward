"use client";

import { useEffect, useMemo, useState } from "react";
import { demoContract, demoEvents } from "../lib/demo-session";
import { generateIntelligence } from "../lib/intelligence-service";
import { evaluateSession } from "../lib/session-engine";
import type { SessionEvent, SessionHealth } from "../lib/session-types";

const healthCopy: Record<SessionHealth, { label: string; eyebrow: string }> = {
  progressing: { label: "Progressing", eyebrow: "Objective on track" },
  legitimate_wait: { label: "Waiting as expected", eyebrow: "Within the planned window" },
  attention_needed: { label: "Attention needed", eyebrow: "Evidence is overdue" },
  intervention_required: { label: "Intervention required", eyebrow: "Objective progress has stopped" },
  recovered: { label: "Recovered", eyebrow: "Fresh evidence is arriving" },
};

const demoStops = [4, 6, 7, 8, 10];
const demoBeatLabels = ["Progressing", "Attention needed", "Intervention", "Recovered", "Recommendation"];

const eventMarks: Record<SessionEvent["kind"], string> = {
  milestone: "✓",
  change: "↗",
  check: "◆",
  poll: "↻",
  clock: "!",
  validation: "△",
  analysis: "◎",
};

const chartAnnotations: Record<string, string> = {
  "evt-01": "BASELINE",
  "evt-04": "HEALTHY",
  "evt-07": "24M GAP",
  "evt-08": "VALIDATION",
  "evt-09": "PASSED",
};

function ConfidenceChart({ points }: { points: ReturnType<typeof evaluateSession>["confidenceHistory"] }) {
  return (
    <div className="confidence-chart" aria-label="Confidence drift over the session">
      <div className="chart-rule rule-high"><span>90</span></div>
      <div className="chart-rule rule-mid"><span>60</span></div>
      <div className="chart-rule rule-low"><span>30</span></div>
      <div className="chart-bars">
        {points.map((point, index) => {
          const previous = points[index - 1];
          const delta = previous ? point.score - previous.score : 0;
          return (
            <div className={`chart-column ${["evt-05", "evt-06", "evt-07"].includes(point.eventId) ? "decline" : ""} ${["evt-08", "evt-09", "evt-10"].includes(point.eventId) ? "recovery" : ""}`} key={point.eventId} title={`${point.timestamp} · ${point.score}% · ${point.reason}`}>
              {chartAnnotations[point.eventId] && <span className="chart-annotation">{chartAnnotations[point.eventId]}</span>}
              <span className={`chart-delta ${delta < 0 ? "down" : delta > 0 ? "up" : ""}`}>
                {delta === 0 ? "" : `${delta > 0 ? "+" : ""}${delta}`}
              </span>
              <span className="chart-bar" style={{ height: `${Math.max(point.score, 8)}%` }} />
              <span className="chart-tick">{index + 1}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AssessmentPanel({ events, state }: { events: SessionEvent[]; state: ReturnType<typeof evaluateSession> }) {
  const ids = new Set(events.map((event) => event.id));
  const validationResumed = ids.has("evt-08");
  const evidenceOverdue = state.health === "attention_needed" || state.health === "intervention_required";
  const stalledLikelihood = state.health === "intervention_required" ? 91 : state.health === "attention_needed" ? 74 : state.health === "legitimate_wait" ? 28 : state.health === "recovered" ? 7 : 12;
  const signals = [
    { label: "Deployment succeeded", tone: ids.has("evt-03") ? "positive" : "pending" },
    { label: "Health checks passed", tone: ids.has("evt-04") ? "positive" : "pending" },
    { label: validationResumed ? "QoE validation resumed" : evidenceOverdue ? "QoE validation overdue" : "QoE validation is next", tone: validationResumed ? "positive" : evidenceOverdue ? "negative" : "pending" },
    { label: state.staleEvidence ? "Objective evidence stale" : validationResumed ? "Objective evidence refreshed" : "Evidence freshness monitored", tone: state.staleEvidence ? "negative" : validationResumed ? "positive" : "pending" },
    { label: "Repeated polling without objective evidence", tone: ids.has("evt-06") && !validationResumed ? "negative" : ids.has("evt-06") ? "resolved" : "pending" },
  ];

  return (
    <section className={`assessment-card ${state.health}`} aria-label="GPT-5.6 assessment">
      <div className="assessment-heading">
        <div><p className="section-label">GPT-5.6 ASSESSMENT</p><span>AI JUDGEMENT · BASED ON SESSION EVIDENCE</span></div>
        <span className="model-badge">5.6</span>
      </div>
      <div className="assessment-signals">
        {signals.map((signal) => <div className={signal.tone} key={signal.label}><span>{signal.tone === "positive" || signal.tone === "resolved" ? "✓" : signal.tone === "negative" ? "×" : "·"}</span><strong>{signal.label}</strong></div>)}
      </div>
      <div className="stall-score"><span>ESTIMATED LIKELIHOOD OF A STALL</span><strong>{stalledLikelihood}%</strong></div>
    </section>
  );
}

export default function Home() {
  const [visibleCount, setVisibleCount] = useState(7);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [activeTab, setActiveTab] = useState<"engineer" | "stakeholder" | "retrospective">("engineer");
  const [selectedEvidence, setSelectedEvidence] = useState("evt-07");
  const visibleEvents = useMemo(() => demoEvents.slice(0, visibleCount), [visibleCount]);
  const state = useMemo(() => evaluateSession(demoContract, visibleEvents), [visibleEvents]);
  const intelligence = useMemo(() => generateIntelligence(state), [state]);
  const objectiveProgress = Math.round((state.completedSteps.length / demoContract.expectedSteps.length) * 100);
  const recommendationReady = objectiveProgress === 100;
  const status = recommendationReady ? { label: "Recommendation justified", eyebrow: "All success criteria met" } : healthCopy[state.health];
  const currentElapsed = visibleEvents.at(-1)?.elapsedMinutes ?? 0;
  const lastMeaningful = [...visibleEvents].reverse().find((event) => event.meaningfulProgress);
  const minutesSinceAdvance = Math.max(0, currentElapsed - (lastMeaningful?.elapsedMinutes ?? 0));
  const expectedNext = recommendationReady ? "Approve the 25% traffic rollout" : demoContract.expectedSteps[state.nextStepIndex];
  const currentPosition = recommendationReady
    ? "Evidence complete · promotion supported"
    : state.health === "intervention_required"
      ? "Blocked · validation has not started"
      : state.health === "attention_needed"
        ? "At risk · validation evidence is overdue"
        : state.health === "recovered"
          ? "Back on track · validation is running"
          : state.health === "legitimate_wait"
            ? "On track · waiting within the planned window"
            : `On track · advancing toward ${expectedNext.toLowerCase()}`;
  const currentDemoStop = Math.max(0, demoStops.findIndex((stop) => stop >= visibleCount));

  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => {
      const nextStop = demoStops.find((stop) => stop > visibleCount);
      if (!nextStop) {
        setPlaying(false);
        return;
      }
      setVisibleCount(nextStop);
    }, 1900 / speed);
    return () => window.clearTimeout(timer);
  }, [playing, speed, visibleCount]);

  function toggleReplay() {
    if (visibleCount >= demoEvents.length) setVisibleCount(demoStops[0]);
    setPlaying((current) => !current);
  }

  function stepReplay(direction: -1 | 1) {
    setPlaying(false);
    if (direction === 1) {
      setVisibleCount(demoStops.find((stop) => stop > visibleCount) ?? demoStops.at(-1) ?? visibleCount);
      return;
    }
    setVisibleCount([...demoStops].reverse().find((stop) => stop < visibleCount) ?? demoStops[0]);
  }

  function inspectEvidence(eventId: string) {
    setSelectedEvidence(eventId);
    document.getElementById(eventId)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const visibleIds = new Set(visibleEvents.map((event) => event.id));
  const validationResumed = visibleIds.has("evt-08");
  const validationMissing = state.health === "attention_needed" || state.health === "intervention_required";
  const evidencePath = [
    { id: "evt-02", label: "Routing changed", detail: "edge-route-v18", state: visibleIds.has("evt-02") ? "done" : "pending" },
    { id: "evt-03", label: "Deployment completed", detail: "12/12 nodes", state: visibleIds.has("evt-03") ? "done" : "pending" },
    { id: "evt-04", label: "Health checks passed", detail: "24/24 probes", state: visibleIds.has("evt-04") ? "done" : "pending" },
    { id: validationResumed ? "evt-08" : visibleIds.has("evt-07") ? "evt-07" : "evt-06", label: validationResumed ? "Validation resumed" : validationMissing ? "Validation did not start" : "Validation is next", detail: validationResumed ? "qoe-884 is running" : state.health === "attention_needed" ? "Handoff at risk · 16m overdue" : visibleIds.has("evt-07") ? "Broken handoff · 24m overdue" : "Awaiting the planned handoff", state: validationResumed ? "recovered" : state.health === "attention_needed" ? "warning" : visibleIds.has("evt-07") ? "blocked" : "pending" },
    { id: validationResumed ? "evt-09" : visibleIds.has("evt-07") ? "evt-07" : "evt-06", label: validationResumed ? "Evidence is current" : "Evidence is stale", detail: validationResumed ? "QoE +10.9%" : state.staleEvidence ? "No new outcome evidence" : "Freshness monitored", state: validationResumed ? "recovered" : state.health === "attention_needed" ? "warning" : state.staleEvidence ? "blocked" : "pending" },
    { id: validationResumed ? "evt-10" : "evt-07", label: recommendationReady ? "Promotion justified" : validationResumed ? "Session recovered" : "Intervention triggered", detail: recommendationReady ? "25% cohort recommended" : validationResumed ? "Objective progress restored" : state.intervention ? "Action required" : "Not triggered", state: recommendationReady || validationResumed ? "recovered" : state.intervention ? "blocked" : "pending" },
  ];

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true"><span /><span /><span /></div>
          <div>
            <p className="product-kicker">AIRE–EDGE</p>
            <h1>Session Steward</h1>
          </div>
        </div>
        <div className="header-center">
          <span className="live-dot" />
          REPLAY · 00:{String(visibleEvents.at(-1)?.elapsedMinutes ?? 0).padStart(2, "0")}:00
        </div>
        <div className="session-select">
          <div><span>ACTIVE SESSION</span><strong>EDGE-QOE-042</strong></div>
          <span className="chevron">⌄</span>
        </div>
      </header>

      <section className="session-ribbon">
        <div>
          <p className="section-label">SESSION OBJECTIVE</p>
          <p className="ribbon-objective">{demoContract.objective}</p>
        </div>
        <div className="ribbon-meta">
          <span>M. CHEN · {currentElapsed}M · LHR-EDGE</span>
        </div>
      </section>

      <section className={`objective-strip ${state.health}`} aria-label="Objective progress summary">
        <div className="objective-meter">
          <div><p className="section-label">OBJECTIVE PROGRESS</p><strong>{objectiveProgress}<span>%</span></strong></div>
          <div className="objective-track"><span style={{ width: `${objectiveProgress}%` }} /></div>
        </div>
        <div className="objective-stat"><span>LAST OBJECTIVE PROGRESS</span><strong>{minutesSinceAdvance === 0 ? "Just now" : `${minutesSinceAdvance} minutes ago`}</strong><small>Measured by new outcome evidence</small></div>
        <div className="objective-stat blocker"><span>SESSION POSITION</span><strong>{currentPosition}</strong><small>Infrastructure health: stable</small></div>
        <div className="objective-next"><span>NEXT REQUIRED STEP</span><strong>{expectedNext}</strong><i>→</i></div>
      </section>

      <div className="workspace-grid">
        <aside className="contract-panel panel">
          <div className="panel-heading">
            <div><p className="section-label">01 · CONTRACT</p><h2>Definition of done</h2></div>
            <span className="contract-id">V.03</span>
          </div>

          <div className="steps-list">
            {demoContract.expectedSteps.map((step, index) => {
              const complete = state.completedSteps.includes(index);
              const current = index === state.nextStepIndex && !complete;
              return (
                <div className={`contract-step ${complete ? "complete" : ""} ${current ? "current" : ""}`} key={step}>
                  <span className="step-index">{complete ? "✓" : String(index + 1).padStart(2, "0")}</span>
                  <div><strong>{step}</strong><small>{complete ? "Evidence captured" : current ? "Expected next" : "Pending"}</small></div>
                </div>
              );
            })}
          </div>

          <div className="criteria-block">
            <p className="section-label">SUCCESS CRITERIA</p>
            {demoContract.successCriteria.map((criterion) => (
              <div className="criterion" key={criterion.id}>
                <span>{criterion.label}</span><strong>{criterion.threshold}</strong>
              </div>
            ))}
          </div>

          <div className="engine-note">
            <span className="engine-pulse" />
            <div><strong>Session engine active</strong><small>Order · elapsed time · evidence freshness</small></div>
          </div>
        </aside>

        <section className="timeline-panel panel">
          <div className="panel-heading timeline-heading">
            <div><p className="section-label">02 · SESSION REPLAY</p><h2>Objective timeline</h2><span className="demo-beat">BEAT {currentDemoStop + 1} OF 5 · {demoBeatLabels[currentDemoStop]}</span></div>
            <div className="replay-controls">
              <button className="icon-button" onClick={() => stepReplay(-1)} aria-label="Previous demo beat">‹</button>
              <button className="play-button" onClick={toggleReplay}>{playing ? "PAUSE" : visibleCount === demoEvents.length ? "REPLAY" : "PLAY"}</button>
              <button className="icon-button" onClick={() => stepReplay(1)} aria-label="Next demo beat">›</button>
              <button className="speed-button" onClick={() => setSpeed((value) => value === 2 ? 1 : 2)}>{speed}×</button>
            </div>
          </div>

          <div className="timeline-list" aria-live="polite">
            {visibleEvents.map((event, index) => {
              const isRisk = event.id === "evt-07";
              const isSelected = selectedEvidence === event.id;
              return (
                <article
                  className={`timeline-event ${event.kind} ${isRisk ? "risk-event" : ""} ${isSelected ? "selected" : ""}`}
                  id={event.id}
                  key={event.id}
                  onClick={() => setSelectedEvidence(event.id)}
                >
                  <div className="event-time"><strong>{event.timestamp}</strong><span>+{event.elapsedMinutes}m</span></div>
                  <div className="timeline-track"><span className="event-mark">{eventMarks[event.kind]}</span>{index < visibleEvents.length - 1 && <i />}</div>
                  <div className="event-copy">
                    <div className="event-title-line"><h3>{event.title}</h3><span>{event.source}</span></div>
                    <p>{event.detail}</p>
                    {event.evidence && <div className="evidence-tags">{event.evidence.map((item) => <span key={item}>{item}</span>)}</div>}
                    {isRisk && state.health === "intervention_required" && <span className="risk-flag">INTERVENTION TRIGGERED</span>}
                  </div>
                </article>
              );
            })}
          </div>

          <div className="replay-progress">
            <span style={{ width: `${(visibleCount / demoEvents.length) * 100}%` }} />
          </div>
        </section>

        <aside className="insight-panel panel">
          <div className="state-header">
            <div><p className="section-label">03 · SESSION JUDGEMENT</p><span className="state-eyebrow">{status.eyebrow}</span></div>
            <span className={`state-orb ${state.health}`} />
          </div>
          <h2 className={`state-title ${state.health} ${recommendationReady ? "recommendation-ready" : ""}`}>{status.label}</h2>

          <div className="confidence-header">
            <div><p className="section-label">DELIVERY CONFIDENCE</p><strong>{state.confidence}<span>%</span></strong></div>
            <p>{state.confidenceHistory.at(-1)?.reason}</p>
          </div>
          <ConfidenceChart points={state.confidenceHistory} />

          <AssessmentPanel events={visibleEvents} state={state} />

          {recommendationReady ? (
            <div className="final-recommendation-card">
              <div className="final-recommendation-label"><span>✓</span> FINAL RECOMMENDATION</div>
              <h3>Promote edge-route-v18 to 25% of traffic.</h3>
              <p>The session now has current, decision-grade evidence. Every success criterion is met.</p>
              <div className="recommendation-proof">
                <div><span>VALIDATION</span><strong>Passed</strong><small>3 bandwidth tiers</small></div>
                <div><span>QoE</span><strong>+10.9%</strong><small>71.4 → 79.2</small></div>
                <div><span>PACKET LOSS</span><strong>0.9%</strong><small>Below 1.2% guardrail</small></div>
              </div>
              <div className="promotion-decision"><span>DECISION</span><strong>Promotion is justified. Retain the 1.2% packet-loss stop condition.</strong></div>
            </div>
          ) : state.intervention ? (
            <div className="intervention-card">
              <div className="intervention-label"><span>!</span> STEWARD INTERVENTION</div>
              <h3>{state.intervention.title}</h3>
              <div className="gap-alert"><strong>24 minutes</strong><span>passed with no new objective evidence</span></div>
              <div className="intervention-diagnosis">
                <div><span>DIAGNOSIS</span><p>{state.intervention.explanation}</p></div>
                <div><span>WHY CONFIDENCE IS DECLINING</span><p>Two deployment polls repeated infrastructure health without producing decision-grade QoE evidence.</p></div>
              </div>
              <div className="recommended-action">
                <span className="section-label">RECOMMENDED ACTION</span>
                <strong>{state.intervention.recommendedAction}</strong>
              </div>
              <div className="intervention-actions"><button onClick={() => { setVisibleCount(8); setPlaying(true); }}>RUN VALIDATION NOW →</button><button className="ghost-button" onClick={() => inspectEvidence("evt-07")}>VIEW EVIDENCE</button></div>
            </div>
          ) : (
            <div className={`reasoning-card ${state.health}`}>
              <p className="section-label">{state.health === "attention_needed" ? "WHY ATTENTION IS NEEDED" : "WHY CONFIDENCE CHANGED"}</p>
              <h3>{intelligence.reasoning}</h3>
              {state.health === "attention_needed" && <div className="attention-bridge"><div><span>INFRASTRUCTURE</span><strong>Healthy</strong></div><i>≠</i><div><span>OBJECTIVE PROGRESS</span><strong>Slowing</strong></div><p>Risk is rising. If validation does not begin within 8 minutes, the steward will intervene.</p></div>}
              <div className="next-action-line"><span>NEXT REQUIRED STEP</span><strong>{expectedNext}</strong></div>
            </div>
          )}

          <div className="evidence-block">
            <div className="evidence-heading"><div><p className="section-label">CAUSAL EVIDENCE PATH</p><small>HOW THE STEWARD REACHED THIS ASSESSMENT</small></div><span>6 LINKS</span></div>
            <div className="causal-flow">
            {evidencePath.map((item, index) => (
              <button className={`${item.state} ${selectedEvidence === item.id ? "active" : ""}`} disabled={!visibleIds.has(item.id)} onClick={() => inspectEvidence(item.id)} key={`${item.label}-${index}`}>
                <span className="causal-index">{item.state === "done" || item.state === "recovered" ? "✓" : item.state === "blocked" ? "×" : item.state === "warning" ? "!" : ""}</span>
                <span><strong>{item.label}</strong><small>{item.detail}</small></span>
                <i>{item.state === "blocked" ? "BROKEN" : item.state === "warning" ? "AT RISK" : item.state === "recovered" ? "RESTORED" : index < evidencePath.length - 1 ? "" : "COMPLETE"}</i>
              </button>
            ))}
            </div>
          </div>
        </aside>
      </div>

      <section className="narrative-panel">
        <div className="narrative-tabs" role="tablist">
          <p className="section-label">04 · INTELLIGENCE BRIEF</p>
          <div>
            <button className={activeTab === "engineer" ? "active" : ""} onClick={() => setActiveTab("engineer")}>ENGINEER</button>
            <button className={activeTab === "stakeholder" ? "active" : ""} onClick={() => setActiveTab("stakeholder")}>STAKEHOLDER</button>
            <button className={activeTab === "retrospective" ? "active" : ""} onClick={() => setActiveTab("retrospective")}>RETROSPECTIVE</button>
          </div>
        </div>
        <div className="narrative-content">
          {activeTab === "engineer" && <><div><span className="narrative-number">01</span><h2>{intelligence.engineer.headline}</h2><p>{intelligence.engineer.body}</p></div><ul>{intelligence.engineer.details.map((item) => <li key={item}>{item}</li>)}</ul></>}
          {activeTab === "stakeholder" && <div className="stakeholder-card"><div className="stakeholder-lead"><span className="narrative-number">02 · BUSINESS DECISION BRIEF</span><h2>{intelligence.stakeholder.headline}</h2><p>{intelligence.stakeholder.body}</p></div><div className="decision-grid"><div><span>BUSINESS STATUS</span><strong>{intelligence.stakeholder.businessStatus}</strong></div><div><span>DEPLOYMENT</span><strong>{intelligence.stakeholder.deployment}</strong></div><div><span>VALIDATION</span><strong>{intelligence.stakeholder.validation}</strong></div><div><span>DELIVERY CONFIDENCE</span><strong>{intelligence.stakeholder.deliveryConfidence}</strong></div><div className="decision-cell"><span>DECISION</span><strong>{intelligence.stakeholder.decision}</strong></div><div className="risk-cell"><span>RISK</span><strong>{intelligence.stakeholder.risk}</strong></div></div><div className="business-action"><span>RECOMMENDED BUSINESS ACTION</span><strong>{intelligence.stakeholder.recommendedAction}</strong></div></div>}
          {activeTab === "retrospective" && <><div><span className="narrative-number">03</span><h2>{intelligence.retrospective.outcome}</h2><p>{intelligence.retrospective.nextTime}</p></div><ul>{intelligence.retrospective.learned.map((item) => <li key={item}>{item}</li>)}</ul></>}
        </div>
      </section>

      <footer><span>AIRE–EDGE SESSION STEWARD · BUILD WEEK MVP</span><span>TRACKING OUTCOMES · NOT JUST SYSTEM HEALTH</span></footer>
    </main>
  );
}
