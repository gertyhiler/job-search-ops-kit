export type ScheduleRecord = {
  id: string
  role: string
  next_run_at?: string | null
  last_status?: string | null
}
