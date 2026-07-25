"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import styles from "./operator.module.css";
import persistenceStyles from "./persistence.module.css";

type StepStatus =
  | "pending"
  | "satisfied"
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

type SessionDetail = {
  id: string;
  objective: string;
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
  };
  lastAssessment: {
    confidence: number;
    assessedAt: string;
  } | null;
};

const essexTemplateDefinition = {
  name: "Essex QoE promotion",
  description: "Validate an edge-routing change before cohort promotion.",
  objectiveType: "qoe-promotion",
  steps: [
    {
      key: "baseline",
      title: "Capture baseline QoE",
      expectedEventType: "qoe.baseline.completed",
      expectedEvidenceKinds: ["baseline_qoe"],
      freshnessRequirementSeconds: 1800,
    },
    {
      key: "deployment",
      title: "Deploy routing configuration",
      expectedEventType: "deployment.completed",
    },
    {
      key: "health",
      title: "Verify infrastructure health",
      expectedEventType: "health.check.passed",
    },
    {
      key: "validation",
      title: "Run post-change validation",
      expectedEventType: "qoe.validation.completed",
      expectedEvidenceKinds: ["post_change_qoe"],
      freshnessRequirementSeconds: 900,
      maxWaitSeconds: 480,
      operatorRationale:
        "Infrastructure health does not prove that the routing change improved QoE.",
    },
    {
      key: "comparison",
      title: "Compare against baseline",
      expectedEventType: "qoe.comparison.generated",
      expectedEvidenceKinds: ["qoe_comparison"],
    },
    {
      key: "recommendation",
      title: "Issue promotion recommendation",
      expectedEventType: "qoe.recommendation.generated",
      expectedEvidenceKinds: ["promotion_recommendation"],
    },
  ] satisfies TemplateStep[],
  successCriteria: [
    {
      key: "qoe-improvement",
      metricName: "qoe_improvement_pct",
      operator: ">=",
      thresholdValue: 5,
      unit: "percent",
    },
    {
      key: "packet-loss",
      metricName: "packet_loss_pct",
      operator: "<=",
      thresholdValue: 1,
      unit: "percent",
    },
  ],
};

