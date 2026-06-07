import { useState } from "react"
import { useNavigate } from "react-router"
import { LoaderCircle } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { apiURL } from "@/lib/auth"

export function OnboardingPage() {
  const navigate = useNavigate()
  const [name, setName] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const trimmed = name.trim()
    if (!trimmed) {
      setError("Please enter a name for your business.")
      return
    }

    setIsSubmitting(true)

    try {
      const res = await fetch(`${apiURL}/api/onboarding/client`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      })

      if (!res.ok) {
        const body = await res.json()
        setError(body.error ?? "Something went wrong.")
        setIsSubmitting(false)
        return
      }

      toast.success("Business created! Welcome to NSXfonio.")
      navigate("/", { replace: true })
    } catch {
      setError("Unable to reach the server.")
      setIsSubmitting(false)
    }
  }

  return (
    <main className="grid min-h-svh place-items-center bg-muted/40 px-4 py-8">
      <div className="flex w-full max-w-md flex-col gap-4">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl">Set up your business</CardTitle>
            <CardDescription>
              Enter a name for your business to get started with NSXfonio.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                disabled={isSubmitting}
                maxLength={200}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Acme Dental"
                value={name}
              />

              <Button
                className="h-9 w-full"
                disabled={isSubmitting || !name.trim()}
                size="lg"
                type="submit"
              >
                {isSubmitting ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  "Create business"
                )}
              </Button>

              {error ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              ) : null}
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
