export type VacancyRecord = {
  id: string
  source: string
  company: string
  title: string
  status: string
  match_score?: number | null
  url?: string | null
} & Record<string, unknown>
