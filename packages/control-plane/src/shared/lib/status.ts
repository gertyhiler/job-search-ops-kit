export type StatusBadgeVariant = "secondary" | "destructive"

export function getStatusVariant(status: string | null | undefined): StatusBadgeVariant {
  if (!status) {
    return "secondary"
  }

  return /failed|error|not_implemented|skipped/i.test(status) ? "destructive" : "secondary"
}

export function getStatusLabel(
  status: string | null | undefined,
  fallback = "unknown"
): string {
  return status?.trim() || fallback
}
