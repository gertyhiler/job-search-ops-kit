import type { ReactNode } from "react"
import Link from "next/link"

import { Button } from "@/shared/ui"

export function ControlPlaneShell(props: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/30">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 rounded-2xl border bg-background shadow-sm">
          <div className="flex flex-col gap-6 px-6 py-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
                Installed Runtime
              </p>
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  Job Search Control Plane
                </h1>
                <p className="max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
                  Observe runtime state, inspect due schedules, and trigger supervised dry-run
                  flows from the installed operator app.
                </p>
              </div>
            </div>

            <nav className="flex flex-wrap gap-2">
              <Button asChild variant="secondary">
                <Link href="/">Dashboard</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/applications">Applications</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/schedules">Schedules</Link>
              </Button>
            </nav>
          </div>
        </header>

        <main className="flex-1">{props.children}</main>
      </div>
    </div>
  )
}
