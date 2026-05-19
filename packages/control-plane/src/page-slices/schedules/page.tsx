import Link from "next/link"

import { loadSchedules } from "@/entities/schedule"
import { TickRuntimeButton } from "@/features/runtime/tick-runtime"
import { Button } from "@/shared/ui"
import { SchedulesTable } from "@/widgets/schedules-table"

export async function SchedulesPage() {
  const schedules = await loadSchedules()

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border bg-background p-6 shadow-sm lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
            Runtime Schedules
          </p>
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold tracking-tight">Observed schedule state</h2>
            <p className="text-sm text-muted-foreground">
              Inspect the current runtime schedule queue and trigger supervised runs when you
              need to observe an execution immediately.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/">Back to dashboard</Link>
          </Button>
          <TickRuntimeButton />
        </div>
      </div>

      <SchedulesTable schedules={schedules} />
    </div>
  )
}
