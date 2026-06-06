import * as React from "react";
import { KeyRound, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { useFetcher, useLoaderData } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { type FonioApiKeySummary, loadFonioApiKey, rotateFonioApiKey, revokeFonioApiKey } from "@/lib/fonio-settings";

type SettingsLoaderData = Awaited<ReturnType<typeof loadFonioApiKey>>;
type SettingsActionData =
  | Awaited<ReturnType<typeof rotateFonioApiKey>>
  | Awaited<ReturnType<typeof revokeFonioApiKey>>
  | { ok: false; message: string };

export function SettingsPage() {
  const { apiKey } = useLoaderData() as SettingsLoaderData;
  const fetcher = useFetcher<SettingsActionData>();
  const [name, setName] = React.useState(apiKey?.name ?? "Fonio");
  const latestCreatedKey = fetcher.data && fetcher.data.ok && "apiKey" in fetcher.data
    ? fetcher.data.apiKey
    : null;

  const isBusy = fetcher.state !== "idle";
  const activeKey = apiKey && !apiKey.revokedAt ? apiKey : null;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <section className="flex flex-col gap-2 rounded-lg border bg-background p-4 shadow-sm">
        <p className="text-xs font-medium text-muted-foreground">Settings</p>
        <h1 className="text-2xl font-semibold">Fonio API Access</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Create a client-scoped API key for Fonio. Use it as
          <code className="mx-1 rounded bg-muted px-1.5 py-0.5 text-xs">Authorization: Bearer &lt;key&gt;</code>
          on every Fonio backend call.
        </p>
      </section>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-muted-foreground" />
            Active API Key
          </CardTitle>
          <CardDescription>
            One active key per client. Rotating it immediately revokes the previous key.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
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

          {fetcher.data?.ok === false ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {fetcher.data.message}
            </p>
          ) : null}

          <fetcher.Form method="post" className="flex flex-wrap gap-2">
            <input name="name" type="hidden" value={name} />
            <Button name="_intent" value="rotate" type="submit" disabled={isBusy}>
              {isBusy ? <RefreshCw className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
              {activeKey ? "Rotate API key" : "Create API key"}
            </Button>
            {activeKey ? (
              <Button
                name="_intent"
                value="revoke"
                type="submit"
                variant="outline"
                disabled={isBusy}
              >
                <Trash2 className="size-4" />
                Revoke key
              </Button>
            ) : null}
          </fetcher.Form>
        </CardContent>
      </Card>
    </div>
  );
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
