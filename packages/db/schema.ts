export const PROJECTION_TABLES = [
  "vacancy",
  "application",
  "application_event",
  "resume_version",
  "cover_letter",
  "interview",
  "strategy_change",
  "agent_run"
] as const;

export type ProjectionTable = (typeof PROJECTION_TABLES)[number];

export interface VacancyRow {
  id: string;
  source: string;
  source_id: string | null;
  url: string | null;
  company: string;
  title: string;
  location: string | null;
  remote: string;
  salary_min: number | null;
  salary_max: number | null;
  currency: string | null;
  tags: string[];
  jd_markdown_path: string | null;
  match_score: number | null;
  match_rationale: string | null;
  status: string;
  first_seen_at: string;
}

export interface ApplicationRow {
  id: string;
  vacancy_id: string;
  resume_version_id: string | null;
  cover_letter_id: string | null;
  channel: string;
  status: string;
  applied_at: string | null;
  confidence: number | null;
  auto_sent: boolean;
  dry_run: boolean;
}

export interface ApplicationEventRow {
  id: string;
  application_id: string;
  ts: string;
  kind: string;
  payload: unknown;
  evidence_ref: string | null;
  emitted_by: string | null;
}

export interface ResumeVersionRow {
  id: string;
  slug: string;
  base_commit_sha: string;
  patches_json_path: string | null;
  rendered_pdf_path: string | null;
  targeted_domain: string | null;
  created_at: string;
}

export interface CoverLetterRow {
  id: string;
  application_id: string;
  style: string | null;
  tone: string | null;
  markdown: string;
  sha: string;
  generated_by_model: string | null;
}

export interface InterviewRow {
  id: string;
  application_id: string;
  stage: string;
  scheduled_at: string;
  duration_min: number | null;
  format: string | null;
  notes_path: string | null;
  verdict: string | null;
  questions_asked: string[];
}

export interface StrategyChangeRow {
  id: string;
  ts: string;
  before: unknown;
  after: unknown;
  rationale: string;
  evidence_refs: string[];
  expected_impact: string | null;
  confidence: number;
  reversibility: string;
  proposed_by: string | null;
  decision: string | null;
  applied_version: string | null;
}

export interface AgentRunRow {
  id: string;
  ts_started: string;
  ts_finished: string | null;
  scheduled_for: string | null;
  role: string | null;
  model: string | null;
  prompt_sha: string | null;
  schedule_id: string | null;
  runner_adapter: string | null;
  run_mode: string | null;
  reasoning_effort: string | null;
  allow_tools: boolean | null;
  fallback_model: string | null;
  exit_code: number | null;
  duration_ms: number | null;
  tool_calls_count: number | null;
  changed_paths: string[];
  pty_session_id: string | null;
  approval_state: string | null;
  escalation_reason: string | null;
  capabilities_used: string[];
  dry_run: boolean | null;
  catchup: boolean | null;
  trigger: string | null;
  notes_path: string | null;
}
