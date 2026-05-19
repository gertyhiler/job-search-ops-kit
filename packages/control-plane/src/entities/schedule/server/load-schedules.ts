import { fetchSchedulesSnapshot } from "@/shared/server/control-plane"

import type { ScheduleRecord } from "../model/types"

export async function loadSchedules(): Promise<ScheduleRecord[]> {
  return await fetchSchedulesSnapshot() as ScheduleRecord[]
}
