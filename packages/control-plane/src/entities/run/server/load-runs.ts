import { fetchControlPlaneRuns } from "@/shared/server/control-plane"

import type { ControlPlaneRun } from "../model/types"

export async function loadRuns(limit = 20): Promise<ControlPlaneRun[]> {
  return await fetchControlPlaneRuns(limit) as ControlPlaneRun[]
}
