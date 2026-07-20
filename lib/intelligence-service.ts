import type {
  EngineerSummary,
  Retrospective,
  SessionState,
  StakeholderSummary,
} from "./session-types";

export interface IntelligenceOutput {
  engineer: EngineerSummary;
  stakeholder: StakeholderSummary;
  retrospective: Retrospective;
  reasoning: string;
}

/**
 * Demo-safe reasoning boundary. Replace this implementation with a GPT-5.6
 * provider adapter; the UI and deterministic engine do not need to change.
 */
export function generateIntelligence(state: SessionState): IntelligenceOutput {
  const isRecovered = state.health === "recovered";
  const needsAction = state.health === "intervention_required";
  const needsAttention = state.health === "attention_needed";
  const recommendationReady = state.completedSteps.length >= 6;

  return {
    reasoning: recommendationReady
      ? "The evidence is current and complete: validation passed, QoE improved by 10.9%, and packet loss remained below the 1.2% guardrail. Promotion is now supported."
      : isRecovered
      ? "Confidence recovered because the required validation is running and fresh evidence is advancing the session objective again."
      : needsAction
        ? "Healthy deployment telemetry is not meaningful progress toward the stated QoE objective. The missing validation makes existing evidence stale."
        : needsAttention
          ? "Infrastructure remains healthy, but the expected QoE validation has not started. Objective progress is slowing and the evidence gap is approaching the intervention threshold."
        : "Observed activity remains aligned with the next contracted step and inside its expected time window.",
    engineer: {
      headline: recommendationReady
        ? "Evidence supports controlled promotion"
        : isRecovered
        ? "Validation restored objective progress"
        : needsAction
          ? "QoE validation is blocking the decision"
          : needsAttention
            ? "Validation evidence is now overdue"
          : "Execution remains contract-aligned",
      body: recommendationReady
        ? "The rerun completed across all bandwidth tiers. QoE increased from 71.4 to 79.2 (+10.9%), while packet loss held at 0.9%—inside the 1.2% guardrail."
        : isRecovered
        ? "edge-route-v18 improved QoE from 71.4 to 79.2 (+10.9%) while packet loss held at 0.9%. All three bandwidth tiers passed."
        : needsAction
          ? "The deploy and health-check stages completed, but qoe-suite has not run against the changed routing policy. Two deploy polls added no decision-grade evidence."
          : needsAttention
            ? "Deployment and health checks passed, but a second status poll produced no new QoE evidence. Start the validation suite before the evidence-age threshold is breached."
          : "Completed evidence advances the expected sequence; no threshold or ordering violation is active.",
      details: recommendationReady
        ? ["QoE: 79.2 · +10.9%", "Packet loss: 0.9% · within guardrail", "Recommendation: promote to 25%"]
        : isRecovered
        ? ["QoE delta: +10.9%", "Packet loss: 0.9% ≤ 1.2%", "Next: promote to 25% cohort"]
        : needsAttention
          ? ["Infrastructure: healthy", "Fresh objective evidence: overdue", "Intervention threshold: approaching"]
          : ["Expected next: QoE validation rerun", "Evidence age: 24 minutes", "Promotion guardrail: packet loss ≤ 1.2%"],
    },
    stakeholder: {
      headline: recommendationReady ? "The evidence supports a controlled rollout" : isRecovered ? "The trial is back on track" : needsAction ? "The promotion decision is blocked" : needsAttention ? "The trial is beginning to slip" : "The trial is moving as planned",
      body: recommendationReady
        ? "The new routing policy improved viewer experience across every tested bandwidth tier without pushing packet loss beyond the agreed limit."
        : isRecovered
        ? "The team completed the missing test and confirmed that the new routing policy improves viewer experience without creating unacceptable packet loss."
        : needsAction
          ? "The rollout is technically healthy, but the test needed to prove customer benefit has not run. We should not promote the change yet."
          : needsAttention
            ? "The deployment is stable, but the evidence needed to confirm customer benefit is late. The team still has time to recover before the decision is formally blocked."
          : "The technical work completed so far is producing the evidence needed for a safe decision.",
      businessImpact: recommendationReady || isRecovered
        ? "Proceed with a controlled 25% rollout while monitoring the same quality guardrails."
        : "Hold promotion until fresh validation confirms customer benefit and risk.",
      businessStatus: recommendationReady ? "Ready for controlled promotion" : isRecovered ? "Validation restored" : needsAction ? "Blocked pending customer-impact evidence" : needsAttention ? "At risk · evidence delayed" : "Evidence gathering on plan",
      deployment: "Healthy · 12/12 edge nodes",
      validation: recommendationReady ? "Passed · QoE +10.9%" : isRecovered ? "Running · fresh evidence arriving" : needsAction ? "Missing · required rerun not started" : needsAttention ? "Overdue · not yet started" : "Pending in the agreed sequence",
      deliveryConfidence: recommendationReady ? "High · evidence complete" : isRecovered ? "Rising · evidence is current" : needsAction ? "Low · evidence is stale" : needsAttention ? "Falling · evidence delayed" : "Stable · work is on plan",
      decision: recommendationReady ? "Promote to a 25% traffic cohort" : "Do not promote yet",
      risk: recommendationReady ? "Low · packet loss is 0.9%, within guardrail" : needsAttention ? "Rising · customer benefit remains unproven" : "Customer benefit is unproven despite a healthy deployment",
      recommendedAction: recommendationReady ? "Approve the 25% rollout and retain the 1.2% packet-loss stop condition." : needsAttention ? "Ask the experiment owner to start validation before the intervention threshold is reached." : "Hold the release decision until low-bandwidth validation produces fresh evidence.",
    },
    retrospective: {
      outcome: isRecovered ? "Recovered after a 24-minute follow-through gap; all success criteria met." : "Session remains open pending objective validation.",
      learned: [
        "Infrastructure health is necessary but not evidence of QoE improvement.",
        "Post-deploy validation should be an explicit automated handoff.",
        "Repeated status polling is a useful early signal of stalled intent.",
      ],
      nextTime: "Auto-launch qoe-suite after health checks pass and page the experiment owner after a 10-minute validation gap.",
    },
  };
}
