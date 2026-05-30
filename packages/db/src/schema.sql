-- job-search-ops-kit SQLite schema (system of record for operational data).
-- Idempotent: safe to run on every startup.

CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  external_id TEXT,
  name TEXT NOT NULL,
  url TEXT,
  normalized_name TEXT NOT NULL,
  is_blacklisted INTEGER NOT NULL DEFAULT 0,
  is_target INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (source, normalized_name)
);

CREATE TABLE IF NOT EXISTS vacancies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  url TEXT NOT NULL,
  company_id INTEGER REFERENCES companies (id),
  title TEXT NOT NULL,
  description TEXT,
  key_skills_json TEXT,
  salary_min REAL,
  salary_max REAL,
  salary_currency TEXT,
  salary_gross INTEGER,
  location TEXT,
  remote_type TEXT,
  schedule TEXT,
  employment TEXT,
  experience TEXT,
  raw_payload_json TEXT,
  normalized_payload_json TEXT,
  content_hash TEXT NOT NULL,
  fit_score REAL,
  salary_score REAL,
  risk_score REAL,
  priority_score REAL,
  apply_mode TEXT,
  score_reasons_json TEXT,
  score_risks_json TEXT,
  pipeline_status TEXT NOT NULL DEFAULT 'normalized',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT,
  archived_at TEXT,
  UNIQUE (source, external_id)
);

CREATE INDEX IF NOT EXISTS idx_vacancies_status ON vacancies (pipeline_status);
CREATE INDEX IF NOT EXISTS idx_vacancies_company ON vacancies (company_id);

CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vacancy_id INTEGER NOT NULL REFERENCES vacancies (id),
  company_id INTEGER REFERENCES companies (id),
  status TEXT NOT NULL,
  apply_mode TEXT,
  resume_version TEXT,
  cover_letter_version TEXT,
  cover_letter_text TEXT,
  applied_at TEXT,
  failure_reason TEXT,
  next_action_at TEXT,
  result TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (vacancy_id)
);

CREATE INDEX IF NOT EXISTS idx_applications_status ON applications (status);

CREATE TABLE IF NOT EXISTS application_artifacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL REFERENCES applications (id),
  type TEXT NOT NULL,
  content TEXT,
  file_path TEXT,
  version TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS queues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  priority INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_queues_type_status ON queues (type, status);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  payload_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_created ON events (created_at);
CREATE INDEX IF NOT EXISTS idx_events_entity ON events (entity_type, entity_id);

CREATE TABLE IF NOT EXISTS playbooks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  version INTEGER NOT NULL DEFAULT 1,
  capabilities_json TEXT,
  file_path TEXT,
  last_success_at TEXT,
  last_failure_at TEXT,
  failure_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (source, type)
);

CREATE TABLE IF NOT EXISTS llm_generations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  input_hash TEXT,
  prompt_version TEXT,
  output_text TEXT,
  model TEXT,
  tokens_input INTEGER,
  tokens_output INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS insights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  summary TEXT NOT NULL,
  detail TEXT,
  recommendation TEXT,
  confidence TEXT,
  period_start TEXT,
  period_end TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reflection_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period_start TEXT,
  period_end TEXT,
  report_markdown TEXT,
  metrics_json TEXT,
  recommendations_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS source_cursors (
  source TEXT PRIMARY KEY,
  last_published_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS telegram_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  telegram_chat_id TEXT,
  telegram_message_id TEXT,
  payload_json TEXT,
  delivery_status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  claimed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
