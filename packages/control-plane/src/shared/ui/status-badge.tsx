import { Badge } from "@/shared/ui/badge"
import { getStatusLabel, getStatusVariant } from "@/shared/lib"

export function StatusBadge(props: {
  status: string | null | undefined
  fallback?: string
  className?: string
}) {
  const label = getStatusLabel(props.status, props.fallback)

  return (
    <Badge className={props.className} variant={getStatusVariant(props.status)}>
      {label}
    </Badge>
  )
}
