export type StewardSourceService =
  | 'deployment-service'
  | 'telemetry-service'
  | 'qoe-service'
  | 'evidence-service';

export interface StewardEventEnvelope {
  eventId: string;
  tenantId: string;
  sessionId?: string;
  sourceService: StewardSourceService;
  sourceEventType: string;
  normalizedEventType: string;
  sourceRef?: string;
  environmentId?: string;
  workflowId?: string;
  occurredAt: string;
  payload: Record<string, unknown>;
}
