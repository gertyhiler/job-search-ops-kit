import { NextResponse } from "next/server"

import {
  logManualAppliedEvent,
  updateApplicationWorkflowStatus
} from "@/shared/server/control-plane"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await context.params
  const body = await request.json() as {
    kind?: string
    evidenceText?: string
    evidenceName?: string | null
  }

  if (body.kind !== "applied") {
    return NextResponse.json({ error: "Only manual applied events are supported in M5.2." }, { status: 400 })
  }
  if (!body.evidenceText?.trim()) {
    return NextResponse.json({ error: "evidenceText is required" }, { status: 400 })
  }

  try {
    const event = await logManualAppliedEvent({
      applicationId: id,
      evidenceText: body.evidenceText,
      evidenceName: body.evidenceName
    })
    const evidenceRef = typeof (event.result as { evidence_ref?: unknown }).evidence_ref === "string"
      ? String((event.result as { evidence_ref: string }).evidence_ref)
      : null
    const status = await updateApplicationWorkflowStatus({
      id,
      status: "applied",
      reason: "manual application confirmation logged",
      evidenceRef,
      humanConfirmation: true
    })
    return NextResponse.json({ event, status })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "event write failed" },
      { status: 400 }
    )
  }
}
