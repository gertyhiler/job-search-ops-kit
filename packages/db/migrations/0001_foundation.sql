CREATE TABLE IF NOT EXISTS __migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vacancy (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  source_id TEXT,
  url TEXT,
  company TEXT NOT NULL,
  title TEXT NOT NULL,
  location TEXT,
  remote TEXT NOT NULL,
  salary_min REAL,
  salary_max REAL,
  currency TEXT,
  tags_json TEXT NOT NULL,
  jd_markdown_path TEXT,
  match_score REAL,
  match_rationale TEXT,
  status TEXT NOT NULL,
  first_seen_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS application (
  id TEXT PRIMARY KEY,
  vacancy_id TEXT NOT NULL,
  resume_version_id TEXT,
  cover_letter_id TEXT,
  channel TEXT NOT NULL,
  status TEXT NOT NULL,
  applied_at TEXT,
  confidence REAL,
  auto_sent INTEGER NOT NULL,
  dry_run INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS application_event (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  ts TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload_json TEXT,
  evidence_ref TEXT,
  emitted_by TEXT
);

CREATE TABLE IF NOT EXISTS resume_version (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  base_commit_sha TEXT NOT NULL,
  patches_json_path TEXT,
  rendered_pdf_path TEXT,
  targeted_domain TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cover_letter (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  style TEXT,
  tone TEXT,
  markdown TEXT NOT NULL,
  sha TEXT NOT NULL,
  generated_by_model TEXT
);

CREATE TABLE IF NOT EXISTS interview (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  scheduled_at TEXT NOT NULL,
  duration_min REAL,
  format TEXT,
  notes_path TEXT,
  verdict TEXT,
  questions_asked_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS strategy_change (
  id TEXT PRIMARY KEY,
  ts TEXT NOT NULL,
  before_json TEXT NOT NULL,
  after_json TEXT NOT NULL,
  rationale TEXT NOT NULL,
  evidence_refs_json TEXT NOT NULL,
  expected_impact TEXT,
  confidence REAL NOT NULL,
  reversibility TEXT NOT NULL,
  proposed_by TEXT,
  decision TEXT,
  applied_version TEXT
);

CREATE TABLE IF NOT EXISTS agent_run (
  id TEXT PRIMARY KEY,
  ts_started TEXT NOT NULL,
  ts_finished TEXT,
  scheduled_for TEXT,
  role TEXT,
  model TEXT,
  prompt_sha TEXT,
  schedule_id TEXT,
  runner_adapter TEXT,
  run_mode TEXT,
  reasoning_effort TEXT,
  allow_tools INTEGER,
  fallback_model TEXT,
  exit_code INTEGER,
  duration_ms INTEGER,
  tool_calls_count INTEGER,
  changed_paths_json TEXT NOT NULL,
  pty_session_id TEXT,
  approval_state TEXT,
  escalation_reason TEXT,
  capabilities_used_json TEXT NOT NULL,
  dry_run INTEGER,
  catchup INTEGER,
  trigger TEXT,
  notes_path TEXT
);

CREATE TABLE IF NOT EXISTS schedule (
  id TEXT PRIMARY KEY,
  cron TEXT NOT NULL,
  role TEXT NOT NULL,
  model TEXT,
  reasoning_effort TEXT,
  prompt_file TEXT NOT NULL,
  mcp_profile TEXT,
  dry_run INTEGER NOT NULL,
  enabled INTEGER NOT NULL,
  next_run_at TEXT NOT NULL,
  last_run_at TEXT,
  last_status TEXT,
  catchup_policy TEXT NOT NULL,
  max_staleness_sec INTEGER,
  fails_in_a_row INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_application_vacancy_id ON application(vacancy_id);
CREATE INDEX IF NOT EXISTS idx_application_event_application_id ON application_event(application_id);
CREATE INDEX IF NOT EXISTS idx_interview_application_id ON interview(application_id);
CREATE INDEX IF NOT EXISTS idx_schedule_next_run_at ON schedule(next_run_at);
