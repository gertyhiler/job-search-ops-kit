import Link from "next/link"

import type { ControlPlaneRun } from "@/entities/run"
import { RunPoller } from "@/features/runtime/run-poller"
import { formatTs } from "@/shared/lib"
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ScrollArea,
  StatusBadge
} from "@/shared/ui"

export function RunDetailView(props: { run: ControlPlaneRun }) {
  const title = props.run.role ?? props.run.kind

  return (
    <div className="space-y-6">
      <RunPoller runId={props.run.id} finishedAt={props.run.finished_at} />

      <Card>
        <CardHeader className="gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
              Run Detail
            </p>
            <div className="space-y-1">
              <CardTitle>{title}</CardTitle>
              <CardDescription>
                Supervised runtime execution with linked payloads, notes, and process output.
              </CardDescription>
            </div>
          </div>

          <StatusBadge fallback="unknown" status={props.run.status} />
        </CardHeader>
        <CardContent className="space-y-6">
          <dl className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <MetaItem label="ID" value={props.run.id} mono />
            <MetaItem label="Kind" value={props.run.kind} />
            <MetaItem label="Mode" value={props.run.mode ?? "n/a"} />
            <MetaItem label="Created" value={formatTs(props.run.created_at)} />
            <MetaItem label="Started" value={formatTs(props.run.started_at)} />
            <MetaItem label="Finished" value={formatTs(props.run.finished_at)} />
            <MetaItem label="PID" value={String(props.run.pid ?? "n/a")} />
            <MetaItem label="Exit code" value={String(props.run.exit_code ?? "n/a")} />
            <MetaItem
              label="Runtime run id"
              value={props.run.runtime_run_id ?? "n/a"}
              mono
            />
            <MetaItem label="Notes path" value={props.run.notes_path ?? "n/a"} mono />
            <MetaItem label="Stdout" value={props.run.stdout_path ?? "n/a"} mono />
            <MetaItem label="Stderr" value={props.run.stderr_path ?? "n/a"} mono />
          </dl>

          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary">
              <Link href="/">Dashboard</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/schedules">Schedules</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <JsonCard
          eyebrow="Runtime Payload"
          title="Resolved output"
          value={props.run.runtime_result ?? {}}
        />
        <TextCard
          eyebrow="Notes"
          title="Resolved note excerpt"
          value={props.run.notes_excerpt ?? "No notes yet."}
        />
        <TextCard
          eyebrow="Stdout tail"
          title="Child process stream"
          value={props.run.stdout_tail || "No stdout captured."}
        />
        <TextCard
          eyebrow="Stderr tail"
          title="Error stream"
          value={props.run.stderr_tail || "No stderr captured."}
        />
        <div className="xl:col-span-2">
          <JsonCard
            eyebrow="Agent Audit"
            title="Linked runtime entry"
            value={props.run.agent_run ?? {}}
          />
        </div>
      </div>
    </div>
  )
}

function MetaItem(props: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border bg-muted/20 p-4">
      <dt className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {props.label}
      </dt>
      <dd className={props.mono ? "mt-2 break-all font-mono text-sm" : "mt-2 text-sm font-medium"}>
        {props.value}
      </dd>
    </div>
  )
}

function JsonCard(props: { eyebrow: string; title: string; value: unknown }) {
  return (
    <Card className="h-full">
      <CardHeader>
        <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
          {props.eyebrow}
        </p>
        <CardTitle>{props.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[320px] rounded-lg border bg-muted/20">
          <pre className="p-4 text-xs leading-5 text-muted-foreground">
            {JSON.stringify(props.value, null, 2)}
          </pre>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}

function TextCard(props: { eyebrow: string; title: string; value: string }) {
  return (
    <Card className="h-full">
      <CardHeader>
        <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
          {props.eyebrow}
        </p>
        <CardTitle>{props.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[320px] rounded-lg border bg-muted/20">
          <pre className="whitespace-pre-wrap break-words p-4 text-xs leading-5 text-muted-foreground">
            {props.value}
          </pre>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
