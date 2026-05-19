export function formatTs(value: string | null | undefined): string {
  if (!value) {
    return "n/a"
  }

  const ts = Date.parse(value)
  if (!Number.isFinite(ts)) {
    return value
  }

  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(ts))
}
