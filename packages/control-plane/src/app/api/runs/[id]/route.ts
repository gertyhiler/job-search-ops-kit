import { NextResponse } from "next/server"

import { loadRun } from "@/entities/run"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await context.params
  const run = await loadRun(id)

  if (!run) {
    return NextResponse.json({ error: "run not found" }, { status: 404 })
  }

  return NextResponse.json({ run })
}
