import { RunDetailPage } from "@/page-slices/run-detail"

export const dynamic = "force-dynamic"

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const params = await props.params

  return <RunDetailPage id={params.id} />
}
