import { useState } from "react"
import { LoaderCircle, LogIn } from "lucide-react"
import { useSearchParams } from "react-router"

import { Button } from "@/components/ui/button"
import { authClient } from "@/lib/auth"

function getSafeRedirectTo(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/"
  }

  return value
}

export function LoginPage() {
  const [searchParams] = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const [isSigningIn, setIsSigningIn] = useState(false)

  async function signInWithGoogle() {
    setError(null)
    setIsSigningIn(true)

    const redirectTo = getSafeRedirectTo(searchParams.get("redirectTo"))
    const callbackURL = new URL(redirectTo, window.location.origin).toString()

    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL,
        errorCallbackURL: `${window.location.origin}/login`,
      })

      if (result.error) {
        setError(result.error.message ?? "Google sign-in failed.")
        setIsSigningIn(false)
      }
    } catch {
      setError("Unable to reach the authentication server.")
      setIsSigningIn(false)
    }
  }

  return (
    <main className="grid min-h-svh place-items-center bg-muted/30 px-6 py-10">
      <section className="w-full max-w-sm rounded-lg border bg-background p-6 shadow-sm">
        <div className="mb-6 space-y-2">
          <p className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
            NSXfonio
          </p>
          <h1 className="text-2xl font-semibold">Sign in</h1>
          <p className="text-sm text-muted-foreground">
            Use your Google account to continue.
          </p>
        </div>

        <Button
          className="h-9 w-full gap-2"
          disabled={isSigningIn}
          onClick={signInWithGoogle}
          size="lg"
          type="button"
          variant="outline"
        >
          {isSigningIn ? (
            <LoaderCircle className="animate-spin" />
          ) : (
            <LogIn />
          )}
          Continue with Google
        </Button>

        {error ? (
          <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </section>
    </main>
  )
}
