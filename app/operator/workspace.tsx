"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import styles from "./operator.module.css";
import persistenceStyles from "./persistence.module.css";

type StepStatus = "pending" | "satisfied" | "attention_needed" | "stale" | "failed";
type TemplateStep = {
  key: string;
  title: string;
  expectedEventType: string;
  expectedEvidenceKinds?: string[];
  freshnessRequirementSeconds?: number;
  operatorRationale?: string;
  maxWaitSeconds?: number;
  required?: boolean;
};
type Template = {
  id: string;
  name: string;
  description: string;
  steps: TemplateStep[];
  persisted: boolean;
};

const initialTemplates: Template[] = [
  {
    id: "essex-qoe-v1",
    name: "Essex QoE promotion",
    description: "Validate an edge-routing change before cohort promotion.",
    steps: [
      { key: "baseline", title: "Capture baseline QoE", expectedEventType: "qoe.score.recorded", expectedEvidenceKinds: ["qoe-score"], freshnessRequirementSeconds: 1800 },
      { key: "deployment", title: "Deploy routing configuration", expectedEventType: "deployment.completed", expectedEvidenceKinds: ["deployment"] },
      { key: "health", title: "Verify infrastructure health", expectedEventType: "health.check.passed", expectedEvidenceKinds: ["health-check"] },
      { key: "validation", title: "Run post-change validation", expectedEventType: "qoe.validation.completed", expectedEvidenceKinds: ["qoe-score", "packet-loss"], freshnessRequirementSeconds: 900, maxWaitSeconds: 480 },
      { key: "comparison", title: "Compare against baseline", expectedEventType: "qoe.comparison.completed", expectedEvidenceKinds: ["qoe-comparison"] },
      { key: "recommendation", title: "Issue promotion recommendation", expectedEventType: "recommendation.issued", expectedEvidenceKinds: ["recommendation"] },
    ],
    persisted: false,
  },
];

const beats = [
  {
    state: "progressing",
    label: "Progressing",
    summary: "Baseline evidence is current and the routing deployment completed as planned.",
    action: "Wait for health checks, then begin post-change validation.",
    statuses: ["satisfied", "satisfied", "pending", "pending", "pending", "pending"],
    confidence: 94,
  },
  {
    state: "attention_needed",
    label: "Attention needed",
    summary: "Infrastructure is healthy, but no fresh objective evidence has arrived.",
    action: "Start the contracted QoE validation within eight minutes.",
    statuses: ["satisfied", "satisfied", "satisfied", "attention_needed", "pending", "pending"],
    confidence: 71,
  },
  {
    state: "intervention_required",
    label: "Intervention required",
    summary: "Deployment polling continued while the required QoE validation remained missing.",
    action: "Run the low-bandwidth QoE validation now.",
    statuses: ["satisfied", "satisfied", "satisfied", "stale", "pending", "pending"],
    confidence: 42,
  },
  {
    state: "recovered",
    label: "Recovered",
    summary: "Fresh QoE evidence restored objective progress after the overdue handoff.",
    action: "Generate the baseline comparison and verify packet loss.",
    statuses: ["satisfied", "satisfied", "satisfied", "satisfied", "pending", "pending"],
    confidence: 84,
  },
  {
    state: "completed",
    label: "Completed",
    summary: "QoE improved by 10.9%, packet loss remained within guardrails, and the evidence chain is complete.",
    action: "Approve promotion to the 25% traffic cohort.",
    statuses: ["satisfied", "satisfied", "satisfied", "satisfied", "satisfied", "satisfied"],
    confidence: 97,
  },
] as const;

