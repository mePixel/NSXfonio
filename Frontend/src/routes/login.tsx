import { useState } from "react"
import { LoaderCircle } from "lucide-react"
import { useSearchParams } from "react-router"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { authClient } from "@/lib/auth"

function getSafeRedirectTo(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/"
  }

  return value
}

function GoogleLogo() {
  return (
    <svg
      aria-hidden="true"
      className="size-4"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M21.6 12.23c0-.74-.07-1.45-.19-2.13H12v4.03h5.38a4.6 4.6 0 0 1-1.99 3.02v2.51h3.23c1.89-1.74 2.98-4.3 2.98-7.43Z"
        fill="#4285F4"
      />
      <path
        d="M12 22c2.7 0 4.96-.9 6.62-2.43l-3.23-2.51c-.9.6-2.04.95-3.39.95-2.6 0-4.81-1.76-5.6-4.12H3.06v2.59A9.99 9.99 0 0 0 12 22Z"
        fill="#34A853"
      />
      <path
        d="M6.4 13.89a6 6 0 0 1 0-3.78V7.52H3.06a9.99 9.99 0 0 0 0 8.96l3.34-2.59Z"
        fill="#FBBC04"
      />
      <path
        d="M12 5.99c1.47 0 2.8.51 3.84 1.5l2.86-2.86A9.58 9.58 0 0 0 12 2 9.99 9.99 0 0 0 3.06 7.52l3.34 2.59C7.19 7.75 9.4 5.99 12 5.99Z"
        fill="#EA4335"
      />
    </svg>
  )
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
    <main className="grid min-h-svh place-items-center bg-muted/40 px-4 py-8">
      <div className="flex w-full max-w-md flex-col gap-4">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl">Sign in</CardTitle>
            <CardDescription>
              Continue with your Google account to open NSXfonio.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
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
                <GoogleLogo />
              )}
              Continue with Google
            </Button>

            {error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
