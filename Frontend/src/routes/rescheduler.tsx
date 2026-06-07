import * as React from "react";
import {
  Ban,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  Clock3,
  PhoneCall,
  RefreshCw,
  RotateCcw,
  UserRound,
  XCircle,
} from "lucide-react";
import {
  Form,
  useActionData,
  useFetcher,
  useLoaderData,
  useNavigation,
  useRevalidator,
} from "react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  type ReschedulerCandidate,
  type ReschedulerFlow,
  type ReschedulerState,
} from "@/lib/rescheduler";
import { cn } from "@/lib/utils";

type ReschedulerLoaderData = {
  reschedulerFlows: ReschedulerFlow[];
};

type ReschedulerActionResult = {
  ok: boolean;
  intent: "abortReschedulerFlow";
  flowId: string;
  message: string;
};

const stateLabels: Record<ReschedulerState, string> = {
  pending: "Pending",
  calling: "Calling",
  filled: "Filled",
  aborted: "Aborted",
  failed: "Couldn't fulfill",
};

const candidateStateLabels: Record<ReschedulerCandidate["state"], string> = {
  not_reached: "Not reached",
  declined: "Declined",
  interested: "Interested",
  accepted: "Accepted",
  skipped: "Skipped",
};

function getCandidateStateLabel(candidate: ReschedulerCandidate) {
  if (candidate.state === "accepted" && candidate.fulfilledBy === "email") {
    return "Accepted by email";
  }

  return candidateStateLabels[candidate.state];
}

const activeStates = new Set<ReschedulerState>(["pending", "calling"]);

