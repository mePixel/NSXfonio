"use client";

import * as React from "react";
import {
  CalendarClock,
  KeyRound,
  Moon,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sun,
  Trash2,
} from "lucide-react";
import { useFetcher, useRevalidator } from "react-router";

import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ResponseDeadlineField } from "@/components/response-deadline-field";
import { cn } from "@/lib/utils";
import {
  loadAppointmentSettings,
  updateAppointmentSettings,
} from "@/lib/appointments";
import {
  type FonioApiKeySummary,
  loadFonioApiKey,
  rotateFonioApiKey,
  revokeFonioApiKey,
} from "@/lib/fonio-settings";

// ---------------------------------------------------------------------------
// Weekday options (shared with appointment settings)
// ---------------------------------------------------------------------------
const weekdayOptions = [
  { label: "Mon", value: 1 },
  { label: "Tue", value: 2 },
  { label: "Wed", value: 3 },
  { label: "Thu", value: 4 },
  { label: "Fri", value: 5 },
  { label: "Sat", value: 6 },
  { label: "Sun", value: 0 },
];

// ---------------------------------------------------------------------------
// Settings panel keys
// ---------------------------------------------------------------------------
type SettingsPanel = "general" | "appointments";

const panels: { key: SettingsPanel; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "general", label: "General", icon: KeyRound },
  { key: "appointments", label: "Appointments", icon: CalendarClock },
];

