import * as React from "react";

import { Input } from "@/components/ui/input";

const deadlineOptions = [
  { value: 5, label: "5 minutes" },
  { value: 30, label: "30 minutes" },
  { value: 60, label: "60 minutes" },
  { value: 120, label: "2 hours" },
  { value: 300, label: "5 hours" },
];

const presetValues = new Set(deadlineOptions.map((option) => option.value));

export function ResponseDeadlineField({
  defaultValue,
  error,
}: {
  defaultValue: number;
  error?: string;
}) {
  const isPreset = presetValues.has(defaultValue);
  const [selection, setSelection] = React.useState(
    isPreset ? String(defaultValue) : "custom",
  );
  const [customMinutes, setCustomMinutes] = React.useState(
    isPreset ? 60 : defaultValue,
  );
  const submittedMinutes =
    selection === "custom" ? customMinutes : Number(selection);

  return (
    <div className="grid gap-2">
      <label className="grid gap-1 text-xs font-medium">
        Email response time
        <select
          className="h-8 w-full rounded-md border border-input bg-input/20 px-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 md:text-xs dark:bg-input/30"
          value={selection}
          onChange={(event) => setSelection(event.target.value)}
        >
          {deadlineOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
          <option value="custom">Custom</option>
        </select>
      </label>

      {selection === "custom" ? (
        <label className="grid gap-1 text-xs font-medium">
          Custom minutes
          <Input
            aria-invalid={Boolean(error) || undefined}
            type="number"
            min={1}
            max={10080}
            step={1}
            value={customMinutes}
            onChange={(event) => setCustomMinutes(Number(event.target.value))}
            required
          />
        </label>
      ) : null}

      <input
        type="hidden"
        name="emailResponseDeadlineMinutes"
        value={String(submittedMinutes)}
      />
      <span className="text-xs font-normal text-muted-foreground">
        After this time, the email link expires and the next waitlist patient is called.
      </span>
      {error ? (
        <span className="text-xs font-normal text-destructive">{error}</span>
      ) : null}
    </div>
  );
}
