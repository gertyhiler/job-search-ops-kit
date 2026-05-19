import { fetchApplicationPack } from "@/shared/server/control-plane"

import type { ApplicationPack } from "../model/types"

export async function loadApplicationPack(applicationId: string): Promise<ApplicationPack> {
  return fetchApplicationPack(applicationId) as Promise<ApplicationPack>
}
