import { ApplicationDetailPage } from "@/page-slices/application-detail"

export const dynamic = "force-dynamic"

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const params = await props.params

  return <ApplicationDetailPage id={params.id} />
}