export default function OperatorWorkspace({
  operator,
  signOutPath,
  sessionId,
}: {
  operator: { name: string; email: string };
  signOutPath: string;
  sessionId: string;
}) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [selectedId, setSelectedId] = useState(initialTemplates[0].id);
  const [beat, setBeat] = useState(0);
  const [replaceForRun, setReplaceForRun] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("Essex QoE promotion — strict");
  const [description, setDescription] = useState("Require fresh validation across all bandwidth tiers.");
  const [apiStatus, setApiStatus] = useState<"loading" | "connected" | "unavailable">("loading");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const selected = useMemo(
    () => templates.find((template) => template.id === selectedId) ?? templates[0],
    [selectedId, templates],
  );
  const current = beats[beat];

  useEffect(() => {
    let active = true;
    fetch("/api/steward/templates", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<Omit<Template, "persisted">[]>;
      })
      .then((records) => {
        if (!active) return;
        const persisted = records.map((template) => ({ ...template, persisted: true }));
        setApiStatus("connected");
        if (persisted.length > 0) {
          setTemplates(persisted);
          setSelectedId(persisted[0].id);
        }
      })
      .catch(() => {
        if (active) setApiStatus("unavailable");
      });
    return () => {
      active = false;
    };
  }, []);

  async function saveTemplate() {
    if (!name.trim()) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/steward/templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          objectiveType: "qoe-promotion",
          steps: initialTemplates[0].steps,
          successCriteria: [
            { key: "qoe-improvement", metricName: "qoe_improvement", operator: ">=", thresholdValue: 5, unit: "percent" },
            { key: "packet-loss", metricName: "packet_loss", operator: "<=", thresholdValue: 1, unit: "percent" },
          ],
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Template could not be saved.");
      const template = { ...result, persisted: true } as Template;
      setTemplates((existing) => [
        ...existing.filter((item) => item.persisted),
        template,
      ]);
      setSelectedId(template.id);
      setApiStatus("connected");
      setMessage("Template saved to the staging contract service.");
      setEditing(false);
    } catch (error) {
      setApiStatus("unavailable");
      setMessage(error instanceof Error ? error.message : "Template could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function applyContract() {
    if (!selected.persisted) {
      setMessage("Connect the staging API and save this template before assigning it.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/steward/sessions/${sessionId}/contract`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          templateId: selected.id,
          replaceExisting: replaceForRun,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message ?? result.error ?? "Contract could not be assigned.");
      }
      setMessage(`Contract v${result.contract.version} assigned to the live session.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Contract could not be assigned.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <div><span>AIRE–EDGE</span><strong>Session Steward · Operator</strong></div>
        <nav><Link href="/">Competition replay</Link><span>{operator.name}</span><a href={signOutPath}>Sign out</a></nav>
      </header>

      <section className={styles.hero}>
        <div>
          <p>LIVE SESSION · UNIVERSITY OF ESSEX</p>
          <h1>Decide whether the routing change is ready to promote.</h1>
          <span>Objective-aware judgement over deployment, health, QoE, and evidence lifecycle events.</span>
        </div>
        <div className={`${styles.state} ${styles[current.state]}`}>
          <span>SESSION PROGRESSION</span>
          <strong>{current.label}</strong>
          <i>{current.confidence}% confidence</i>
        </div>
      </section>

      <section className={styles.grid}>
        <aside className={styles.templates}>
          <div className={styles.sectionHead}><div><span>CONTRACT TEMPLATE</span><h2>Definition of done</h2></div><button onClick={() => setEditing(true)}>New template</button></div>
          <div className={`${persistenceStyles.apiStatus} ${persistenceStyles[apiStatus]}`}>
            <i />
            {apiStatus === "loading"
              ? "Connecting to staging"
              : apiStatus === "connected"
                ? "Persisted staging data"
                : "Fixture preview · API unavailable"}
          </div>
          <label>
            Template for this run
            <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
              {templates.map((template) => <option value={template.id} key={template.id}>{template.name}</option>)}
            </select>
          </label>
          <p>{selected.description}</p>
          <label className={styles.toggle}>
            <input type="checkbox" checked={replaceForRun} onChange={(event) => setReplaceForRun(event.target.checked)} />
            <span>Replace template for this run only</span>
          </label>
          {replaceForRun && <div className={styles.override}>Run override active · changes will create a new contract version without modifying the reusable template.</div>}
          <button className={persistenceStyles.apply} onClick={applyContract} disabled={saving}>Apply contract to session</button>
          {message && <div className={persistenceStyles.message} role="status">{message}</div>}
          {editing && (
            <div className={styles.editor}>
              <span>CREATE REUSABLE TEMPLATE</span>
              <input value={name} onChange={(event) => setName(event.target.value)} aria-label="Template name" />
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} aria-label="Template description" />
              <div><button onClick={saveTemplate} disabled={saving}>{saving ? "Saving…" : "Save template"}</button><button onClick={() => setEditing(false)}>Cancel</button></div>
            </div>
          )}
        </aside>

        <section className={styles.contract}>
          <div className={styles.sectionHead}><div><span>CONTRACT PROGRESS</span><h2>{selected.name}</h2></div><b>{current.statuses.filter((status) => status === "satisfied").length}/{selected.steps.length}</b></div>
          <div className={styles.steps}>
            {selected.steps.map((step, index) => {
              const status = current.statuses[index] as StepStatus;
              return <article className={styles[status]} key={step.key}><i>{status === "satisfied" ? "✓" : index + 1}</i><div><strong>{step.title}</strong><span>{status.replaceAll("_", " ")}</span></div></article>;
            })}
          </div>
        </section>

        <aside className={styles.judgement}>
          <span>OPERATOR DECISION</span>
          <h2>{current.label}</h2>
          <p>{current.summary}</p>
          <div><span>RECOMMENDED NEXT ACTION</span><strong>{current.action}</strong></div>
          <section>
            <span>EVIDENCE SUMMARY</span>
            <dl><div><dt>Baseline</dt><dd>Current</dd></div><div><dt>Infrastructure</dt><dd>Healthy</dd></div><div><dt>QoE rerun</dt><dd>{beat < 3 ? "Missing" : "Current"}</dd></div><div><dt>Packet loss</dt><dd>{beat < 4 ? "Pending" : "0.9%"}</dd></div></dl>
          </section>
          <button onClick={() => setBeat((value) => Math.min(value + 1, beats.length - 1))} disabled={beat === beats.length - 1}>
            {beat === 2 ? "Run validation" : beat === beats.length - 1 ? "Decision complete" : "Advance evidence"}
          </button>
          {beat > 0 && <button className={styles.secondary} onClick={() => setBeat((value) => Math.max(0, value - 1))}>Previous state</button>}
        </aside>
      </section>
      <footer>Contract-aware progression · deterministic evidence rules · upstream publisher ready</footer>
    </main>
  );
}
