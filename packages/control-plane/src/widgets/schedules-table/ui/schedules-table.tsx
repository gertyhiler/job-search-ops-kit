import type { ScheduleRecord } from "@/entities/schedule"
import { RunRoleButton } from "@/features/runtime/run-role"
import { formatTs } from "@/shared/lib"
import {
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

export function SchedulesTable(props: { schedules: ScheduleRecord[] }) {
  return (
    <Card>
      <CardHeader>
        <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
          Runtime Schedules
        </p>
        <div className="space-y-1">
          <CardTitle>Observed schedule state</CardTitle>
          <CardDescription>
            Review the next scheduled execution for each role and trigger a supervised run
            when needed.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Next run</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {props.schedules.map((schedule) => (
              <TableRow key={schedule.id}>
                <TableCell className="font-mono text-xs">{schedule.id}</TableCell>
                <TableCell className="font-medium">{schedule.role}</TableCell>
                <TableCell>{formatTs(schedule.next_run_at)}</TableCell>
                <TableCell>
                  <StatusBadge fallback="never-run" status={schedule.last_status} />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end">
                    <RunRoleButton role={schedule.role} scheduleId={schedule.id} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
