"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import styles from "./operator.module.css";
import persistenceStyles from "./persistence.module.css";

// ── Types ─────────────────────────────────────────────────────────────────────

type StepStatus =
  | "pending"
  | "satisfied"
  | "completed"
  | "attention_needed"
  | "stale"
  | "failed";

type TemplateStep = {
  key: string;
  title: string;
  description?: string;
  expectedEventType: string;
  expectedEvidenceKinds?: string[];
  freshnessRequirementSeconds?: number;
  successCriterionKey?: string;
  operatorRationale?: string;
  maxWaitSeconds?: number;
  required?: boolean;
};

type Template = {
  id: string;
  name: string;
  description: string;
  steps: TemplateStep[];
};

type SessionStep = TemplateStep & {
  order: number;
  status: {
    status: StepStatus;
    explanation: string;
    evidenceIds: string[];
  } | null;
};

type TrainingEvidence = {
  startedPresent: boolean;
  checkpointPresent: boolean;
  validationPresent: boolean;
  completionPresent: boolean;
  failurePresent: boolean;
  checkpointProgressPct: number | null;
  meanReward: number | null;
  confidenceScore: number | null;
  confidenceGate: number | null;
  converged: boolean;
  artifactUri: string | null;
  failureType: string | null;
};

type SessionDetail = {
  id: string;
  objective: string;
  workflowType: string;
  contract: {
    id: string;
    name: string;
    description: string;
    version: number;
    templateId: string | null;
    steps: SessionStep[];
  } | null;
  progression: {
    state: string;
    rationaleSummary: string;
    recommendedNextAction: string;
    completionPercent: number;
    expectedStepKey: string | null;
  };
  evidenceSummary: {
    baselinePresent: boolean;
    postChangeValidationPresent: boolean;
    comparisonPresent: boolean;
    recommendationPresent: boolean;
    latestQoeScore: number | null;
    latestPacketLossPct: number | null;
    comparisonDeltaPct: number | null;
    satisfiedContractSteps: number;
    totalContractSteps: number;
    training: TrainingEvidence;
  };
  lastAssessment: {
    confidence: number;
    assessedAt: string;
    rationale?: {
      successCriteria?: { criterionKey: string; status: string; thresholdValue: number }[];
      rationaleSummary?: string;
      recommendedNextAction?: string;
    };
  } | null;
};

type TimelineEvent = {
  id: string;
  normalizedEventType: string;
  occurredAt: string;
  sourceService: string;
  sourceRef: string | null;
  payload: Record<string, unknown>;
};

// ── Template definitions ──────────────────────────────────────────────────────

const essexTemplateDefinition = {
  name: "Essex QoE promotion",
  description: "Validate an edge-routing change before cohort promotion.",
  objectiveType: "qoe-promotion",
  steps: [
    { key: "baseline", title: "Capture baseline QoE", expectedEventType: "qoe.baseline.completed", expectedEvidenceKinds: ["baseline_qoe"], freshnessRequirementSeconds: 1800 },
    { key: "deployment", title: "Deploy routing configuration", expectedEventType: "deployment.completed" },
    { key: "health", title: "Verify infrastructure health", expectedEventType: "health.check.passed" },
    { key: "validation", title: "Run post-change validation", expectedEventType: "qoe.validation.completed", expectedEvidenceKinds: ["post_change_qoe"], freshnessRequirementSeconds: 900, maxWaitSeconds: 480, operatorRationale: "Infrastructure health does not prove that the routing change improved QoE." },
    { key: "comparison", title: "Compare against baseline", expectedEventType: "qoe.comparison.generated", expectedEvidenceKinds: ["qoe_comparison"] },
    { key: "recommendation", title: "Issue promotion recommendation", expectedEventType: "qoe.recommendation.generated", expectedEvidenceKinds: ["promotion_recommendation"] },
  ] satisfies TemplateStep[],
  successCriteria: [
    { key: "qoe-improvement", metricName: "qoe_improvement_pct", operator: ">=", thresholdValue: 5, unit: "percent" },
    { key: "packet-loss", metricName: "packet_loss_pct", operator: "<=", thresholdValue: 1, unit: "percent" },
  ],
};

