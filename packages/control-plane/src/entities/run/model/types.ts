export type ControlPlaneRun = {
  id: string
  kind: string
  role?: string | null
  mode?: string | null
  status?: string | null
  created_at?: string | null
  started_at?: string | null
  finished_at?: string | null
  pid?: number | null
  exit_code?: number | null
  runtime_run_id?: string | null
  notes_path?: string | null
  stdout_path?: string | null
  stderr_path?: string | null
  runtime_result?: unknown
  notes_excerpt?: string | null
  stdout_tail?: string | null
  stderr_tail?: string | null
  agent_run?: unknown
  trigger?: string | null
  ts_started?: string | null
}
