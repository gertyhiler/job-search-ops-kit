import Link from "next/link"

import { loadApplications } from "@/entities/application"
import { loadCandidateVacancies } from "@/entities/vacancy"
import { formatTs } from "@/shared/lib"
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/shared/ui"

export async function ApplicationsPage() {
  const [applications, vacancies] = await Promise.all([
    loadApplications({ limit: 50 }),
    loadCandidateVacancies(20)
  ])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-xl border bg-background p-6 shadow-sm lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
            Supervised Loop
          </p>
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold tracking-tight">Applications queue</h2>
            <p className="text-sm text-muted-foreground">
              Review candidate vacancies and move application packages through manual gates.
            </p>
          </div>
        </div>

        <Button asChild variant="outline">
          <Link href="/">Back to dashboard</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Candidate vacancies</CardTitle>
          <CardDescription>
            Scout output ready for a supervised package-prep run.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {vacancies.length === 0 ? (
            <EmptyState label="No candidate vacancies." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Role</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vacancies.map((vacancy) => (
                  <TableRow key={vacancy.id}>
                    <TableCell>
                      <div className="space-y-1">
                        <p className="font-medium">{vacancy.title}</p>
                        <p className="text-xs text-muted-foreground">{vacancy.company}</p>
                      </div>
                    </TableCell>
                    <TableCell>{vacancy.source}</TableCell>
                    <TableCell>{String(vacancy.match_score ?? "n/a")}</TableCell>
                    <TableCell>
                      <StatusBadge fallback="candidate" status={vacancy.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Application packages</CardTitle>
          <CardDescription>
            Drafts, review gates, outbox-prepared items, and applied applications.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {applications.length === 0 ? (
            <EmptyState label="No application packages." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Application</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Applied</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {applications.map((application) => (
                  <TableRow key={application.id}>
                    <TableCell>
                      <div className="space-y-1">
                        <p className="font-medium">{application.id}</p>
                        <p className="text-xs text-muted-foreground">{application.vacancy_id}</p>
                      </div>
                    </TableCell>
                    <TableCell>{application.channel}</TableCell>
                    <TableCell>
                      <StatusBadge fallback="unknown" status={application.status} />
                    </TableCell>
                    <TableCell>{formatTs(application.applied_at ?? null)}</TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/applications/${application.id}`}>Open</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
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
