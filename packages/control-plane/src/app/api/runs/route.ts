import { NextResponse } from "next/server"

import { loadRuns } from "@/entities/run"
import { startSupervisedRoleRun } from "@/features/runtime/run-role"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url)
  const limit = Number.parseInt(searchParams.get("limit") ?? "20", 10)
  const runs = await loadRuns(Number.isFinite(limit) ? limit : 20)

  return NextResponse.json({ runs })
}

export async function POST(request: Request): Promise<Response> {
  const body = await request.json() as { role?: string; scheduleId?: string; mode?: string }
  if (!body.role) {
    return NextResponse.json({ error: "role is required" }, { status: 400 })
  }

  if (body.mode && body.mode !== "supervised") {
    return NextResponse.json({ error: "Only supervised mode is supported in M5.1." }, { status: 400 })
  }

  const run = await startSupervisedRoleRun({
    role: body.role,
    scheduleId: body.scheduleId
  })

  return NextResponse.json({ run }, { status: 202 })
}