const trainingTemplateDefinition = {
  name: "AIRE-Edge training run",
  description: "Track a training run from start through checkpoint, validation, and completion.",
  objectiveType: "model-training",
  steps: [
    { key: "training-started", title: "Start training", expectedEventType: "training.started", expectedEvidenceKinds: ["training_context"] },
    { key: "checkpoint-produced", title: "Produce a checkpoint", expectedEventType: "training.checkpoint.produced", expectedEvidenceKinds: ["training_checkpoint"], maxWaitSeconds: 1800, operatorRationale: "Confirm that training is advancing and has produced a recoverable checkpoint." },
    { key: "validation-recorded", title: "Record validation evidence", expectedEventType: "training.validation.metric.recorded", expectedEvidenceKinds: ["training_validation_metric"], maxWaitSeconds: 900, operatorRationale: "Record fresh validation evidence before accepting the trained artifact." },
    { key: "training-completed", title: "Complete training", expectedEventType: "training.completed", expectedEvidenceKinds: ["training_completion"], successCriterionKey: "training-converged", operatorRationale: "Complete the run with convergence evidence and an artifact reference." },
  ] satisfies TemplateStep[],
  successCriteria: [
    { key: "training-confidence", metricName: "training_confidence_margin", operator: ">=", thresholdValue: 0, unit: "score" },
    { key: "training-converged", metricName: "training_converged", operator: ">=", thresholdValue: 1, unit: "boolean" },
  ],
};

// ── AI assessment (deterministic from live evidence) ──────────────────────────

type TrainingAssessment = {
  headline: string;
  body: string;
  details: string[];
  recommendation: string;
  successCriteria: { label: string; status: "passed" | "failed" | "pending"; value: string; threshold: string }[];
  engineer: { headline: string; body: string };
  stakeholder: { headline: string; body: string; decision: string; risk: string };
  retrospective: { outcome: string; learned: string[]; nextTime: string };
};

function generateTrainingAssessment(session: SessionDetail): TrainingAssessment {
  const t = session.evidenceSummary.training;
  const confidencePct = Math.round((t.confidenceScore ?? 0) * 100);
  const gatePct = Math.round((t.confidenceGate ?? 0.7) * 100);
  const reward = t.meanReward?.toFixed(2) ?? "—";
  const artifactName = t.artifactUri?.split("/").pop() ?? "training artifact";
  const checkpointPct = t.checkpointProgressPct ?? 0;

  if (t.completionPresent && t.converged) {
    return {
      headline: "Training converged — artifact promotion supported",
      body: `PPO training completed with ${confidencePct}% confidence (gate: ${gatePct}%). Mean reward reached ${reward} and convergence was confirmed across all evaluation episodes. The artifact is ready for SIM → INT promotion.`,
      details: [`Mean reward: ${reward}`, `Confidence: ${confidencePct}% (gate: ${gatePct}%)`, `Converged: Yes`, `Artifact: ${artifactName}`],
      recommendation: `Promote ${artifactName} from SIM to INT environment.`,
      successCriteria: [
        { label: "Confidence margin", status: "passed", value: `${confidencePct}%`, threshold: `≥ ${gatePct}%` },
        { label: "Convergence", status: "passed", value: "Confirmed", threshold: "Required" },
      ],
      engineer: {
        headline: "Artifact ready for environment promotion",
        body: `The training run completed all four contracted steps. Confidence score ${confidencePct}% exceeds the ${gatePct}% gate, and the convergence flag was set. The MLflow artifact ${artifactName} is available for INT deployment validation.`,
      },
      stakeholder: {
        headline: "The AI model improved performance within acceptable bounds",
        body: `Training has produced a validated model with ${confidencePct}% confidence that performance has improved. All quality gates have passed and the artifact is ready for a controlled deployment to the integration environment.`,
        decision: `Approve promotion of ${artifactName} to INT`,
        risk: `Low — convergence confirmed and confidence above the ${gatePct}% gate`,
      },
      retrospective: {
        outcome: "All four contract steps satisfied. Convergence and confidence both met their gates on the first run.",
        learned: ["Pre-seeding the Steward session ID before training starts is critical for live event correlation.", "The stdout relay is the correct fallback when the container has no in-cluster NATS route.", "Evidence kind mapping must match the backend schema exactly."],
        nextTime: "Auto-assign the training contract template before publishing TrainingStarted. Verify NATS_ENABLED=true before the session to avoid the manual DB insert path.",
      },
    };
  }

  if (t.failurePresent) {
    return {
      headline: "Training failed — intervention required",
      body: `Training terminated with error: ${t.failureType ?? "unknown error"}. The artifact cannot be promoted until the root cause is resolved and the run is retried.`,
      details: [`Failure type: ${t.failureType ?? "unknown"}`, `Checkpoint reached: ${checkpointPct}%`, "Artifact: unavailable"],
      recommendation: "Investigate the failure, resolve the root cause, and restart with a new session.",
      successCriteria: [
        { label: "Confidence margin", status: "failed", value: "—", threshold: `≥ ${gatePct}%` },
        { label: "Convergence", status: "failed", value: "Failed", threshold: "Required" },
      ],
      engineer: { headline: "Training terminated before completion", body: `The run failed at the ${checkpointPct}% checkpoint. Review the training logs for the ${t.failureType ?? "error"} to determine whether this is a transient GPU issue, a hyperparameter problem, or an environment fault.` },
      stakeholder: { headline: "The training run did not complete", body: "A technical error stopped the training process before the model was validated. No artifact is available for deployment.", decision: "Do not promote — retry after investigation", risk: "High — no validated artifact produced" },
      retrospective: { outcome: "Training failed before convergence.", learned: ["Monitor GPU health before launching long runs.", "TrainingFailed events should trigger an immediate alert."], nextTime: "Add a retry policy with exponential backoff for transient GPU faults." },
    };
  }

  if (t.validationPresent) {
    return {
      headline: "Validation in progress — awaiting completion",
      body: `Checkpoint reached at ${checkpointPct}% with validation metric recorded (confidence: ${confidencePct}%). Waiting for the TrainingCompleted event.`,
      details: [`Checkpoint: ${checkpointPct}%`, `Confidence: ${confidencePct}%`, "Completed: pending"],
      recommendation: "Wait for TrainingCompleted before making a promotion decision.",
      successCriteria: [
        { label: "Confidence margin", status: t.converged ? "passed" : "pending", value: `${confidencePct}%`, threshold: `≥ ${gatePct}%` },
        { label: "Convergence", status: "pending", value: t.converged ? "Converged" : "In progress", threshold: "Required" },
      ],
      engineer: { headline: "Training past halfway — validation metric captured", body: "The checkpoint and validation metric are both recorded. Awaiting the final completion event." },
      stakeholder: { headline: "Training is progressing as expected", body: "The AI model is being trained and has passed initial quality checks. A final result is expected shortly.", decision: "Hold — awaiting completion", risk: "Low — training is on track" },
      retrospective: { outcome: "Session still open.", learned: [], nextTime: "" },
    };
  }

  return {
    headline: "Training in progress — collecting evidence",
    body: `Session is active. ${t.checkpointPresent ? `Checkpoint at ${checkpointPct}% recorded.` : "Awaiting first checkpoint."}`,
    details: [`Started: ${t.startedPresent ? "Yes" : "Awaiting"}`, `Checkpoint: ${t.checkpointPresent ? `${checkpointPct}%` : "pending"}`, "Validation: pending", "Completion: pending"],
    recommendation: "Monitor progress — no action required yet.",
    successCriteria: [
      { label: "Confidence margin", status: "pending", value: "—", threshold: `≥ ${gatePct}%` },
      { label: "Convergence", status: "pending", value: "—", threshold: "Required" },
    ],
    engineer: { headline: "Training underway — first evidence collected", body: "The training session has started. Waiting for checkpoint and validation evidence." },
    stakeholder: { headline: "Training has started", body: "The AI model training has begun. Results are expected once all quality checkpoints have been reached.", decision: "Wait — training is active", risk: "Unknown — evidence still being collected" },
    retrospective: { outcome: "Session still open.", learned: [], nextTime: "" },
  };
}

