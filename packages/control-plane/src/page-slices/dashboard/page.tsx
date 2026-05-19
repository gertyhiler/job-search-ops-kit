import { loadDashboard } from "@/entities/dashboard"
import { DashboardOverview } from "@/widgets/dashboard-overview"

export async function DashboardPage() {
  const snapshot = await loadDashboard()

  return <DashboardOverview snapshot={snapshot} />
}
