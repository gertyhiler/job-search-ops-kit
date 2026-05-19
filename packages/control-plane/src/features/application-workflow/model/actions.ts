"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import {
  logManualAppliedEvent,
  updateApplicationWorkflowStatus,
  writeApplicationWorkflowAsset
} from "@/shared/server/control-plane"

function readString(formData: FormData, key: string): string | null {
  const value = formData.get(key)
  return typeof value === "string" && value.trim() ? value.trim() : null
}

export async function updateApplicationStatusAction(formData: FormData): Promise<void> {
  const id = readString(formData, "applicationId")
  const status = readString(formData, "status")
  if (!id || !status) {
    throw new Error("applicationId and status are required.")
  }

  await updateApplicationWorkflowStatus({
    id,
    status,
    reason: readString(formData, "reason"),
    evidenceRef: readString(formData, "evidenceRef"),
    humanConfirmation: formData.get("humanConfirmation") === "true"
  })

  revalidatePath("/")
  revalidatePath("/applications")
  revalidatePath(`/applications/${id}`)
  redirect(`/applications/${id}`)
}

export async function prepareOutboxAction(formData: FormData): Promise<void> {
  const id = readString(formData, "applicationId")
  if (!id) {
    throw new Error("applicationId is required.")
  }

  await writeApplicationWorkflowAsset({
    applicationId: id,
    kind: "outbox",
    payload: {
      prepared_at: new Date().toISOString(),
      mode: "manual",
      instructions: readString(formData, "instructions") ?? "Manual send required.",
      evidence_checklist: [
        "capture final submitted page or confirmation email",
        "paste confirmation text into Log applied manually",
        "do not use unattended browser automation in M5.2"
      ]
    }
  })
  await updateApplicationWorkflowStatus({
    id,
    status: "outbox_prepared",
    reason: "manual outbox prepared from control plane"
  })

  revalidatePath("/")
  revalidatePath("/applications")
  revalidatePath(`/applications/${id}`)
  redirect(`/applications/${id}`)
}

export async function logManualAppliedAction(formData: FormData): Promise<void> {
  const id = readString(formData, "applicationId")
  const evidenceText = readString(formData, "evidenceText")
  if (!id || !evidenceText) {
    throw new Error("applicationId and evidenceText are required.")
  }

  const event = await logManualAppliedEvent({
    applicationId: id,
    evidenceText,
    evidenceName: readString(formData, "evidenceName")
  })
  const evidenceRef = typeof (event.result as { evidence_ref?: unknown }).evidence_ref === "string"
    ? String((event.result as { evidence_ref: string }).evidence_ref)
    : null

  await updateApplicationWorkflowStatus({
    id,
    status: "applied",
    reason: "manual application confirmation logged",
    evidenceRef,
    humanConfirmation: true
  })

  revalidatePath("/")
  revalidatePath("/applications")
  revalidatePath(`/applications/${id}`)
  redirect(`/applications/${id}`)
}