export function ReschedulerPage() {
  const { reschedulerFlows } = useLoaderData() as ReschedulerLoaderData;
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const actionData = useActionData() as ReschedulerActionResult | undefined;
  const isReloading =
    navigation.state === "loading" && navigation.location?.pathname === "/rescheduler";
  const isRefreshing = revalidator.state === "loading";

  React.useEffect(() => {
    if (!actionData) return;

    if (actionData.ok) {
      toast.success(actionData.message);
    } else {
      toast.error("Unable to abort rebooking", {
        description: actionData.message,
      });
    }
  }, [actionData]);

  React.useEffect(() => {
    if (!isReloading && navigation.state === "idle") {
      const hasReloaded = sessionStorage.getItem("rescheduler-reloaded");
      if (hasReloaded) {
        sessionStorage.removeItem("rescheduler-reloaded");
        toast.success("Rescheduler reloaded successfully.");
      }
    }
  }, [isReloading, navigation.state]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-lg border bg-background p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium text-muted-foreground">
            Cancelled-booking control
          </p>
          <h1 className="truncate text-2xl font-semibold">Rescheduler</h1>
        </div>
        <Form method="get">
          <Button
            type="submit"
            variant="outline"
            size="sm"
            onClick={() => sessionStorage.setItem("rescheduler-reloaded", "true")}
          >
            <RefreshCw className={cn("size-4", isRefreshing && "animate-spin")} />
            Reload
          </Button>
        </Form>
      </section>

      <Card className="shadow-sm">
        <CardHeader className="border-b">
          <CardTitle className="flex flex-wrap items-center gap-2">
            <RotateCcw className="size-4 text-muted-foreground" />
            Cancelled bookings
            <span className="rounded-md border bg-muted px-2 py-1 text-xs font-normal text-muted-foreground">
              {reschedulerFlows.length} total
            </span>
            {isRefreshing ? (
              <RefreshCw className="size-3.5 animate-spin text-muted-foreground" />
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {reschedulerFlows.length > 0 ? (
            <div className="divide-y">
              {reschedulerFlows.map((flow) => (
                <ReschedulerFlowRow key={flow.id} flow={flow} />
              ))}
            </div>
          ) : (
            <EmptyState />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ReschedulerFlowRow({ flow }: { flow: ReschedulerFlow }) {
  const fetcher = useFetcher<ReschedulerActionResult>();
  const isSubmitting = fetcher.state !== "idle";
  const isActive = activeStates.has(flow.state);
  const originalCustomer = flow.originalAppointment.customer;
  const originalName = originalCustomer
    ? `${originalCustomer.firstName} ${originalCustomer.lastName}`
    : flow.originalAppointment.title;

  React.useEffect(() => {
    if (!fetcher.data) return;

    if (fetcher.data.ok) {
      toast.success(fetcher.data.message);
    } else {
      toast.error("Unable to abort rebooking", {
        description: fetcher.data.message,
      });
    }
  }, [fetcher.data]);

  return (
    <article className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.9fr)_auto] lg:items-start">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <StateBadge state={flow.state} />
          <span className="text-sm text-muted-foreground">
            Created {formatDateTime(flow.createdAt)}
          </span>
        </div>
        <div className="space-y-1">
          <div className="flex min-w-0 items-center gap-2">
            <CalendarClock className="size-4 shrink-0 text-muted-foreground" />
            <h2 className="truncate text-base font-semibold">
              {formatDateTime(flow.originalAppointment.startsAt)}
            </h2>
          </div>
          <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
            <UserRound className="size-4 shrink-0" />
            <span className="truncate">{originalName}</span>
          </div>
        </div>
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <InfoPill
            icon={Clock3}
            label="Original slot"
            value={`${formatTime(flow.originalAppointment.startsAt)}-${formatTime(flow.originalAppointment.endsAt)}`}
          />
          <InfoPill
            icon={CircleAlert}
            label="Reason"
            value={flow.cancellationReason || "No reason provided"}
          />
        </div>
        {flow.replacement ? (
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
            <span className="font-medium">Filled by </span>
            {flow.replacement.customer
              ? `${flow.replacement.customer.firstName} ${flow.replacement.customer.lastName}`
              : flow.replacement.appointmentId}
          </div>
        ) : null}
      </div>

      <CandidateList candidates={flow.candidates} />

      <div className="flex lg:justify-end">
        {isActive ? (
          <fetcher.Form method="post" className="w-full lg:w-auto">
            <input type="hidden" name="reschedulerFlowId" value={flow.id} />
            <Button
              type="submit"
              variant="outline"
              size="sm"
              className="w-full border-destructive/40 text-destructive hover:bg-destructive/10 lg:w-auto"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <RefreshCw className="size-4 animate-spin" />
              ) : (
                <Ban className="size-4" />
              )}
              Abort
            </Button>
          </fetcher.Form>
        ) : (
          <span className="inline-flex h-9 items-center rounded-md border bg-muted px-3 text-sm text-muted-foreground">
            No action
          </span>
        )}
      </div>
    </article>
  );
}

function CandidateList({ candidates }: { candidates: ReschedulerCandidate[] }) {
  return (
    <div className="min-w-0 space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <PhoneCall className="size-4 text-muted-foreground" />
        Called candidates
        <span className="rounded-md border bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
          {candidates.length}
        </span>
      </div>
      {candidates.length > 0 ? (
        <div className="space-y-2">
          {candidates.map((candidate) => {
            const name = candidate.customer
              ? `${candidate.customer.firstName} ${candidate.customer.lastName}`
              : "Unknown candidate";

            return (
              <div
                key={candidate.id}
                className="grid gap-1 rounded-md border bg-background px-3 py-2 text-sm"
              >
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span className="truncate font-medium">{name}</span>
                  <CandidateStateBadge candidate={candidate} />
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>{candidate.calledAt ? formatDateTime(candidate.calledAt) : "Not called yet"}</span>
                  {candidate.customer?.phone ? <span>{candidate.customer.phone}</span> : null}
                </div>
                {candidate.notes ? (
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    {candidate.notes}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
          No contacted people remain for this flow.
        </div>
      )}
    </div>
  );
}

function StateBadge({ state }: { state: ReschedulerState }) {
  const Icon =
    state === "filled"
      ? CheckCircle2
      : state === "aborted" || state === "failed"
        ? XCircle
        : state === "calling"
          ? PhoneCall
          : Clock3;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium",
        state === "filled" && "border-emerald-200 bg-emerald-50 text-emerald-700",
        state === "calling" && "border-sky-200 bg-sky-50 text-sky-700",
        state === "pending" && "border-amber-200 bg-amber-50 text-amber-700",
        state === "aborted" && "border-muted bg-muted text-muted-foreground",
        state === "failed" && "border-destructive/30 bg-destructive/10 text-destructive",
      )}
    >
      <Icon className="size-3.5" />
      {stateLabels[state]}
    </span>
  );
}

function CandidateStateBadge({ candidate }: { candidate: ReschedulerCandidate }) {
  const { state } = candidate;

  return (
    <span
      className={cn(
        "shrink-0 rounded-md border px-2 py-0.5 text-xs",
        state === "accepted" && "border-emerald-200 bg-emerald-50 text-emerald-700",
        state === "interested" && "border-sky-200 bg-sky-50 text-sky-700",
        state === "declined" && "border-rose-200 bg-rose-50 text-rose-700",
        state === "not_reached" && "border-amber-200 bg-amber-50 text-amber-700",
        state === "skipped" && "border-muted bg-muted text-muted-foreground",
      )}
    >
      {getCandidateStateLabel(candidate)}
    </span>
  );
}

function InfoPill({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="truncate font-medium">{value}</div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="rounded-full border bg-muted p-3">
        <RotateCcw className="size-6 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <h2 className="text-base font-semibold">No rescheduler activity</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Cancelled bookings that enter the rebooking flow will appear here.
        </p>
      </div>
    </div>
  );
}

function formatDateTime(value: string | null) {
  if (!value) return "Not set";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
