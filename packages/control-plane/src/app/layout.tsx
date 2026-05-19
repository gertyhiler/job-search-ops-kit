import type { Metadata } from "next"
import type { ReactNode } from "react"

import { ControlPlaneShell } from "@/widgets/control-plane-shell"

import "./globals.css"

export const metadata: Metadata = {
  title: "Job Search Control Plane",
  description: "Installed runtime control plane for job-search-ops-kit."
}

export default function RootLayout(props: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <ControlPlaneShell>{props.children}</ControlPlaneShell>
      </body>
    </html>
  )
}
