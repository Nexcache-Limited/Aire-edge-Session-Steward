import type {
  ConfidencePoint,
  SessionContract,
  SessionEvent,
  SessionHealth,
  SessionState,
} from "./session-types";

function point(event: SessionEvent, score: number, reason: string): ConfidencePoint {
  return { eventId: event.id, timestamp: event.timestamp, score, reason };
}

export function evaluateSession(
  contract: SessionContract,
  events: SessionEvent[],
): SessionState {
  let confidence = 96;
  let health: SessionHealth = "progressing";
  let staleEvidence = false;
  let missingFollowThrough = false;
  const repeatedFailureLoop = false;
  const objectiveDrift = false;
  let unproductiveStreak = 0;
  let recovered = false;
  const completedSteps = new Set<number>();
  const confidenceHistory: ConfidencePoint[] = [];

  for (const event of events) {
    if (event.stepIndex !== undefined) completedSteps.add(event.stepIndex);
    if (event.kind === "analysis" && event.evidence?.some((item) => item.startsWith("recommendation:"))) {
      completedSteps.add(contract.expectedSteps.length - 1);
    }

    if (event.meaningfulProgress) {
      unproductiveStreak = 0;
      const isRecovery = missingFollowThrough;
      confidence = Math.min(isRecovery ? confidence + 32 : confidence + 3, 96);
      if (isRecovery) {
        recovered = true;
        missingFollowThrough = false;
        staleEvidence = false;
        health = "recovered";
      } else if (!recovered) {
        health = event.expectedWait ? "legitimate_wait" : "progressing";
      }
      confidenceHistory.push(
        point(event, confidence, isRecovery ? "Contracted validation resumed" : "Objective evidence advanced"),
      );
      continue;
    }

    unproductiveStreak += 1;
    const minutesSinceHealth = Math.max(0, event.elapsedMinutes - 13);

    if (event.expectedWait && minutesSinceHealth <= 10) {
      confidence -= 6;
      health = "legitimate_wait";
      confidenceHistory.push(point(event, confidence, "Wait is still within the expected window"));
    } else if (unproductiveStreak === 2) {
      confidence -= 17;
      staleEvidence = true;
      health = "attention_needed";
      confidenceHistory.push(point(event, confidence, "Activity repeated without advancing the objective"));
    } else {
      confidence -= 24;
      staleEvidence = true;
      missingFollowThrough = true;
      health = "intervention_required";
      confidenceHistory.push(point(event, confidence, "Expected validation is missing; evidence is stale"));
    }
  }

  const nextStepIndex = Math.min(
    Array.from({ length: contract.expectedSteps.length }, (_, index) => index).find(
      (index) => !completedSteps.has(index),
    ) ?? contract.expectedSteps.length - 1,
    contract.expectedSteps.length - 1,
  );

  return {
    health,
    confidence,
    completedSteps: [...completedSteps],
    nextStepIndex,
    staleEvidence,
    missingFollowThrough,
    repeatedFailureLoop,
    objectiveDrift,
    confidenceHistory,
    intervention:
      health === "intervention_required"
        ? {
            triggerEventId: events.at(-1)?.id ?? "",
            title: "The system is healthy. The session is not.",
            explanation:
              "Deployment completed successfully, but the session objective has not progressed. No QoE validation has run since the routing change, so the current metrics are stale.",
            recommendedAction:
              "Run the low-bandwidth QoE validation suite, compare against baseline, and halt promotion if packet loss exceeds 1.2%.",
            evidenceIds: ["evt-02", "evt-04", "evt-06", "evt-07"],
          }
        : undefined,
  };
}
