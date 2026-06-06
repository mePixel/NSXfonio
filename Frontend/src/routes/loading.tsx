import { LoaderCircle } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"

export function LoadingPage() {
  return (
    <div className="grid min-h-svh place-items-center bg-muted/40 px-6">
      <Card className="w-full max-w-xs shadow-sm">
        <CardContent className="flex items-center gap-3 py-1 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          Loading workspace
        </CardContent>
      </Card>
    </div>
  )
}
