export type SessionHealth =
  | "progressing"
  | "legitimate_wait"
  | "attention_needed"
  | "intervention_required"
  | "recovered";

export type EventKind =
  | "milestone"
  | "change"
  | "check"
  | "poll"
  | "clock"
  | "validation"
  | "analysis";

export interface SuccessCriterion {
  id: string;
  label: string;
  threshold: string;
}

export interface SessionContract {
  id: string;
  name: string;
  objective: string;
  expectedSteps: string[];
  successCriteria: SuccessCriterion[];
}

export interface SessionEvent {
  id: string;
  timestamp: string;
  elapsedMinutes: number;
  kind: EventKind;
  title: string;
  detail: string;
  source: string;
  stepIndex?: number;
  outcome?: "success" | "neutral" | "warning";
  meaningfulProgress: boolean;
  expectedWait?: boolean;
  evidence?: string[];
}

export interface ConfidencePoint {
  eventId: string;
  timestamp: string;
  score: number;
  reason: string;
}

export interface Intervention {
  triggerEventId: string;
  title: string;
  explanation: string;
  recommendedAction: string;
  evidenceIds: string[];
}

export interface SessionState {
  health: SessionHealth;
  confidence: number;
  completedSteps: number[];
  nextStepIndex: number;
  staleEvidence: boolean;
  missingFollowThrough: boolean;
  repeatedFailureLoop: boolean;
  objectiveDrift: boolean;
  confidenceHistory: ConfidencePoint[];
  intervention?: Intervention;
}

export interface EngineerSummary {
  headline: string;
  body: string;
  details: string[];
}

export interface StakeholderSummary {
  headline: string;
  body: string;
  businessImpact: string;
}

export interface Retrospective {
  outcome: string;
  learned: string[];
  nextTime: string;
}
