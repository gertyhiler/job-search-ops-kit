import { notFound } from "next/navigation"

import { loadRun } from "@/entities/run"
import { RunDetailView } from "@/widgets/run-detail-view"

export async function RunDetailPage(props: { id: string }) {
  const run = await loadRun(props.id)

  if (!run) {
    notFound()
  }

  return <RunDetailView run={run} />
}
