import { NextResponse } from "next/server"

import { updateApplicationWorkflowStatus } from "@/shared/server/control-plane"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await context.params
  const body = await request.json() as {
    status?: string
    reason?: string | null
    evidenceRef?: string | null
    humanConfirmation?: boolean | null
  }
  if (!body.status) {
    return NextResponse.json({ error: "status is required" }, { status: 400 })
  }

  try {
    const result = await updateApplicationWorkflowStatus({
      id,
      status: body.status,
      reason: body.reason,
      evidenceRef: body.evidenceRef,
      humanConfirmation: body.humanConfirmation
    })
    return NextResponse.json({ result })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "status update failed" },
      { status: 400 }
    )
  }
}
