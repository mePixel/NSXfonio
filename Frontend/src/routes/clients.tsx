import * as React from "react";
import {
  Mail,
  Phone,
  Plus,
  RefreshCw,
  UserRound,
  UsersRound,
} from "lucide-react";
import {
  useFetcher,
  useLoaderData,
  useRevalidator,
} from "react-router";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { createClient, loadClients, type Client } from "@/lib/clients";
import { cn } from "@/lib/utils";

type ClientsLoaderData = Awaited<ReturnType<typeof loadClients>>;
type CreateClientResult = Awaited<ReturnType<typeof createClient>>;

export function ClientsPage() {
  const { clients } = useLoaderData() as ClientsLoaderData;
  const revalidator = useRevalidator();
  const fetcher = useFetcher<CreateClientResult>();
  const formRef = React.useRef<HTMLFormElement>(null);
  const [open, setOpen] = React.useState(false);
  const isSubmitting = fetcher.state !== "idle";
  const isRefreshing = revalidator.state === "loading";
  const actionData = fetcher.data;
  const fieldErrors = actionData?.ok === false ? actionData.errors : {};
  const formError = actionData?.ok === false ? actionData.message : null;

  React.useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) {
      formRef.current?.reset();
      const closeTimer = window.setTimeout(() => setOpen(false), 0);

      return () => window.clearTimeout(closeTimer);
    }
  }, [fetcher.data, fetcher.state]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-lg border bg-background p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium text-muted-foreground">
            Client directory
          </p>
          <h1 className="truncate text-2xl font-semibold">Clients</h1>
        </div>
        <CreateClientPopover
          fetcher={fetcher}
          fieldErrors={fieldErrors}
          formError={formError}
          formRef={formRef}
          isSubmitting={isSubmitting}
          open={open}
          setOpen={setOpen}
        />
      </section>

      <Card className="shadow-sm">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2">
            <UsersRound className="size-4 text-muted-foreground" />
            All clients
            {isRefreshing ? (
              <RefreshCw className="ml-1 size-3.5 animate-spin text-muted-foreground" />
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {clients.length > 0 ? (
            <ClientsTable clients={clients} />
          ) : (
            <EmptyClientsState onCreate={() => setOpen(true)} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CreateClientPopover({
  fetcher,
  fieldErrors,
  formError,
  formRef,
  isSubmitting,
  open,
  setOpen,
}: {
  fetcher: ReturnType<typeof useFetcher<CreateClientResult>>;
  fieldErrors: Partial<
    Record<
      "firstName" | "lastName" | "telephoneNumber" | "email" | "description",
      string
    >
  >;
  formError: string | null;
  formRef: React.RefObject<HTMLFormElement | null>;
  isSubmitting: boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  return (
    <Popover open={open} onOpenChange={setOpen} modal="trap-focus">
      <PopoverTrigger render={<Button size="sm" />}>
        <Plus className="size-4" />
        New client
      </PopoverTrigger>
      <PopoverContent className="w-[24rem] p-0">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-medium">Create client</h2>
          <p className="text-xs text-muted-foreground">
            Add contact details for a visitor.
          </p>
        </div>
        <fetcher.Form
          ref={formRef}
          method="post"
          action="/clients"
          className="grid gap-3 p-4"
        >
          {formError ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {formError}
            </p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField
              error={fieldErrors.firstName}
              label="First name"
              name="firstName"
              required
            />
            <FormField
              error={fieldErrors.lastName}
              label="Last name"
              name="lastName"
              required
            />
          </div>
          <FormField
            error={fieldErrors.telephoneNumber}
            label="Telephone number"
            name="telephoneNumber"
            required
            type="tel"
          />
          <FormField
            error={fieldErrors.email}
            label="Email"
            name="email"
            required
            type="email"
          />
          <label className="grid gap-1 text-xs font-medium">
            Description
            <textarea
              aria-invalid={Boolean(fieldErrors.description) || undefined}
              className={cn(
                "min-h-20 w-full resize-none rounded-md border border-input bg-input/20 px-2 py-1.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 md:text-xs/relaxed dark:bg-input/30",
                fieldErrors.description && "border-destructive",
              )}
              name="description"
              placeholder="Reason for visit, notes, or context"
            />
            {fieldErrors.description ? (
              <span className="text-xs font-normal text-destructive">
                {fieldErrors.description}
              </span>
            ) : null}
          </label>
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isSubmitting}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isSubmitting}>
              {isSubmitting ? (
                <RefreshCw className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Save client
            </Button>
          </div>
        </fetcher.Form>
      </PopoverContent>
    </Popover>
  );
}

function FormField({
  error,
  label,
  name,
  required,
  type = "text",
}: {
  error?: string;
  label: string;
  name: string;
  required?: boolean;
  type?: React.HTMLInputTypeAttribute;
}) {
  return (
    <label className="grid gap-1 text-xs font-medium">
      {label}
      <Input
        aria-invalid={Boolean(error) || undefined}
        name={name}
        required={required}
        type={type}
      />
      {error ? (
        <span className="text-xs font-normal text-destructive">{error}</span>
      ) : null}
    </label>
  );
}

function ClientsTable({ clients }: { clients: Client[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-left text-sm">
        <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Name</th>
            <th className="px-4 py-3 font-medium">Telephone</th>
            <th className="px-4 py-3 font-medium">Email</th>
            <th className="px-4 py-3 font-medium">Description</th>
            <th className="px-4 py-3 font-medium">Created</th>
          </tr>
        </thead>
        <tbody>
          {clients.map((client) => (
            <tr key={client.id} className="border-b last:border-b-0">
              <td className="px-4 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground">
                    <UserRound className="size-4" />
                  </span>
                  <span className="truncate font-medium">
                    {client.firstName} {client.lastName}
                  </span>
                </div>
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Phone className="size-3.5" />
                  <a href={`tel:${client.telephoneNumber}`} className="hover:underline">{client.telephoneNumber}</a>
                </div>
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Mail className="size-3.5" />
                  <a href={`mailto:${client.email}`} className="hover:underline">{client.email}</a>
                </div>
              </td>
              <td className="max-w-64 px-4 py-3 text-muted-foreground">
                <span className="line-clamp-2">
                  {client.description || "No description"}
                </span>
              </td>
              <td className="px-4 py-3 text-xs text-muted-foreground">
                {formatDate(client.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyClientsState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-3 px-4 py-10 text-center">
      <span className="flex size-10 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
        <UsersRound className="size-5" />
      </span>
      <div className="space-y-1">
        <h2 className="text-sm font-medium">No clients yet</h2>
        <p className="max-w-sm text-xs text-muted-foreground">
          Create the first visitor record to start building the directory.
        </p>
      </div>
      <Button type="button" size="sm" onClick={onCreate}>
        <Plus className="size-4" />
        New client
      </Button>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