const stateLabels: Record<string, string> = {
  progressing: "Progressing",
  attention_needed: "Attention needed",
  intervention_required: "Intervention required",
  recovered: "Recovered",
  completed: "Promotion justified",
  failed: "Intervention required",
};

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
  const [replaceForRun, setReplaceForRun] = useState(false);
  const [overrideName, setOverrideName] = useState("");
  const [overrideDescription, setOverrideDescription] = useState("");
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(`${essexTemplateDefinition.name} — strict`);
  const [description, setDescription] = useState(
    "Require fresh validation across all bandwidth tiers.",
  );
  const [apiStatus, setApiStatus] = useState<
    "loading" | "connected" | "unavailable"
  >("loading");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const selected = useMemo(
    () => templates.find((template) => template.id === selectedId) ?? null,
    [selectedId, templates],
  );
  const state = session?.progression.state ?? "progressing";
  const stateLabel = session ? (stateLabels[state] ?? state) : "Connecting";
  const confidence = session?.lastAssessment?.confidence;
  const sessionSteps =
    session?.contract?.steps ??
    selected?.steps.map((step, order) => ({ ...step, order, status: null })) ??
    [];

  useEffect(() => {
    let active = true;
    const selectionKey = `aire-steward-template:${sessionId}`;

    Promise.all([
      fetch("/api/steward/templates", { cache: "no-store" }),
      fetch(`/api/steward/sessions/${sessionId}`, { cache: "no-store" }),
    ])
      .then(async ([templatesResponse, sessionResponse]) => {
        if (!templatesResponse.ok || !sessionResponse.ok) {
          const failed = !templatesResponse.ok
            ? templatesResponse
            : sessionResponse;
          const error = (await failed.json()) as { error?: string; message?: string };
          throw new Error(error.message ?? error.error ?? "Staging data is unavailable.");
        }
        return Promise.all([
          templatesResponse.json() as Promise<Template[]>,
          sessionResponse.json() as Promise<SessionDetail>,
        ]);
      })
      .then(([records, detail]) => {
        if (!active) return;
        setTemplates(records);
        setSession(detail);
        setApiStatus("connected");
        const stored = window.localStorage.getItem(selectionKey);
        const preferred =
          detail.contract?.templateId &&
          records.some((template) => template.id === detail.contract?.templateId)
            ? detail.contract.templateId
            : stored && records.some((template) => template.id === stored)
              ? stored
              : records[0]?.id ?? "";
        setSelectedId(preferred);
      })
      .catch((error) => {
        if (!active) return;
        setApiStatus("unavailable");
        setMessage(
          error instanceof Error ? error.message : "Staging data is unavailable.",
        );
      });

    return () => {
      active = false;
    };
  }, [sessionId]);

  async function refreshSession(successMessage = "Persisted session state refreshed.") {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/steward/sessions/${sessionId}`, {
        cache: "no-store",
      });
      const result = (await response.json()) as SessionDetail & {
        error?: string;
        message?: string;
      };
      if (!response.ok) {
        throw new Error(result.message ?? result.error ?? "Session could not be refreshed.");
      }
      setSession(result);
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

  async function saveTemplate() {
    if (!name.trim()) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/steward/templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...essexTemplateDefinition,
          name: name.trim(),
          description: description.trim(),
        }),
      });
      const result = (await response.json()) as Template & {
        error?: string;
        message?: string;
      };
      if (!response.ok) {
        throw new Error(result.message ?? result.error ?? "Template could not be saved.");
      }
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
    if (!selected) {
      setMessage("Create or select a persisted template before assigning it.");
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
          ...(replaceForRun && overrideName.trim()
            ? { name: overrideName.trim() }
            : {}),
          ...(replaceForRun && overrideDescription.trim()
            ? { description: overrideDescription.trim() }
            : {}),
        }),
      });
      const result = (await response.json()) as {
        contract?: { version: number };
        error?: string;
        message?: string;
      };
      if (!response.ok || !result.contract) {
        throw new Error(result.message ?? result.error ?? "Contract could not be assigned.");
      }
      setReplaceForRun(false);
      await refreshSession(
        `Contract v${result.contract.version} assigned to the live session.`,
      );
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
      setOverrideDescription(
        session?.contract?.description ?? selected?.description ?? "",
      );
    }
  }

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
          <p>LIVE SESSION · UNIVERSITY OF ESSEX</p>
          <h1>{session?.objective ?? "Loading the persisted session objective…"}</h1>
          <span>
            Objective-aware judgement over deployment, health, QoE, and evidence
            lifecycle events.
          </span>
        </div>
        <div className={`${styles.state} ${styles[state] ?? ""}`}>
          <span>SESSION PROGRESSION</span>
          <strong>{stateLabel}</strong>
          <i>
            {confidence === undefined
              ? "Awaiting assessment"
              : `${confidence}% delivery confidence`}
          </i>
        </div>
      </section>

      <section className={styles.grid}>
        <aside className={styles.templates}>
          <div className={styles.sectionHead}>
            <div>
              <span>CONTRACT TEMPLATE</span>
              <h2>Definition of done</h2>
            </div>
            <button onClick={() => setEditing(true)}>New template</button>
          </div>
          <div
            className={`${persistenceStyles.apiStatus} ${persistenceStyles[apiStatus]}`}
          >
            <i />
            {apiStatus === "loading"
              ? "Connecting to staging"
              : apiStatus === "connected"
                ? "Persisted staging data"
                : "Staging API unavailable"}
          </div>
          <label>
            Template for this run
            <select
              value={selectedId}
              onChange={(event) => selectTemplate(event.target.value)}
              disabled={templates.length === 0}
            >
              {templates.length === 0 && <option value="">No persisted templates</option>}
              {templates.map((template) => (
                <option value={template.id} key={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>
          <p>{selected?.description ?? "Create the first persisted Essex template."}</p>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={replaceForRun}
              onChange={(event) => toggleReplacement(event.target.checked)}
              disabled={!session?.contract}
            />
            <span>Create a new contract version for this run</span>
          </label>
          {replaceForRun && (
            <div className={styles.editor}>
              <span>RUN-SPECIFIC CONTRACT OVERRIDE</span>
              <input
                value={overrideName}
                onChange={(event) => setOverrideName(event.target.value)}
                aria-label="Run contract name"
              />
              <textarea
                value={overrideDescription}
                onChange={(event) => setOverrideDescription(event.target.value)}
                aria-label="Run contract description"
              />
              <small>
                The reusable template remains unchanged. Assignment creates an
                immutable contract version.
              </small>
            </div>
          )}
          <button
            className={persistenceStyles.apply}
            onClick={applyContract}
            disabled={saving || !selected}
          >
            {replaceForRun ? "Create replacement version" : "Apply contract to session"}
          </button>
          {message && (
            <div className={persistenceStyles.message} role="status">
              {message}
            </div>
          )}
          {editing && (
            <div className={styles.editor}>
              <span>CREATE REUSABLE TEMPLATE</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                aria-label="Template name"
              />
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                aria-label="Template description"
              />
              <div>
                <button onClick={saveTemplate} disabled={saving}>
                  {saving ? "Saving…" : "Save template"}
                </button>
                <button onClick={() => setEditing(false)}>Cancel</button>
              </div>
            </div>
          )}
        </aside>

        <section className={styles.contract}>
          <div className={styles.sectionHead}>
            <div>
              <span>CONTRACT PROGRESS</span>
              <h2>{session?.contract?.name ?? selected?.name ?? "No active contract"}</h2>
            </div>
            <b>
              {session?.evidenceSummary.satisfiedContractSteps ?? 0}/
              {session?.evidenceSummary.totalContractSteps ?? sessionSteps.length}
            </b>
          </div>
          <div className={styles.steps}>
            {sessionSteps.map((step, index) => {
              const status = step.status?.status ?? "pending";
              return (
                <article className={styles[status]} key={step.key}>
                  <i>{status === "satisfied" ? "✓" : index + 1}</i>
                  <div>
                    <strong>{step.title}</strong>
                    <span>{status.replaceAll("_", " ")}</span>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <aside className={styles.judgement}>
          <span>OPERATOR DECISION</span>
          <h2>{stateLabel}</h2>
          <p>
            {session?.progression.rationaleSummary ??
              "Waiting for persisted session state."}
          </p>
          <div>
            <span>RECOMMENDED NEXT ACTION</span>
            <strong>
              {session?.progression.recommendedNextAction ??
                "Connect the staging Session Steward service."}
            </strong>
          </div>
          <section>
            <span>EVIDENCE SUMMARY</span>
            <dl>
              <div>
                <dt>Baseline</dt>
                <dd>{session?.evidenceSummary.baselinePresent ? "Current" : "Missing"}</dd>
              </div>
              <div>
                <dt>QoE validation</dt>
                <dd>
                  {session?.evidenceSummary.postChangeValidationPresent
                    ? "Current"
                    : "Missing"}
                </dd>
              </div>
              <div>
                <dt>QoE improvement</dt>
                <dd>
                  {session?.evidenceSummary.comparisonDeltaPct == null
                    ? "Pending"
                    : `${session.evidenceSummary.comparisonDeltaPct}%`}
                </dd>
              </div>
              <div>
                <dt>Packet loss</dt>
                <dd>
                  {session?.evidenceSummary.latestPacketLossPct == null
                    ? "Pending"
                    : `${session.evidenceSummary.latestPacketLossPct}%`}
                </dd>
              </div>
            </dl>
          </section>
          <button onClick={() => void refreshSession()} disabled={saving}>
            {saving ? "Refreshing…" : "Refresh persisted session"}
          </button>
        </aside>
      </section>
      <footer>
        Contract-aware progression · deterministic evidence rules · QoE consumer
        implemented · evidence publisher pending
      </footer>
    </main>
  );
}