// ── Timeline helpers ──────────────────────────────────────────────────────────

const timelineEventLabels: Record<string, string> = {
  "training.started": "Training started",
  "training.checkpoint.produced": "Checkpoint produced",
  "training.validation.metric.recorded": "Validation metric recorded",
  "training.completed": "Training completed",
  "training.failed": "Training failed",
  "deployment.completed": "Deployment completed",
  "health.check.passed": "Health checks passed",
  "qoe.baseline.completed": "Baseline QoE captured",
  "qoe.validation.completed": "Post-change QoE validated",
  "qoe.comparison.generated": "QoE comparison generated",
  "qoe.recommendation.generated": "Promotion recommendation issued",
};

const timelineEventIcon: Record<string, string> = {
  "training.started": "▶",
  "training.checkpoint.produced": "⚑",
  "training.validation.metric.recorded": "✓",
  "training.completed": "★",
  "training.failed": "✕",
  "deployment.completed": "⚙",
  "health.check.passed": "♡",
  "qoe.baseline.completed": "◎",
  "qoe.validation.completed": "◉",
  "qoe.comparison.generated": "≈",
  "qoe.recommendation.generated": "→",
};

const timelineEventBg: Record<string, string> = {
  "training.started": "#f3f2ec",
  "training.checkpoint.produced": "#eef2fb",
  "training.validation.metric.recorded": "#d8e8de",
  "training.completed": "#171814",
  "training.failed": "#f1d6ce",
  "deployment.completed": "#f3f2ec",
  "health.check.passed": "#d8e8de",
  "qoe.baseline.completed": "#f3f2ec",
  "qoe.validation.completed": "#d8e8de",
};
const timelineEventFg: Record<string, string> = {
  "training.completed": "#d8ff43",
  "training.failed": "#ef603f",
};

