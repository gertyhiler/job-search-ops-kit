export type ApplicationRecord = {
  id: string
  vacancy_id: string
  resume_version_id?: string | null
  cover_letter_id?: string | null
  channel: string
  status: string
  applied_at?: string | null
  confidence?: number | null
  auto_sent?: boolean | number | null
  dry_run?: boolean | number | null
} & Record<string, unknown>

export type ApplicationPack = {
  application: ApplicationRecord
  cover_letter?: Record<string, unknown> | null
  letter_markdown?: string | null
  screening_answers_markdown?: string | null
  resume_variant_ref?: Record<string, unknown> | null
  reviewer_verdict?: Record<string, unknown> | null
  outbox?: Record<string, unknown> | null
  vacancy?: Record<string, unknown> | null
  events?: Array<Record<string, unknown>>
}
