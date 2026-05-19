import { fetchControlPlaneRun } from "@/shared/server/control-plane"

import type { ControlPlaneRun } from "../model/types"

export async function loadRun(runId: string): Promise<ControlPlaneRun | null> {
  return await fetchControlPlaneRun(runId) as ControlPlaneRun | null
}
