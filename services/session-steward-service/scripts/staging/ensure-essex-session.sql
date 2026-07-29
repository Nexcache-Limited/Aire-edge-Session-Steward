\set ON_ERROR_STOP on

\if :{?session_id}
\else
  \echo 'ERROR: session_id is required'
  \quit 1
\endif
\if :{?tenant_id}
\else
  \echo 'ERROR: tenant_id is required'
  \quit 1
\endif
\if :{?environment_id}
\else
  \echo 'ERROR: environment_id is required'
  \quit 1
\endif
\if :{?workflow_id}
\else
  \echo 'ERROR: workflow_id is required'
  \quit 1
\endif

BEGIN;

INSERT INTO steward_sessions (
  id,
  tenant_id,
  environment_id,
  objective,
  workflow_type,
  workflow_id,
  status
)
VALUES (
  :'session_id'::uuid,
  :'tenant_id'::uuid,
  :'environment_id'::uuid,
  'Improve video QoE under constrained bandwidth without increasing packet loss.',
  'edge_rollout_qoe_validation',
  :'workflow_id',
  'active'
)
ON CONFLICT (id) DO NOTHING;

SELECT EXISTS (
  SELECT 1
  FROM steward_sessions
  WHERE id = :'session_id'::uuid
    AND tenant_id = :'tenant_id'::uuid
    AND environment_id = :'environment_id'::uuid
    AND workflow_id = :'workflow_id'
    AND status = 'active'
) AS essex_session_ready
\gset

\if :essex_session_ready
\else
  ROLLBACK;
  \echo 'ERROR: the requested session ID exists with different correlation fields'
  \quit 1
\endif

SELECT
  id,
  tenant_id,
  environment_id,
  workflow_type,
  workflow_id,
  status,
  active_contract_id
FROM steward_sessions
WHERE id = :'session_id'::uuid
  AND tenant_id = :'tenant_id'::uuid
  AND environment_id = :'environment_id'::uuid
  AND workflow_id = :'workflow_id'
  AND status = 'active';

COMMIT;