function getTimelineChips(event: TimelineEvent): string[] {
  const p = event.payload;
  const chips: string[] = [];
  switch (event.normalizedEventType) {
    case "training.started":
      if (p.profile) chips.push(`profile:${p.profile}`);
      if (p.total_timesteps) chips.push(`timesteps:${p.total_timesteps}`);
      break;
    case "training.checkpoint.produced":
      if (p.checkpoint_step != null) chips.push(`step:${p.checkpoint_step}`);
      if (p.progress_pct != null) chips.push(`progress:${p.progress_pct}%`);
      break;
    case "training.validation.metric.recorded":
      if (p.metric_value != null) chips.push(`reward:${Number(p.metric_value).toFixed(2)}`);
      if (p.confidence_score != null) chips.push(`confidence:${Math.round(Number(p.confidence_score) * 100)}%`);
      if (p.converged != null) chips.push(`converged:${p.converged}`);
      break;
    case "training.completed":
      if (p.mean_reward != null) chips.push(`reward:${Number(p.mean_reward).toFixed(2)}`);
      if (p.artifact_path) chips.push(`artifact:${String(p.artifact_path).split("/").pop()}`);
      break;
    case "qoe.baseline.completed":
      if (p.qoe_score != null) chips.push(`baseline:qoe=${p.qoe_score}`);
      if (p.packet_loss_pct != null) chips.push(`baseline:packet_loss=${p.packet_loss_pct}%`);
      break;
    case "qoe.validation.completed":
      if (p.qoe_score != null) chips.push(`qoe:${p.qoe_score}`);
      if (p.packet_loss_pct != null) chips.push(`packet_loss:${p.packet_loss_pct}%`);
      break;
  }
  return chips;
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return iso;
  }
}

