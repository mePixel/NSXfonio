import { CalendarCheck2, CheckCircle2 } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

export function PublicReschedulerSuccessPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-[linear-gradient(180deg,rgba(245,247,250,1)_0%,rgba(255,255,255,1)_35%,rgba(244,238,226,0.9)_100%)] px-4 py-8 sm:px-6">
      <Card className="w-full max-w-xl rounded-[24px] border-slate-200/80 shadow-[0_20px_50px_-35px_rgba(15,23,42,0.45)]">
        <CardContent className="flex flex-col items-center gap-5 p-8 text-center sm:p-10">
          <div className="flex size-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <CheckCircle2 className="size-8" />
          </div>
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              Rescheduling complete
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
              Thank you
            </h1>
            <p className="text-sm leading-6 text-slate-600">
              Your earlier appointment has been confirmed and the selected
              appointment was cancelled.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            <CalendarCheck2 className="size-4" />
            You can close this page.
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
