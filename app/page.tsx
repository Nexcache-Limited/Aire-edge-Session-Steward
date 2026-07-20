"use client";

import { useEffect, useMemo, useState } from "react";
import { demoContract, demoEvents } from "../lib/demo-session";
import { generateIntelligence } from "../lib/intelligence-service";
import { evaluateSession } from "../lib/session-engine";
import type { SessionEvent, SessionHealth } from "../lib/session-types";

const healthCopy: Record<SessionHealth, { label: string; eyebrow: string }> = {
  progressing: { label: "Progressing", eyebrow: "On contract" },
  legitimate_wait: { label: "Legitimate wait", eyebrow: "Within window" },
  attention_needed: { label: "Attention needed", eyebrow: "Momentum fading" },
  intervention_required: { label: "Intervention required", eyebrow: "Objective at risk" },
  recovered: { label: "Recovered", eyebrow: "Momentum restored" },
};

const eventMarks: Record<SessionEvent["kind"], string> = {
  milestone: "✓",
  change: "↗",
  check: "◆",
  poll: "↻",
  clock: "!",
  validation: "△",
  analysis: "◎",
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
            <div className="chart-column" key={point.eventId} title={`${point.timestamp} · ${point.score}% · ${point.reason}`}>
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

export default function Home() {
  const [visibleCount, setVisibleCount] = useState(7);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [activeTab, setActiveTab] = useState<"engineer" | "stakeholder" | "retrospective">("engineer");
  const [selectedEvidence, setSelectedEvidence] = useState("evt-07");
  const visibleEvents = useMemo(() => demoEvents.slice(0, visibleCount), [visibleCount]);
  const state = useMemo(() => evaluateSession(demoContract, visibleEvents), [visibleEvents]);
  const intelligence = useMemo(() => generateIntelligence(state), [state]);
  const status = healthCopy[state.health];

  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => {
      if (visibleCount >= demoEvents.length) {
        setPlaying(false);
        return;
      }
      setVisibleCount((count) => count + 1);
    }, 1500 / speed);
    return () => window.clearTimeout(timer);
  }, [playing, speed, visibleCount]);

  function toggleReplay() {
    if (visibleCount >= demoEvents.length) setVisibleCount(1);
    setPlaying((current) => !current);
  }

  function inspectEvidence(eventId: string) {
    setSelectedEvidence(eventId);
    document.getElementById(eventId)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const evidenceEvents = visibleEvents.filter((event) =>
    state.intervention?.evidenceIds.includes(event.id) || event.id === visibleEvents.at(-1)?.id,
  );

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
          <span>OWNER <strong>M. CHEN</strong></span>
          <span>ELAPSED <strong>{visibleEvents.at(-1)?.elapsedMinutes ?? 0}M</strong></span>
          <span>REGION <strong>LHR-EDGE</strong></span>
        </div>
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
            <div><p className="section-label">02 · LIVE SESSION</p><h2>Objective timeline</h2></div>
            <div className="replay-controls">
              <button className="icon-button" onClick={() => setVisibleCount(Math.max(1, visibleCount - 1))} aria-label="Step backward">‹</button>
              <button className="play-button" onClick={toggleReplay}>{playing ? "PAUSE" : visibleCount === demoEvents.length ? "REPLAY" : "PLAY"}</button>
              <button className="icon-button" onClick={() => setVisibleCount(Math.min(demoEvents.length, visibleCount + 1))} aria-label="Step forward">›</button>
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
            <div><p className="section-label">03 · SESSION HEALTH</p><span className="state-eyebrow">{status.eyebrow}</span></div>
            <span className={`state-orb ${state.health}`} />
          </div>
          <h2 className={`state-title ${state.health}`}>{status.label}</h2>

          <div className="confidence-header">
            <div><p className="section-label">CONFIDENCE</p><strong>{state.confidence}<span>%</span></strong></div>
            <p>{state.confidenceHistory.at(-1)?.reason}</p>
          </div>
          <ConfidenceChart points={state.confidenceHistory} />

          {state.intervention ? (
            <div className="intervention-card">
              <div className="intervention-label"><span>!</span> STEWARD INTERVENTION</div>
              <h3>{state.intervention.title}</h3>
              <p>{state.intervention.explanation}</p>
              <div className="recommended-action">
                <span className="section-label">RECOMMENDED NEXT ACTION</span>
                <strong>{state.intervention.recommendedAction}</strong>
              </div>
              <div className="intervention-actions"><button onClick={() => { setVisibleCount(8); setPlaying(true); }}>RUN VALIDATION</button><button className="ghost-button">ASSIGN ↗</button></div>
            </div>
          ) : (
            <div className={`reasoning-card ${state.health}`}>
              <p className="section-label">WHY CONFIDENCE CHANGED</p>
              <h3>{intelligence.reasoning}</h3>
              <div className="next-action-line"><span>EXPECTED NEXT</span><strong>{demoContract.expectedSteps[state.nextStepIndex]}</strong></div>
            </div>
          )}

          <div className="evidence-block">
            <div className="evidence-heading"><p className="section-label">EVIDENCE CHAIN</p><span>{evidenceEvents.length} SIGNALS</span></div>
            {evidenceEvents.map((event) => (
              <button className={selectedEvidence === event.id ? "active" : ""} onClick={() => inspectEvidence(event.id)} key={event.id}>
                <span className={`evidence-dot ${event.outcome}`} />
                <span><strong>{event.title}</strong><small>{event.timestamp} · {event.source}</small></span>
                <i>↗</i>
              </button>
            ))}
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
          {activeTab === "stakeholder" && <><div><span className="narrative-number">02</span><h2>{intelligence.stakeholder.headline}</h2><p>{intelligence.stakeholder.body}</p></div><div className="impact-box"><span>DECISION</span><strong>{intelligence.stakeholder.businessImpact}</strong></div></>}
          {activeTab === "retrospective" && <><div><span className="narrative-number">03</span><h2>{intelligence.retrospective.outcome}</h2><p>{intelligence.retrospective.nextTime}</p></div><ul>{intelligence.retrospective.learned.map((item) => <li key={item}>{item}</li>)}</ul></>}
        </div>
      </section>

      <footer><span>AIRE–EDGE SESSION STEWARD · BUILD WEEK MVP</span><span>DETERMINISTIC ENGINE + GPT-5.6 REASONING BOUNDARY</span></footer>
    </main>
  );
}