// ---------------------------------------------------------------------------
// Unified Settings Dialog
// ---------------------------------------------------------------------------
export function SettingsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [activePanel, setActivePanel] = React.useState<SettingsPanel>("general");

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent
        className="flex h-[min(720px,calc(100dvh-2rem))] w-[min(920px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden p-0"
        showCloseButton
      >
        {/* Dialog header */}
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Manage your general and appointment preferences.
          </DialogDescription>
        </DialogHeader>

        {/* Body: sidebar + content */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Inner sidebar */}
          <nav className="flex w-44 shrink-0 flex-col border-r bg-muted/30 py-2">
            {panels.map((panel) => {
              const isActive = activePanel === panel.key;
              return (
                <button
                  key={panel.key}
                  type="button"
                  onClick={() => setActivePanel(panel.key)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors hover:bg-muted",
                    isActive
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  <panel.icon className="size-4" />
                  {panel.label}
                </button>
              );
            })}
          </nav>

          {/* Content area */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {activePanel === "general" ? (
              <GeneralSettingsPanel />
            ) : (
              <AppointmentSettingsPanel onClose={onClose} />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// General Settings Panel (Fonio API Key)
// ---------------------------------------------------------------------------
type FonioLoaderData = Awaited<ReturnType<typeof loadFonioApiKey>>;
type FonioActionData =
  | Awaited<ReturnType<typeof rotateFonioApiKey>>
  | Awaited<ReturnType<typeof revokeFonioApiKey>>
  | { ok: false; message: string };
type FonioFetcherData = FonioLoaderData | FonioActionData;

function GeneralSettingsPanel() {
  const fetcher = useFetcher<FonioFetcherData>();
  const revalidator = useRevalidator();
  const [name, setName] = React.useState("Fonio");
  const loadedRef = React.useRef(false);

  // Load API key data on first mount
  React.useEffect(() => {
    if (!loadedRef.current) {
      loadedRef.current = true;
      void fetcher.load("/settings");
    }
  }, [fetcher]);

  const apiKey = getFonioKeySummary(fetcher.data);
  const latestCreatedKey = getLatestCreatedKey(fetcher.data);
  const actionError = getFonioActionError(fetcher.data);

  React.useEffect(() => {
    if (fetcher.state === "idle" && isSuccessfulFonioAction(fetcher.data)) {
      void revalidator.revalidate();
    }
  }, [fetcher.data, fetcher.state, revalidator]);

  const isBusy = fetcher.state !== "idle";
  const activeKey = apiKey && !apiKey.revokedAt ? apiKey : null;

  if (fetcher.state === "loading" && !apiKey) {
    return (
      <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
        <RefreshCw className="mr-2 size-4 animate-spin" />
        Loading settings
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <AppearanceSettingsSection />

      <div className="flex flex-col gap-1">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="size-4 text-muted-foreground" />
          Fonio API Access
        </h3>
        <p className="text-xs text-muted-foreground">
          {"Create a client-scoped API key for Fonio. Use it as "}
          <code className="mx-1 rounded bg-muted px-1.5 py-0.5 text-xs">
            {"Authorization: Bearer <key>"}
          </code>
          {" on every Fonio backend call."}
        </p>
      </div>

      <label className="grid gap-1 text-xs font-medium">
        Key name
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Fonio"
          maxLength={100}
        />
      </label>

      {activeKey ? <KeySummaryCard apiKey={activeKey} /> : (
        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          No active Fonio API key for this client.
        </div>
      )}

      {latestCreatedKey ? (
        <label className="grid gap-2 text-xs font-medium">
          New API key
          <textarea
            readOnly
            className="min-h-28 w-full resize-none rounded-md border bg-muted px-3 py-2 font-mono text-xs"
            value={latestCreatedKey}
          />
          <span className="text-xs font-normal text-muted-foreground">
            Copy this now. It is only shown once.
          </span>
        </label>
      ) : null}

      {actionError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {actionError.message}
        </p>
      ) : null}

      <fetcher.Form method="post" action="/settings" className="flex flex-wrap gap-2">
        <input name="name" type="hidden" value={name} />
        <Button name="_intent" value="rotate" type="submit" disabled={isBusy} size="sm">
          {isBusy ? <RefreshCw className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
          {activeKey ? "Rotate API key" : "Create API key"}
        </Button>
        {activeKey ? (
          <Button
            name="_intent"
            value="revoke"
            type="submit"
            variant="outline"
            size="sm"
            disabled={isBusy}
          >
            <Trash2 className="size-4" />
            Revoke key
          </Button>
        ) : null}
      </fetcher.Form>
    </div>
  );
}

function AppearanceSettingsSection() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <section className="grid gap-3 rounded-lg border bg-muted/20 p-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold">Appearance</h3>
        <p className="text-xs text-muted-foreground">
          Choose the color mode used across the app.
        </p>
      </div>
      <ButtonGroup className="w-fit">
        <Button
          type="button"
          variant={resolvedTheme === "light" ? "default" : "outline"}
          size="sm"
          aria-pressed={resolvedTheme === "light"}
          onClick={() => setTheme("light")}
        >
          <Sun className="size-4" />
          Light
        </Button>
        <Button
          type="button"
          variant={resolvedTheme === "dark" ? "default" : "outline"}
          size="sm"
          aria-pressed={resolvedTheme === "dark"}
          onClick={() => setTheme("dark")}
        >
          <Moon className="size-4" />
          Dark
        </Button>
      </ButtonGroup>
    </section>
  );
}

function getFonioKeySummary(data: FonioFetcherData | undefined) {
  if (!data) return null;
  if ("summary" in data) return data.summary;
  if ("revoked" in data) return data.revoked;
  if ("apiKey" in data && typeof data.apiKey !== "string") return data.apiKey;
  return null;
}

function getLatestCreatedKey(data: FonioFetcherData | undefined) {
  if (data && "ok" in data && data.ok && "apiKey" in data && typeof data.apiKey === "string") {
    return data.apiKey;
  }

  return null;
}

function getFonioActionError(data: FonioFetcherData | undefined) {
  if (data && "ok" in data && data.ok === false) {
    return data;
  }

  return null;
}

function isSuccessfulFonioAction(data: FonioFetcherData | undefined) {
  return Boolean(data && "ok" in data && data.ok);
}

function KeySummaryCard({ apiKey }: { apiKey: FonioApiKeySummary }) {
  return (
    <div className="grid gap-3 rounded-lg border bg-muted/20 p-4 text-sm">
      <div className="grid gap-1">
        <span className="text-xs font-medium text-muted-foreground">Prefix</span>
        <code className="w-fit rounded bg-muted px-2 py-1 text-xs">{apiKey.keyPrefix}...</code>
      </div>
      <div className="grid gap-1 sm:grid-cols-2 sm:gap-4">
        <MetaItem label="Created" value={formatDateTime(apiKey.createdAt)} />
        <MetaItem label="Last used" value={apiKey.lastUsedAt ? formatDateTime(apiKey.lastUsedAt) : "Never"} />
      </div>
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

// ---------------------------------------------------------------------------
// Appointment Settings Panel
// ---------------------------------------------------------------------------
function AppointmentSettingsPanel({ onClose }: { onClose: () => void }) {
  const fetcher = useFetcher<
    | Awaited<ReturnType<typeof loadAppointmentSettings>>
    | Awaited<ReturnType<typeof updateAppointmentSettings>>
  >();
  const fetcherData = fetcher.data;
  const settings = fetcherData && "settings" in fetcherData ? fetcherData.settings : null;
  const actionError =
    fetcherData && "ok" in fetcherData && fetcherData.ok === false
      ? fetcherData
      : null;
  const isSubmitting = fetcher.state !== "idle";
  const wasSavingRef = React.useRef(false);

  React.useEffect(() => {
    if (!settings && fetcher.state === "idle") {
      void fetcher.load("/appointment-settings");
    }
  }, [fetcher, settings]);

  React.useEffect(() => {
    if (fetcher.state === "submitting") {
      wasSavingRef.current = true;
    }

    if (
      wasSavingRef.current &&
      fetcher.state === "idle" &&
      fetcherData &&
      "ok" in fetcherData &&
      fetcherData.ok
    ) {
      wasSavingRef.current = false;
      const closeTimer = window.setTimeout(onClose, 0);
      return () => window.clearTimeout(closeTimer);
    }

    if (fetcher.state === "idle" && fetcherData && "ok" in fetcherData) {
      wasSavingRef.current = false;
    }
  }, [fetcherData, fetcher.state, onClose]);

  if (!settings) {
    return (
      <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
        <RefreshCw className="mr-2 size-4 animate-spin" />
        Loading settings
      </div>
    );
  }

  return (
    <fetcher.Form
      method="post"
      action="/appointment-settings"
      className="grid gap-4"
    >
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold">Appointment Settings</h3>
        <p className="text-xs text-muted-foreground">
          Configure slot length, office hours, working days, and rescheduler behavior.
        </p>
      </div>

      {actionError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {actionError.message}
        </p>
      ) : null}

      <label className="grid gap-1 text-xs font-medium">
        Time slot size
        <select
          className="h-8 w-full rounded-md border border-input bg-input/20 px-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 md:text-xs dark:bg-input/30"
          name="timeSlotSize"
          defaultValue={String(settings.timeSlotSize)}
        >
          <option value="15">15 minutes</option>
          <option value="30">30 minutes</option>
          <option value="60">60 minutes</option>
        </select>
        {actionError?.errors.timeSlotSize ? (
          <span className="text-xs font-normal text-destructive">
            {actionError.errors.timeSlotSize}
          </span>
        ) : null}
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-xs font-medium">
          From
          <Input
            aria-invalid={Boolean(actionError?.errors.officeHoursStart) || undefined}
            name="officeHoursStart"
            type="time"
            defaultValue={settings.officeHoursStart}
            required
          />
          {actionError?.errors.officeHoursStart ? (
            <span className="text-xs font-normal text-destructive">
              {actionError.errors.officeHoursStart}
            </span>
          ) : null}
        </label>
        <label className="grid gap-1 text-xs font-medium">
          To
          <Input
            aria-invalid={Boolean(actionError?.errors.officeHoursEnd) || undefined}
            name="officeHoursEnd"
            type="time"
            defaultValue={settings.officeHoursEnd}
            required
          />
          {actionError?.errors.officeHoursEnd ? (
            <span className="text-xs font-normal text-destructive">
              {actionError.errors.officeHoursEnd}
            </span>
          ) : null}
        </label>
      </div>

      <div className="grid gap-2">
        <p className="text-xs font-medium">Working days</p>
        <WorkingDaysToggleGroup
          key={settings.workingDays.join(",")}
          initialWorkingDays={settings.workingDays}
        />
        {actionError?.errors.workingDays ? (
          <span className="text-xs font-normal text-destructive">
            {actionError.errors.workingDays}
          </span>
        ) : null}
      </div>

      <label className="grid gap-1 text-xs font-medium">
        Appointments to consider for waitlist rescheduling
        <Input
          aria-invalid={Boolean(actionError?.errors.reschedulerCandidateWindow) || undefined}
          name="reschedulerCandidateWindow"
          type="number"
          min={1}
          max={10}
          step={1}
          defaultValue={String(settings.reschedulerCandidateWindow)}
          required
        />
        <span className="text-xs font-normal text-muted-foreground">
          Limits how many upcoming appointments Fonio can use when it needs to ask which booking should be replaced.
        </span>
        {actionError?.errors.reschedulerCandidateWindow ? (
          <span className="text-xs font-normal text-destructive">
            {actionError.errors.reschedulerCandidateWindow}
          </span>
        ) : null}
      </label>

      <ResponseDeadlineField
        defaultValue={settings.emailResponseDeadlineMinutes}
        error={actionError?.errors.emailResponseDeadlineMinutes}
      />

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isSubmitting}
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting ? (
            <RefreshCw className="size-4 animate-spin" />
          ) : (
            <Settings2 className="size-4" />
          )}
          Save settings
        </Button>
      </DialogFooter>
    </fetcher.Form>
  );
}

// ---------------------------------------------------------------------------
// Working Days Toggle Group
// ---------------------------------------------------------------------------
function WorkingDaysToggleGroup({
  initialWorkingDays,
}: {
  initialWorkingDays: number[];
}) {
  const [workingDays, setWorkingDays] = React.useState(initialWorkingDays);

  return (
    <>
      <ButtonGroup className="w-full flex-wrap">
        {weekdayOptions.map((day) => {
          const selected = workingDays.includes(day.value);
          return (
            <Button
              key={day.value}
              type="button"
              size="sm"
              variant={selected ? "default" : "outline"}
              aria-pressed={selected}
              className={cn("min-w-14 flex-1", selected && "z-10")}
              onClick={() =>
                setWorkingDays((currentDays) =>
                  currentDays.includes(day.value)
                    ? currentDays.filter((value) => value !== day.value)
                    : [...currentDays, day.value],
                )
              }
            >
              {day.label}
            </Button>
          );
        })}
      </ButtonGroup>
      {workingDays.map((day) => (
        <input key={day} type="hidden" name="workingDays" value={day} />
      ))}
    </>
  );
}
