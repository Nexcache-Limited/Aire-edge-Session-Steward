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
  workflowId?: string;
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
  description?: string;
  objectiveId?: string;
  objectiveType?: string;
  templateId?: string;
  createdAt: string;
}

export interface SessionContractStepRecord {
  id: string;
  contractId: string;
  stepOrder: number;
  stepKey: string;
  title: string;
  description?: string;
  expectedEventType: string;
  expectedEvidenceKinds?: SessionEvidenceKind[];
  freshnessRequirementSeconds?: number;
  successCriterionKey?: string;
  operatorRationale?: string;
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
  environmentId?: string;
  occurredAt: string;
  payload: Record<string, unknown>;
  ingestedAt: string;
}

export interface SessionEvidenceRecord {
  id: string;
  sessionId: string;
  tenantId?: string;
  evidenceType: string;
  evidenceKind?: SessionEvidenceKind;
  sourceService?: 'qoe-service' | 'evidence-service';
  sourceEventId?: string;
  sourceRef?: string;
  metricSet?: SessionEvidenceMetricSet;
  artifact?: SessionEvidenceArtifact;
  freshnessExpiresAt?: string;
  recordedAt?: string;
  value: Record<string, unknown>;
  createdAt: string;
}

export type SessionEvidenceKind =
  | 'baseline_qoe'
  | 'post_change_qoe'
  | 'qoe_comparison'
  | 'promotion_recommendation'
  | 'artifact'
  | 'citation'
  | 'note';

export interface SessionEvidenceMetricSet {
  qoeScore?: number;
  packetLossPct?: number;
  latencyMs?: number;
  jitterMs?: number;
  bandwidthTier?: 'low' | 'medium' | 'high';
  bandwidthTiers?: number;
  cohortPct?: number;
  comparisonDeltaPct?: number;
}

export interface SessionEvidenceArtifact {
  artifactType?: string;
  uri?: string;
  title?: string;
  citationKey?: string;
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

export type ContractStepStatus =
  | 'pending'
  | 'satisfied'
  | 'stale'
  | 'failed'
  | 'attention_needed';

export interface ContractStepAssessment {
  stepKey: string;
  title: string;
  status: ContractStepStatus;
  evidenceIds: string[];
  explanation: string;
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
    contractSteps?: ContractStepAssessment[];
    rationaleSummary?: string;
    recommendedNextAction?: string;
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
