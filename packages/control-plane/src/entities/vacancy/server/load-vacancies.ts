import { fetchCandidateVacancies } from "@/shared/server/control-plane"

import type { VacancyRecord } from "../model/types"

export async function loadCandidateVacancies(limit = 50): Promise<VacancyRecord[]> {
  return fetchCandidateVacancies(limit) as Promise<VacancyRecord[]>
}
