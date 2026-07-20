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

  return {
    reasoning: isRecovered
      ? "Confidence recovered because the missing contracted validation began and produced fresh objective evidence."
      : needsAction
        ? "Healthy deployment telemetry is not meaningful progress toward the stated QoE objective. The missing validation makes existing evidence stale."
        : "Observed activity remains aligned with the next contracted step and inside its expected time window.",
    engineer: {
      headline: isRecovered
        ? "Validation restored objective progress"
        : needsAction
          ? "QoE validation is the blocking edge"
          : "Execution remains contract-aligned",
      body: isRecovered
        ? "edge-route-v18 improved QoE from 71.4 to 79.2 (+10.9%) while packet loss held at 0.9%. All three bandwidth tiers passed."
        : needsAction
          ? "The deploy and health-check stages completed, but qoe-suite has not run against the changed routing policy. Two deploy polls added no decision-grade evidence."
          : "Completed evidence advances the expected sequence; no threshold or ordering violation is active.",
      details: isRecovered
        ? ["QoE delta: +10.9%", "Packet loss: 0.9% ≤ 1.2%", "Next: promote to 25% cohort"]
        : ["Expected next: QoE validation rerun", "Evidence age: 24 minutes", "Promotion guardrail: packet loss ≤ 1.2%"],
    },
    stakeholder: {
      headline: isRecovered ? "The trial is back on track" : needsAction ? "A decision is currently blocked" : "The trial is moving as planned",
      body: isRecovered
        ? "The team completed the missing test and confirmed that the new routing policy improves viewer experience without creating unacceptable packet loss."
        : needsAction
          ? "The rollout is technically healthy, but the test needed to prove customer benefit has not run. We should not promote the change yet."
          : "The technical work completed so far is producing the evidence needed for a safe decision.",
      businessImpact: isRecovered
        ? "Proceed with a controlled 25% rollout while monitoring the same quality guardrails."
        : "Hold promotion until fresh validation confirms customer benefit and risk.",
      businessStatus: isRecovered ? "Ready for controlled promotion" : needsAction ? "Blocked on proof of customer value" : "Evidence gathering in progress",
      deployment: "Healthy · 12/12 edge nodes",
      validation: isRecovered ? "Passed · +10.9% QoE" : needsAction ? "Missing · not rerun after change" : "Pending in contracted sequence",
      deliveryConfidence: isRecovered ? "High · evidence is current" : needsAction ? "Low · objective evidence is stale" : "Moderate · on plan",
      decision: isRecovered ? "Promote to a 25% cohort" : "Do not promote yet",
      risk: isRecovered ? "Low · packet loss remains below 1.2%" : "Customer benefit is unproven despite a healthy deployment",
      recommendedAction: isRecovered ? "Approve controlled promotion with the same QoE guardrails." : "Hold the release decision until the low-bandwidth validation produces fresh evidence.",
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