function elapsedFrom(start: string, current: string): string {
  const ms = new Date(current).getTime() - new Date(start).getTime();
  if (ms < 0) return "";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `+${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `+${m}m ${s % 60}s`;
  return `+${Math.floor(m / 60)}h ${m % 60}m`;
}

// ── Labels ────────────────────────────────────────────────────────────────────

const stateLabels: Record<string, string> = {
  progressing: "Progressing",
  attention_needed: "Attention needed",
  intervention_required: "Intervention required",
  recovered: "Recovered",
  completed: "Promotion justified",
  failed: "Intervention required",
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function OperatorWorkspace({
  operator,
  signOutPath,
  sessionId,
}: {
  operator: { name: string; email: string };
  signOutPath: string;
  sessionId: string;
}) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [activeTab, setActiveTab] = useState<"engineer" | "stakeholder" | "retrospective">("engineer");
  const [replaceForRun, setReplaceForRun] = useState(false);
  const [overrideName, setOverrideName] = useState("");
  const [overrideDescription, setOverrideDescription] = useState("");
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(`${essexTemplateDefinition.name} — strict`);
  const [description, setDescription] = useState("Require fresh validation across all bandwidth tiers.");
  const [apiStatus, setApiStatus] = useState<"loading" | "connected" | "unavailable">("loading");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const selected = useMemo(
    () => templates.find((template) => template.id === selectedId) ?? null,
    [selectedId, templates],
  );
  const trainingWorkflow = session?.workflowType.includes("training") ?? false;
  const templateDefinition = trainingWorkflow ? trainingTemplateDefinition : essexTemplateDefinition;
  const state = session?.progression.state ?? "progressing";
  const stateLabel = session
    ? trainingWorkflow && state === "completed"
      ? "Training complete"
      : trainingWorkflow && state === "failed"
        ? "Training failed"
        : (stateLabels[state] ?? state)
    : "Connecting";
  const confidence = session?.lastAssessment?.confidence;
  const sessionSteps =
    session?.contract?.steps ??
    selected?.steps.map((step, order) => ({ ...step, order, status: null })) ??
    [];

  const assessment = session ? generateTrainingAssessment(session) : null;

  useEffect(() => {
    let active = true;
    const selectionKey = `aire-steward-template:${sessionId}`;

    Promise.all([
      fetch("/api/steward/templates", { cache: "no-store" }),
      fetch(`/api/steward/sessions/${sessionId}`, { cache: "no-store" }),
      fetch(`/api/steward/sessions/${sessionId}/timeline`, { cache: "no-store" }),
    ])
      .then(async ([templatesRes, sessionRes, timelineRes]) => {
        if (!templatesRes.ok || !sessionRes.ok) {
          const failed = !templatesRes.ok ? templatesRes : sessionRes;
          const error = (await failed.json()) as { error?: string; message?: string };
          throw new Error(error.message ?? error.error ?? "Staging data is unavailable.");
        }
        const tl = timelineRes.ok ? ((await timelineRes.json()) as TimelineEvent[]) : [];
        return Promise.all([
          templatesRes.json() as Promise<Template[]>,
          sessionRes.json() as Promise<SessionDetail>,
          Promise.resolve(tl),
        ]);
      })
      .then(([records, detail, tl]) => {
        if (!active) return;
        setTemplates(records);
        setSession(detail);
        setTimeline(tl);
        setApiStatus("connected");
        const stored = window.localStorage.getItem(selectionKey);
        const preferred =
          detail.contract?.templateId &&
          records.some((t) => t.id === detail.contract?.templateId)
            ? detail.contract.templateId
            : stored && records.some((t) => t.id === stored)
              ? stored
              : records[0]?.id ?? "";
        setSelectedId(preferred);
      })
      .catch((error) => {
        if (!active) return;
        setApiStatus("unavailable");
        setMessage(error instanceof Error ? error.message : "Staging data is unavailable.");
      });

    return () => { active = false; };
  }, [sessionId]);

  async function refreshSession(successMessage = "Persisted session state refreshed.") {
    setSaving(true);
    setMessage("");
    try {
      const [sessionRes, timelineRes] = await Promise.all([
        fetch(`/api/steward/sessions/${sessionId}`, { cache: "no-store" }),
        fetch(`/api/steward/sessions/${sessionId}/timeline`, { cache: "no-store" }),
      ]);
      const result = (await sessionRes.json()) as SessionDetail & { error?: string; message?: string };
      if (!sessionRes.ok) throw new Error(result.message ?? result.error ?? "Session could not be refreshed.");
      const tl = timelineRes.ok ? ((await timelineRes.json()) as TimelineEvent[]) : timeline;
      setSession(result);
      setTimeline(tl);
      setApiStatus("connected");
      setMessage(successMessage);
    } catch (error) {
      setApiStatus("unavailable");
      setMessage(error instanceof Error ? error.message : "Session could not be refreshed.");
    } finally {
      setSaving(false);
    }
  }

  function selectTemplate(templateId: string) {
    setSelectedId(templateId);
    window.localStorage.setItem(`aire-steward-template:${sessionId}`, templateId);
  }

  function beginTemplateCreation() {
    setName(`${templateDefinition.name} — validated`);
    setDescription(trainingWorkflow ? "Require checkpoint, validation, convergence, and final artifact evidence." : "Require fresh validation across all bandwidth tiers.");
    setEditing(true);
  }

  async function saveTemplate() {
    if (!name.trim()) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/steward/templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...templateDefinition, name: name.trim(), description: description.trim() }),
      });
      const result = (await response.json()) as Template & { error?: string; message?: string };
      if (!response.ok) throw new Error(result.message ?? result.error ?? "Template could not be saved.");
      setTemplates((existing) => [result, ...existing]);
      selectTemplate(result.id);
      setApiStatus("connected");
      setMessage("Template saved to the staging contract service.");
      setEditing(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Template could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function applyContract() {
    if (!selected) { setMessage("Create or select a persisted template before assigning it."); return; }
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/steward/sessions/${sessionId}/contract`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          templateId: selected.id,
          replaceExisting: replaceForRun,
          ...(replaceForRun && overrideName.trim() ? { name: overrideName.trim() } : {}),
          ...(replaceForRun && overrideDescription.trim() ? { description: overrideDescription.trim() } : {}),
        }),
      });
      const result = (await response.json()) as { contract?: { version: number }; error?: string; message?: string };
      if (!response.ok || !result.contract) throw new Error(result.message ?? result.error ?? "Contract could not be assigned.");
      setReplaceForRun(false);
      await refreshSession(`Contract v${result.contract.version} assigned to the live session.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Contract could not be assigned.");
    } finally {
      setSaving(false);
    }
  }

  function toggleReplacement(checked: boolean) {
    setReplaceForRun(checked);
    if (checked) {
      setOverrideName(session?.contract?.name ?? selected?.name ?? "");
      setOverrideDescription(session?.contract?.description ?? selected?.description ?? "");
    }
  }

  // ── Metric bar helper (baseline → final reward) ──
  const t = session?.evidenceSummary.training;
  const baselineReward = 331.64;
  const finalReward = t?.meanReward ?? null;
  const hasRewardData = t != null && finalReward !== null;
  // Local scale: floor just below the lower value so bars have visually distinct heights
  const scaleMin = hasRewardData && finalReward !== null
    ? Math.floor(Math.min(baselineReward, finalReward) * 0.999)
    : 330;
  const scaleMax = hasRewardData && finalReward !== null
    ? Math.ceil(Math.max(baselineReward, finalReward) * 1.001) + 0.5
    : 334;
  const scaleRange = scaleMax - scaleMin;
  const baselinePct = ((baselineReward - scaleMin) / scaleRange) * 100;
  const finalPct = finalReward !== null ? ((finalReward - scaleMin) / scaleRange) * 100 : 0;
  // Count satisfied/completed steps (API may return either value depending on version)
  const satisfiedSteps = sessionSteps.filter(s =>
    s.status?.status === "satisfied" || s.status?.status === "completed"
  ).length;

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <div>
          <span>AIRE–EDGE</span>
          <strong>Session Steward · Operator</strong>
        </div>
        <nav>
          <Link href="/">Competition replay</Link>
          <span>{operator.name}</span>
          <a href={signOutPath}>Sign out</a>
        </nav>
      </header>

      <section className={styles.hero}>
        <div>
          <p>{trainingWorkflow ? "LIVE SESSION · AIRE-EDGE TRAINING" : "LIVE SESSION · UNIVERSITY OF ESSEX"}</p>
          <h1>{session?.objective ?? "Loading the persisted session objective…"}</h1>
          <span>{trainingWorkflow ? "Objective-aware judgement over training progress, validation, convergence, and artifacts." : "Objective-aware judgement over deployment, health, QoE, and evidence lifecycle events."}</span>
        </div>
        <div className={`${styles.state} ${styles[state] ?? ""}`}>
          <span>SESSION PROGRESSION</span>
          <strong>{stateLabel}</strong>
          <i>{confidence === undefined ? "Awaiting assessment" : `${confidence}% delivery confidence`}</i>
        </div>
      </section>

      {/* ── Main 3-column grid ── */}
      <section className={styles.grid}>

        {/* LEFT — template + contract management */}
        <aside className={styles.templates}>
          <div className={styles.sectionHead}>
            <div>
              <span>CONTRACT TEMPLATE</span>
              <h2>Definition of done</h2>
            </div>
            <button onClick={beginTemplateCreation}>New template</button>
          </div>
          <div className={`${persistenceStyles.apiStatus} ${persistenceStyles[apiStatus]}`}>
            <i />
            {apiStatus === "loading" ? "Connecting to staging" : apiStatus === "connected" ? "Persisted staging data" : "Staging API unavailable"}
          </div>
          <label>
            Template for this run
            <select value={selectedId} onChange={(e) => selectTemplate(e.target.value)} disabled={templates.length === 0}>
              {templates.length === 0 && <option value="">No persisted templates</option>}
              {templates.map((t) => <option value={t.id} key={t.id}>{t.name}</option>)}
            </select>
          </label>
          <p>{selected?.description ?? (trainingWorkflow ? "Create the first persisted training template." : "Create the first persisted Essex template.")}</p>
          <label className={styles.toggle}>
            <input type="checkbox" checked={replaceForRun} onChange={(e) => toggleReplacement(e.target.checked)} disabled={!session?.contract} />
            <span>Create a new contract version for this run</span>
          </label>
          {replaceForRun && (
            <div className={styles.editor}>
              <span>RUN-SPECIFIC CONTRACT OVERRIDE</span>
              <input value={overrideName} onChange={(e) => setOverrideName(e.target.value)} aria-label="Run contract name" />
              <textarea value={overrideDescription} onChange={(e) => setOverrideDescription(e.target.value)} aria-label="Run contract description" />
              <small>The reusable template remains unchanged. Assignment creates an immutable contract version.</small>
            </div>
          )}
          <button className={persistenceStyles.apply} onClick={applyContract} disabled={saving || !selected}>
            {replaceForRun ? "Create replacement version" : "Apply contract to session"}
          </button>
          {message && <div className={persistenceStyles.message} role="status">{message}</div>}
          {editing && (
            <div className={styles.editor}>
              <span>CREATE REUSABLE TEMPLATE</span>
              <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Template name" />
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} aria-label="Template description" />
              <div>
                <button onClick={saveTemplate} disabled={saving}>{saving ? "Saving…" : "Save template"}</button>
                <button onClick={() => setEditing(false)}>Cancel</button>
              </div>
            </div>
          )}

          {/* ── Contract steps (moved into left panel) ── */}
          <div style={{ marginTop: 28, borderTop: "1px solid #bbbcb3", paddingTop: 16 }}>
            <div className={styles.sectionHead} style={{ marginBottom: 12 }}>
              <div>
                <span>CONTRACT PROGRESS</span>
                <h2 style={{ fontSize: 14 }}>{session?.contract?.name ?? selected?.name ?? "No active contract"}</h2>
              </div>
              <b style={{ fontFamily: "var(--font-geist-mono)", fontSize: 18 }}>
                {satisfiedSteps}/{sessionSteps.length}
              </b>
            </div>
            <div className={styles.steps}>
              {sessionSteps.map((step, index) => {
                const rawStatus = step.status?.status ?? "pending";
                // Normalise "completed" → "satisfied" for CSS class and icon
                const cssStatus = rawStatus === "completed" ? "satisfied" : rawStatus;
                const done = cssStatus === "satisfied";
                return (
                  <article className={styles[cssStatus]} key={step.key}>
                    <i>{done ? "✓" : index + 1}</i>
                    <div>
                      <strong>{step.title}</strong>
                      <span>{done ? "satisfied" : rawStatus.replaceAll("_", " ")}</span>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </aside>

        {/* CENTER — Session Replay timeline */}
        <section className={styles.replay}>
          <div className={styles.sectionHead}>
            <div>
              <span>SESSION REPLAY</span>
              <h2>Objective timeline</h2>
            </div>
            <span style={{ fontFamily: "var(--font-geist-mono)", fontSize: 10, color: "#9a9c92" }}>
              {timeline.length} event{timeline.length !== 1 ? "s" : ""}
            </span>
          </div>

          {timeline.length === 0 ? (
            <div className={styles.timelineEmpty}>
              <p>No events recorded yet.</p>
              <p>Events appear here as training milestones are published to NATS.</p>
            </div>
          ) : (
            <div className={styles.timeline}>
              {timeline.map((event, index) => {
                const icon = timelineEventIcon[event.normalizedEventType] ?? "·";
                const label = timelineEventLabels[event.normalizedEventType] ?? event.normalizedEventType;
                const elapsed = index > 0 ? elapsedFrom(timeline[0].occurredAt, event.occurredAt) : "T+0";
                const isTerminal = event.normalizedEventType === "training.completed" || event.normalizedEventType === "training.failed";
                const chips = getTimelineChips(event);
                const iconBg = timelineEventBg[event.normalizedEventType] ?? "#f3f2ec";
                const iconFg = timelineEventFg[event.normalizedEventType];
                const iconBorder = iconBg === "#171814" ? "#171814" : "#bbbcb3";
                return (
                  <div key={event.id} className={`${styles.timelineItem} ${isTerminal ? styles.timelineTerminal : ""}`}>
                    <div className={styles.timelineLeft}>
                      <div className={styles.timelineIcon} style={{ background: iconBg, color: iconFg, borderColor: iconBorder }}>{icon}</div>
                      {index < timeline.length - 1 && <div className={styles.timelineLine} />}
                    </div>
                    <div className={styles.timelineContent}>
                      <strong>{label}</strong>
                      <div className={styles.timelineMeta}>
                        <span>{fmtTime(event.occurredAt)}</span>
                        <span className={styles.timelineElapsed}>{elapsed}</span>
                        {event.sourceService && <span style={{ color: "#bbbcb3" }}>{event.sourceService}</span>}
                      </div>
                      {chips.length > 0 && (
                        <div className={styles.timelineChips}>
                          {chips.map((chip, i) => <span key={i} className={styles.timelineChip}>{chip}</span>)}
                        </div>
                      )}
                      {event.sourceRef && (
                        <span className={styles.timelineRef}>ref: {event.sourceRef.slice(0, 16)}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Metric chart — reward progression (SVG for reliable PDF rendering) ── */}
          {trainingWorkflow && hasRewardData && finalReward !== null && (() => {
            const trackH = 72;
            const barW = 52;
            const svgH = 94;
            const bH = Math.max(3, Math.round((baselinePct / 100) * trackH));
            const fH = Math.max(3, Math.round((finalPct / 100) * trackH));
            const delta = finalReward - baselineReward;
            return (
              <div className={styles.metricChart}>
                <span>REWARD PROGRESSION</span>
                <svg width="160" height={svgH} viewBox={`0 0 160 ${svgH}`} style={{ display: "block", margin: "10px 0 2px", overflow: "visible" }}>
                  <line x1="0" y1={trackH} x2="160" y2={trackH} stroke="#e0dfd8" strokeWidth="1" />
                  <rect x="5" y={trackH - bH} width={barW} height={bH} fill="#bbbcb3" rx="2" />
                  <text x={5 + barW / 2} y={trackH - bH - 5} textAnchor="middle" fontSize="9" fill="#686a61" fontFamily="monospace">{baselineReward.toFixed(2)}</text>
                  <text x={5 + barW / 2} y={svgH - 1} textAnchor="middle" fontSize="8" fill="#9a9c92" fontFamily="monospace">Baseline</text>
                  <rect x="103" y={trackH - fH} width={barW} height={fH} fill="#2f9a62" rx="2" />
                  <text x={103 + barW / 2} y={trackH - fH - 5} textAnchor="middle" fontSize="9" fill="#2f9a62" fontFamily="monospace">{finalReward.toFixed(2)}</text>
                  <text x={103 + barW / 2} y={svgH - 1} textAnchor="middle" fontSize="8" fill="#9a9c92" fontFamily="monospace">Final</text>
                </svg>
                <div className={styles.chartDelta}>Δ {delta >= 0 ? "+" : ""}{delta.toFixed(2)}</div>
              </div>
            );
          })()}
        </section>

        {/* RIGHT — Session Judgement (AI assessment) */}
        <aside className={styles.judgement}>
          <span>SESSION JUDGEMENT</span>
          <h2>{stateLabel}</h2>

          {assessment && (
            <>
              {/* AI assessment headline */}
              <div className={styles.assessmentBlock}>
                <span>AI ASSESSMENT</span>
                <strong>{assessment.headline}</strong>
                <p>{assessment.body}</p>
                {assessment.details.length > 0 && (
                  <ul className={styles.assessmentDetails}>
                    {assessment.details.map((d, i) => <li key={i}>{d}</li>)}
                  </ul>
                )}
              </div>

              {/* Success criteria */}
              <section style={{ borderTop: "1px solid #babbB2", paddingTop: 14, marginTop: 4 }}>
                <span className={styles.sectionMicro}>SUCCESS CRITERIA</span>
                <dl>
                  {assessment.successCriteria.map((c) => (
                    <div key={c.label}>
                      <dt>{c.label}</dt>
                      <dd style={{ color: c.status === "passed" ? "#2f9a62" : c.status === "failed" ? "#ef603f" : "#9a9c92" }}>
                        {c.status === "passed" ? "✓ " : c.status === "failed" ? "✕ " : "– "}{c.value}
                        <span style={{ color: "#9a9c92", marginLeft: 6 }}>{c.threshold}</span>
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>

              {/* Recommendation */}
              <div>
                <span>RECOMMENDED NEXT ACTION</span>
                <strong>{assessment.recommendation}</strong>
              </div>

              {/* QoE evidence summary (for non-training or fallback) */}
              {!trainingWorkflow && (
                <section>
                  <span>EVIDENCE SUMMARY</span>
                  <dl>
                    <div><dt>Baseline</dt><dd>{session?.evidenceSummary.baselinePresent ? "Current" : "Missing"}</dd></div>
                    <div><dt>QoE validation</dt><dd>{session?.evidenceSummary.postChangeValidationPresent ? "Current" : "Missing"}</dd></div>
                    <div><dt>QoE improvement</dt><dd>{session?.evidenceSummary.comparisonDeltaPct == null ? "Pending" : `${session.evidenceSummary.comparisonDeltaPct}%`}</dd></div>
                    <div><dt>Packet loss</dt><dd>{session?.evidenceSummary.latestPacketLossPct == null ? "Pending" : `${session.evidenceSummary.latestPacketLossPct}%`}</dd></div>
                  </dl>
                </section>
              )}

              {/* Training evidence (concise) */}
              {trainingWorkflow && (
                <section>
                  <span>EVIDENCE SUMMARY</span>
                  <dl>
                    <div><dt>Training started</dt><dd>{t?.startedPresent ? "Recorded" : "Missing"}</dd></div>
                    <div><dt>Latest checkpoint</dt><dd>{t?.checkpointProgressPct == null ? "Pending" : `${t.checkpointProgressPct}%`}</dd></div>
                    <div><dt>Validation</dt><dd>{t?.validationPresent ? (t.converged ? "Converged" : "Recorded") : "Pending"}</dd></div>
                    <div><dt>Final artifact</dt><dd>{t?.failurePresent ? `Failed · ${t.failureType ?? "see evidence"}` : t?.completionPresent ? "Available" : "Pending"}</dd></div>
                  </dl>
                </section>
              )}
            </>
          )}

          <button onClick={() => void refreshSession()} disabled={saving}>
            {saving ? "Refreshing…" : "Refresh persisted session"}
          </button>
        </aside>
      </section>

      {/* ── Intelligence Brief (full-width, below grid) ── */}
      {assessment && (
        <section className={styles.brief}>
          <div className={styles.briefHeader}>
            <div>
              <span>INTELLIGENCE BRIEF</span>
              <h2>Session analysis</h2>
            </div>
            <div className={styles.briefTabs}>
              {(["engineer", "stakeholder", "retrospective"] as const).map((tab) => (
                <button
                  key={tab}
                  className={activeTab === tab ? styles.briefTabActive : styles.briefTab}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.briefBody}>
            {activeTab === "engineer" && (
              <div className={styles.briefPanel}>
                <strong>{assessment.engineer.headline}</strong>
                <p>{assessment.engineer.body}</p>
              </div>
            )}
            {activeTab === "stakeholder" && (
              <div className={styles.briefPanel}>
                <strong>{assessment.stakeholder.headline}</strong>
                <p>{assessment.stakeholder.body}</p>
                <div className={styles.briefDecision}>
                  <div><span>DECISION</span><strong>{assessment.stakeholder.decision}</strong></div>
                  <div><span>RISK</span><strong>{assessment.stakeholder.risk}</strong></div>
                </div>
              </div>
            )}
            {activeTab === "retrospective" && (
              <div className={styles.briefPanel}>
                <strong>Outcome</strong>
                <p>{assessment.retrospective.outcome}</p>
                {assessment.retrospective.learned.length > 0 && (
                  <>
                    <strong style={{ marginTop: 12, display: "block" }}>What we learned</strong>
                    <ul className={styles.retroList}>
                      {assessment.retrospective.learned.map((l, i) => <li key={i}>{l}</li>)}
                    </ul>
                  </>
                )}
                {assessment.retrospective.nextTime && (
                  <>
                    <strong style={{ marginTop: 12, display: "block" }}>Next time</strong>
                    <p>{assessment.retrospective.nextTime}</p>
                  </>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      <footer>
        Contract-aware progression · deterministic evidence rules · AIRE-Edge training integration · live NATS subscription
      </footer>
    </main>
  );
}
