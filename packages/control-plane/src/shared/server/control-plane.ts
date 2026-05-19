import "server-only"

import { JobSearchService } from "@job-search/mcp-server/service"
import {
  getControlPlaneRun,
  getDashboardSnapshot,
  listControlPlaneRuns,
  startSupervisedRuntimeRun,
  startSupervisedRuntimeTick
} from "@job-search/runtime/control-plane"

export async function fetchDashboardSnapshot() {
  return getDashboardSnapshot()
}

export async function fetchSchedulesSnapshot() {
  const service = new JobSearchService()
  const schedules = await service.listSchedules()
  return schedules.result
}

export async function fetchControlPlaneRuns(limit = 20) {
  return listControlPlaneRuns({ limit })
}

export async function fetchControlPlaneRun(runId: string) {
  return getControlPlaneRun(runId)
}

export async function fetchCandidateVacancies(limit = 50) {
  const service = new JobSearchService()
  const vacancies = await service.listVacancies({ status: "candidate", limit })
  return vacancies.result
}

export async function fetchApplications(input: {
  status?: string | null
  vacancyId?: string | null
  channel?: string | null
  limit?: number
} = {}) {
  const service = new JobSearchService()
  const applications = await service.listApplications({
    status: input.status,
    vacancy_id: input.vacancyId,
    channel: input.channel,
    limit: input.limit ?? 50
  })
  return applications.result
}

export async function fetchApplicationPack(applicationId: string) {
  const service = new JobSearchService()
  const pack = await service.getApplicationPack({ id: applicationId })
  return pack.result
}

export async function updateApplicationWorkflowStatus(input: {
  id: string
  status: string
  reason?: string | null
  evidenceRef?: string | null
  humanConfirmation?: boolean | null
}) {
  const service = new JobSearchService()
  return service.updateApplicationStatus({
    id: input.id,
    status: input.status,
    reason: input.reason,
    evidence_ref: input.evidenceRef,
    human_confirmation: input.humanConfirmation
  })
}

export async function writeApplicationWorkflowAsset(input: {
  applicationId: string
  kind: "letter_markdown" | "screening_answers_markdown" | "resume_variant_ref" | "reviewer_verdict" | "outbox"
  content?: string | null
  payload?: Record<string, unknown> | null
}) {
  const service = new JobSearchService()
  return service.writeApplicationAsset({
    application_id: input.applicationId,
    kind: input.kind,
    content: input.content,
    payload: input.payload
  })
}

export async function logManualAppliedEvent(input: {
  applicationId: string
  evidenceText: string
  evidenceName?: string | null
}) {
  const service = new JobSearchService()
  return service.logEvent({
    event: {
      id: `event-${input.applicationId}-applied-${Date.now()}`,
      application_id: input.applicationId,
      ts: new Date().toISOString(),
      kind: "applied",
      payload: {
        source: "control-plane",
        manual_confirmation: true
      },
      evidence_ref: null,
      emitted_by: "control-plane"
    },
    evidence_text: input.evidenceText,
    evidence_name: input.evidenceName ?? `${input.applicationId}-manual-apply.txt`,
    human_confirmation: true
  })
}

export async function startSupervisedRun(input: {
  role: string
  scheduleId?: string
}) {
  return startSupervisedRuntimeRun({
    role: input.role,
    scheduleId: input.scheduleId,
    mode: "supervised"
  })
}

export async function startRuntimeTick() {
  return startSupervisedRuntimeTick()
}
