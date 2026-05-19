import type { ControlPlaneRun } from "@/entities/run"
import type { ScheduleRecord } from "@/entities/schedule"
import type { ApplicationRecord } from "@/entities/application"
import type { VacancyRecord } from "@/entities/vacancy"

export type NextAction = {
  kind: string
  application_id?: string
  schedule_id?: string
  role?: string
} & Record<string, unknown>

export type FunnelSnapshot = {
  total_applications?: number
  response_rate?: number | null
}

export type PerformanceSnapshot = {
  top_channel?: string
  response_rate?: number | null
  event_counts?: Record<string, unknown>
}

export type AgentAuditEntry = {
  id?: string | number
  role?: string | null
  trigger?: string | null
  ts_started?: string | null
} & Record<string, unknown>

export type DashboardSnapshot = {
  next_actions?: {
    actions?: NextAction[]
  }
  due_schedules?: ScheduleRecord[]
  candidate_vacancies?: VacancyRecord[]
  applications?: ApplicationRecord[]
  funnel?: FunnelSnapshot
  performance?: PerformanceSnapshot
  recent_runs?: ControlPlaneRun[]
  recent_agent_runs?: AgentAuditEntry[]
}
