export type SessionState =
  | 'progressing'
  | 'legitimate_wait'
  | 'attention_needed'
  | 'intervention_required'
  | 'recovered'
  | 'completed'
  | 'failed';

export interface SessionRecord {
  id: string;
  tenantId: string;
  environmentId?: string;
  objective: string;
  workflowType: string;
  status: string;
  activeContractId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SessionContractRecord {
  id: string;
  sessionId: string;
  version: number;
  name: string;
  createdAt: string;
}

export interface SessionContractStepRecord {
  id: string;
  contractId: string;
  stepOrder: number;
  stepKey: string;
  title: string;
  expectedEventType: string;
  maxWaitSeconds?: number;
  required: boolean;
  successRule: Record<string, unknown>;
  createdAt: string;
}

export type SessionSuccessCriterionOperator = '>=' | '<=' | '>' | '<' | '=';

export interface SessionSuccessCriterionRecord {
  id: string;
  contractId: string;
  criterionKey: string;
  metricName: string;
  operator: SessionSuccessCriterionOperator;
  thresholdValue?: number;
  unit?: string;
  createdAt: string;
}

export interface SessionEventRecord {
  id: string;
  sessionId?: string;
  tenantId: string;
  sourceService: string;
  sourceEventType: string;
  normalizedEventType: string;
  sourceRef?: string;
  workflowId?: string;
  occurredAt: string;
  payload: Record<string, unknown>;
  ingestedAt: string;
}

export interface SessionEvidenceRecord {
  id: string;
  sessionId: string;
  evidenceType: string;
  sourceEventId?: string;
  freshnessExpiresAt?: string;
  value: Record<string, unknown>;
  createdAt: string;
}

export interface SessionAssessmentSignal {
  code: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  evidenceIds?: string[];
}

export interface SessionCriterionAssessment {
  criterionKey: string;
  status: 'met' | 'not_met' | 'pending';
  observedValue?: number;
  thresholdValue?: number;
}

export interface SessionAssessmentRecord {
  id: string;
  sessionId: string;
  state: SessionState;
  confidence: number;
  expectedStepKey?: string;
  completionPercent: number;
  rationale: {
    signals: SessionAssessmentSignal[];
    staleEvidenceAgeSeconds?: number;
    repeatedNonProgressCount?: number;
    successCriteria?: SessionCriterionAssessment[];
  };
  assessedAt: string;
}

export type SessionAssessmentDraft = Omit<SessionAssessmentRecord, 'id'>;

export interface SessionInterventionRecord {
  id: string;
  sessionId: string;
  status: 'open' | 'resolved' | 'dismissed';
  recommendationText: string;
  triggerReason: Record<string, unknown>;
  evidenceIds: string[];
  createdAt: string;
  resolvedAt?: string;
}
