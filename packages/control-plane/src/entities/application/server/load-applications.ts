import { fetchApplications } from "@/shared/server/control-plane"

import type { ApplicationRecord } from "../model/types"

export async function loadApplications(input: {
  status?: string | null
  vacancyId?: string | null
  channel?: string | null
  limit?: number
} = {}): Promise<ApplicationRecord[]> {
  return fetchApplications(input) as Promise<ApplicationRecord[]>
}
