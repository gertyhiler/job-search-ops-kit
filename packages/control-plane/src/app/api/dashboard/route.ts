import { NextResponse } from "next/server"

import { loadDashboard } from "@/entities/dashboard"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(): Promise<Response> {
  const snapshot = await loadDashboard()
  return NextResponse.json(snapshot)
}
