-- Exactly one entry stage per workflow. The graph validator checks this too,
-- but reachability is computed FROM the entry stage — so a workflow with two
-- of them would validate against whichever one the query happened to return.
CREATE UNIQUE INDEX IF NOT EXISTS "workflow_one_entry_stage"
  ON "workflow_stages" ("workflowId")
  WHERE "isEntry";
