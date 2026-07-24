const tenantId = '10000000-0000-4000-8000-000000000001';
const sessionId = '30000000-0000-4000-8000-000000000001';

export const evidenceLifecycleFixtures = [
  {
    event_id: 'fixture-artifact-1',
    event_type: 'evidence.recorded',
    tenant_id: tenantId,
    session_id: sessionId,
    timestamp: '2026-07-24T09:00:00.000Z',
    payload: {
      artifact: {
        artifact_type: 'qoe-validation',
        uri: 's3://aire-evidence/essex/qoe-validation.json',
        title: 'University of Essex QoE validation',
      },
    },
  },
  {
    event_id: 'fixture-citation-1',
    event_type: 'evidence.citation.linked',
    tenant_id: tenantId,
    session_id: sessionId,
    timestamp: '2026-07-24T09:01:00.000Z',
    payload: {
      artifact: {
        citation_key: 'essex-qoe-validation',
        uri: 's3://aire-evidence/essex/qoe-validation.json',
      },
    },
  },
] as const;
