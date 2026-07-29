\set ON_ERROR_STOP on

\if :{?training_session_id}
\else
  \echo 'ERROR: training_session_id is required'
  \quit 1
\endif
\if :{?tenant_id}
\else
  \echo 'ERROR: tenant_id is required'
  \quit 1
\endif

BEGIN;

INSERT INTO steward_sessions (
  id,
  tenant_id,
  objective,
  workflow_type,
  workflow_id,
  status
)
VALUES (
  :'training_session_id'::uuid,
  :'tenant_id'::uuid,
  'Train and validate a converged AIRE-Edge policy with a retained artifact.',
  'model_training',
  :'training_session_id',
  'active'
)
ON CONFLICT (id) DO NOTHING;

SELECT EXISTS (
  SELECT 1
  FROM steward_sessions
  WHERE id = :'training_session_id'::uuid
    AND tenant_id = :'tenant_id'::uuid
    AND workflow_type = 'model_training'
    AND status = 'active'
) AS training_session_ready
\gset

\if :training_session_ready
\else
  ROLLBACK;
  \echo 'ERROR: the training session ID exists with different correlation fields'
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
WHERE id = :'training_session_id'::uuid
  AND tenant_id = :'tenant_id'::uuid;

COMMIT;
