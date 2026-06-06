import { LogOut } from "lucide-react"
import { useNavigate, useRouteLoaderData } from "react-router"

import { Button } from "@/components/ui/button"
import { authClient, type AuthSession } from "@/lib/auth"

export function DashboardPage() {
  const navigate = useNavigate()
  const session = useRouteLoaderData("root") as AuthSession | undefined
  const userName = session?.user.name || session?.user.email || "there"

  async function signOut() {
    await authClient.signOut()
    await navigate("/login")
  }

  return (
    <div className="min-h-svh bg-background">
      <header className="border-b bg-muted/25">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
              NSXfonio
            </p>
            <h1 className="truncate text-lg font-semibold">Dashboard</h1>
          </div>
          <Button onClick={signOut} type="button" variant="outline">
            <LogOut />
            Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8">
        <section className="space-y-2">
          <h2 className="text-2xl font-semibold">Welcome, {userName}</h2>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            You are signed in with Google. This route is protected by React
            Router data loaders and the backend session endpoint.
          </p>
        </section>
      </main>
    </div>
  )
}
