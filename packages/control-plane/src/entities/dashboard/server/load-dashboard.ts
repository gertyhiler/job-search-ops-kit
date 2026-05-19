import { fetchDashboardSnapshot } from "@/shared/server/control-plane"

import type { DashboardSnapshot } from "../model/types"

export async function loadDashboard(): Promise<DashboardSnapshot> {
  return await fetchDashboardSnapshot() as DashboardSnapshot
}
