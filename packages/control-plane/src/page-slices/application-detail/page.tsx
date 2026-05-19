import Link from "next/link"

import { loadApplicationPack } from "@/entities/application"
import {
  logManualAppliedAction,
  prepareOutboxAction,
  updateApplicationStatusAction
} from "@/features/application-workflow"
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

export async function ApplicationDetailPage(props: { id: string }) {
  const pack = await loadApplicationPack(props.id)
  const application = pack.application

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-xl border bg-background p-6 shadow-sm lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
            Application Pack
          </p>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-semibold tracking-tight">{application.id}</h2>
              <StatusBadge fallback="unknown" status={application.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              Vacancy {application.vacancy_id} · channel {application.channel} · applied {formatTs(application.applied_at ?? null)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/applications">Back to applications</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/schedules">Run roles</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Package assets</CardTitle>
            <CardDescription>
              Generated content and review/outbox metadata stored in the runtime data root.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Block title="Vacancy" value={pack.vacancy} />
            <Block title="Resume variant ref" value={pack.resume_variant_ref} />
            <TextBlock title="Letter markdown" value={pack.letter_markdown} />
            <TextBlock title="Screening answers" value={pack.screening_answers_markdown} />
            <Block title="Reviewer verdict" value={pack.reviewer_verdict} />
            <Block title="Outbox" value={pack.outbox} />
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Review gate</CardTitle>
              <CardDescription>
                Reviewer approval is required before preparing the manual outbox.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <form action={updateApplicationStatusAction} className="space-y-3">
                <input name="applicationId" type="hidden" value={application.id} />
                <input name="status" type="hidden" value="ready_to_send" />
                <textarea
                  className="min-h-24 w-full rounded-md border bg-background p-3 text-sm"
                  name="reason"
                  placeholder="Reviewer rationale"
                />
                <Button type="submit" variant="secondary">Mark reviewed</Button>
              </form>
              <Separator />
              <form action={updateApplicationStatusAction} className="space-y-3">
                <input name="applicationId" type="hidden" value={application.id} />
                <input name="status" type="hidden" value="review_blocked" />
                <textarea
                  className="min-h-24 w-full rounded-md border bg-background p-3 text-sm"
                  name="reason"
                  placeholder="Blocking reason"
                />
                <Button type="submit" variant="outline">Block package</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Manual outbox</CardTitle>
              <CardDescription>
                Prepare send instructions without browser automation.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form action={prepareOutboxAction} className="space-y-3">
                <input name="applicationId" type="hidden" value={application.id} />
                <textarea
                  className="min-h-28 w-full rounded-md border bg-background p-3 text-sm"
                  name="instructions"
                  placeholder="Manual channel instructions"
                />
                <Button type="submit">Prepare outbox</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Log applied manually</CardTitle>
              <CardDescription>
                Requires human confirmation evidence and writes an append-only lifecycle event.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form action={logManualAppliedAction} className="space-y-3">
                <input name="applicationId" type="hidden" value={application.id} />
                <input
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  name="evidenceName"
                  placeholder="evidence file name"
                />
                <textarea
                  className="min-h-28 w-full rounded-md border bg-background p-3 text-sm"
                  name="evidenceText"
                  placeholder="Paste confirmation text"
                  required
                />
                <Button type="submit" variant="secondary">Log applied</Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lifecycle events</CardTitle>
          <CardDescription>
            Append-only events linked to this application.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(pack.events ?? []).length === 0 ? (
            <div className="rounded-xl border border-dashed bg-muted/20 p-6 text-sm text-muted-foreground">
              No events yet.
            </div>
          ) : (
            (pack.events ?? []).map((event) => (
              <div key={String(event.id)} className="rounded-xl border bg-muted/30 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-medium">{String(event.kind ?? "event")}</p>
                  <p className="text-sm text-muted-foreground">{formatTs(String(event.ts ?? ""))}</p>
                </div>
                <pre className="mt-3 overflow-x-auto rounded-lg bg-background p-3 text-xs leading-5 text-muted-foreground">
                  {JSON.stringify(event, null, 2)}
                </pre>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Block(props: { title: string; value: unknown }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">{props.title}</h3>
      <pre className="overflow-x-auto rounded-lg bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
        {JSON.stringify(props.value ?? {}, null, 2)}
      </pre>
    </section>
  )
}

function TextBlock(props: { title: string; value?: string | null }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">{props.title}</h3>
      <pre className="whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
        {props.value || "n/a"}
      </pre>
    </section>
  )
}
