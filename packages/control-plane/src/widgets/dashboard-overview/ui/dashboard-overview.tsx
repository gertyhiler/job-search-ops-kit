import Link from "next/link"

import type { DashboardSnapshot } from "@/entities/dashboard"
import { TickRuntimeButton } from "@/features/runtime/tick-runtime"
import { formatTs } from "@/shared/lib"
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Separator,
  StatusBadge
} from "@/shared/ui"

export function DashboardOverview(props: { snapshot: DashboardSnapshot }) {
  const nextActions = props.snapshot.next_actions?.actions ?? []
  const dueSchedules = props.snapshot.due_schedules ?? []
  const candidateVacancies = props.snapshot.candidate_vacancies ?? []
  const applications = props.snapshot.applications ?? []
  const funnel = props.snapshot.funnel ?? {}
  const performance = props.snapshot.performance ?? {}
  const recentRuns = props.snapshot.recent_runs ?? []
  const recentAgentRuns = props.snapshot.recent_agent_runs ?? []

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
              Manual Control
            </p>
            <div className="space-y-1">
              <CardTitle>Scheduler surface</CardTitle>
              <CardDescription>
                Inspect due work and trigger a supervised runtime tick without leaving the
                control-plane surface.
              </CardDescription>
            </div>
          </div>

          <TickRuntimeButton />
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border bg-muted/30 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Due schedules
            </p>
            <p className="mt-2 text-3xl font-semibold">{dueSchedules.length}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Currently overdue entries in the installed runtime.
            </p>
          </div>

          <div className="rounded-xl border bg-muted/30 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Applications
            </p>
            <p className="mt-2 text-3xl font-semibold">{String(funnel.total_applications ?? 0)}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Response rate{" "}
              {typeof funnel.response_rate === "number"
                ? `${Math.round(funnel.response_rate * 100)}%`
                : "n/a"}
            </p>
          </div>

          <div className="rounded-xl border bg-muted/30 p-4 md:col-span-2">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                  M5.2 Loop
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Candidate vacancies {candidateVacancies.length} · package queue {applications.length}
                </p>
              </div>
              <Button asChild variant="outline">
                <Link href="/applications">Open applications</Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
              Next Actions
            </p>
            <CardTitle>Priority queue</CardTitle>
            <CardDescription>
              Snapshot of runtime actions surfaced by the installed operator.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {nextActions.length === 0 ? (
                <EmptyState label="No pending actions." />
              ) : (
                nextActions.map((action) => (
                  <div
                    key={`${action.kind}-${action.application_id ?? action.schedule_id ?? action.role ?? "item"}`}
                    className="rounded-xl border bg-muted/30 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium">{action.kind}</p>
                      <StatusBadge fallback="pending" status={action.kind} />
                    </div>
                    <pre className="mt-3 overflow-x-auto rounded-lg bg-background p-3 text-xs leading-5 text-muted-foreground">
                      {JSON.stringify(action, null, 2)}
                    </pre>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
              Performance
            </p>
            <CardTitle>Latest summary</CardTitle>
            <CardDescription>
              Compact operational metrics derived from the current dashboard snapshot.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <MetricLine
              label="Top channel"
              value={String(performance.top_channel ?? "n/a")}
            />
            <Separator />
            <MetricLine
              label="Response rate"
              value={
                typeof performance.response_rate === "number"
                  ? `${Math.round(performance.response_rate * 100)}%`
                  : "n/a"
              }
            />
            <Separator />
            <div className="space-y-2">
              <p className="text-sm font-medium">Event counts</p>
              <pre className="overflow-x-auto rounded-lg bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
                {JSON.stringify(performance.event_counts ?? {}, null, 2)}
              </pre>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader className="gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
                Recent Runs
              </p>
              <div className="space-y-1">
                <CardTitle>Control-plane supervision</CardTitle>
                <CardDescription>
                  Recently triggered supervised runtime executions.
                </CardDescription>
              </div>
            </div>

            <Button asChild variant="outline">
              <Link href="/schedules">Open schedules</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentRuns.length === 0 ? (
                <EmptyState label="No supervised runs yet." />
              ) : (
                recentRuns.map((run) => (
                  <Link
                    key={run.id}
                    href={`/runs/${run.id}`}
                    className="block rounded-xl border bg-muted/30 p-4 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium">{run.role ?? run.kind}</p>
                      <StatusBadge fallback="unknown" status={run.status} />
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      created {formatTs(run.created_at)} · exit {String(run.exit_code ?? "n/a")}
                    </p>
                  </Link>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
              Agent Audit
            </p>
            <CardTitle>Recent runtime payloads</CardTitle>
            <CardDescription>
              Latest linked runtime audit entries captured by the installed operator.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentAgentRuns.length === 0 ? (
                <EmptyState label="No agent audit entries yet." />
              ) : (
                recentAgentRuns.map((run) => (
                  <div key={String(run.id)} className="rounded-xl border bg-muted/30 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium">{String(run.role ?? "unknown-role")}</p>
                      <StatusBadge
                        fallback="unknown"
                        status={String(run.trigger ?? run.role ?? "")}
                      />
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {formatTs(typeof run.ts_started === "string" ? run.ts_started : null)}
                    </p>
                    <pre className="mt-3 overflow-x-auto rounded-lg bg-background p-3 text-xs leading-5 text-muted-foreground">
                      {JSON.stringify(run, null, 2)}
                    </pre>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function MetricLine(props: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <p className="text-sm font-medium">{props.label}</p>
      <p className="text-sm text-muted-foreground">{props.value}</p>
    </div>
  )
}

function EmptyState(props: { label: string }) {
  return (
    <div className="rounded-xl border border-dashed bg-muted/20 p-6 text-sm text-muted-foreground">
      {props.label}
    </div>
  )
}
