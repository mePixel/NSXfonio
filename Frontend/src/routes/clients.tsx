import * as React from "react";
import {
  Calendar,
  Mail,
  Phone,
  Plus,
  RefreshCw,
  Trash2,
  UsersRound,
} from "lucide-react";
import { useFetcher, useLoaderData, useRevalidator } from "react-router";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  createClient,
  deleteClient,
  loadClientAppointments,
  loadClients,
  type Appointment,
  type Client,
} from "@/lib/clients";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type ClientsLoaderData = Awaited<ReturnType<typeof loadClients>>;
type CreateClientResult = Awaited<ReturnType<typeof createClient>>;
type DeleteClientResult = Awaited<ReturnType<typeof deleteClient>>;

export function ClientsPage() {
  const { clients } = useLoaderData() as ClientsLoaderData;
  const revalidator = useRevalidator();
  const fetcher = useFetcher<CreateClientResult>();
  const formRef = React.useRef<HTMLFormElement>(null);
  const [open, setOpen] = React.useState(false);
  const [selectedClient, setSelectedClient] = React.useState<Client | null>(
    null,
  );
  const isSubmitting = fetcher.state !== "idle";
  const isRefreshing = revalidator.state === "loading";
  const actionData = fetcher.data;
  const fieldErrors = actionData?.ok === false ? actionData.errors : {};
  const formError = actionData?.ok === false ? actionData.message : null;

  const prevResultRef = React.useRef<typeof fetcher.data>(null);

  React.useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data?.ok &&
      fetcher.data !== prevResultRef.current
    ) {
      prevResultRef.current = fetcher.data;
      const createdClient = fetcher.data.clients[0];
      const clientName = createdClient
        ? `${createdClient.firstName} ${createdClient.lastName}`
        : "";

      toast.success("Client created", {
        description: clientName || undefined,
      });

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
            <ClientsTable
              clients={clients}
              onSelectClient={setSelectedClient}
            />
          ) : (
            <EmptyClientsState onCreate={() => setOpen(true)} />
          )}
        </CardContent>
      </Card>

      <ClientAppointmentsDialog
        client={selectedClient}
        onClose={() => setSelectedClient(null)}
      />
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

function ClientsTable({
  clients,
  onSelectClient,
}: {
  clients: Client[];
  onSelectClient: (client: Client) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] border-collapse text-left text-sm">
        <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Name</th>
            <th className="px-4 py-3 font-medium">Telephone</th>
            <th className="px-4 py-3 font-medium">Email</th>
            <th className="px-4 py-3 font-medium">Waitlist</th>
            <th className="px-4 py-3 font-medium">Description</th>
            <th className="px-4 py-3 font-medium">Created</th>
            <th className="w-12 px-4 py-3 font-medium">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {clients.map((client) => (
            <tr
              key={client.id}
              className="cursor-pointer border-b last:border-b-0 transition-colors hover:bg-muted/50"
              onClick={() => onSelectClient(client)}
            >
              <td className="px-4 py-3">
                <span className="block truncate font-medium">
                  {client.firstName} {client.lastName}
                </span>
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Phone className="size-3.5" />
                  <a
                    href={`tel:${client.telephoneNumber}`}
                    className="hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {client.telephoneNumber}
                  </a>
                </div>
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Mail className="size-3.5" />
                  <a
                    href={`mailto:${client.email}`}
                    className="hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {client.email}
                  </a>
                </div>
              </td>
              <td className="px-4 py-3">
                <WaitlistStatus client={client} />
              </td>
              <td className="max-w-64 px-4 py-3 text-muted-foreground">
                <span className="line-clamp-2">
                  {client.description || "No description"}
                </span>
              </td>
              <td className="px-4 py-3 text-xs text-muted-foreground">
                {formatDate(client.createdAt)}
              </td>
              <td className="px-4 py-3">
                <DeleteClientButton client={client} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WaitlistStatus({ client }: { client: Client }) {
  if (!client.waitlist?.isOnWaitlist) {
    return (
      <span className="inline-flex h-6 items-center rounded-md border px-2 text-xs font-medium text-muted-foreground">
        No
      </span>
    );
  }

  return (
    <span className="inline-flex h-6 items-center rounded-md border border-amber-300 bg-amber-50 px-2 text-xs font-medium text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
      Queue #{client.waitlist.position ?? "-"}
    </span>
  );
}

function DeleteClientButton({ client }: { client: Client }) {
  const fetcher = useFetcher<DeleteClientResult>();
  const isDeleting = fetcher.state !== "idle";
  const prevResultRef = React.useRef<typeof fetcher.data>(null);

  React.useEffect(() => {
    if (
      fetcher.state !== "idle" ||
      !fetcher.data ||
      fetcher.data === prevResultRef.current
    ) {
      return;
    }

    prevResultRef.current = fetcher.data;

    if (fetcher.data.ok) {
      const deletedAppointmentCount = fetcher.data.deletedAppointmentCount;
      toast.success("Client deleted", {
        description:
          deletedAppointmentCount > 0
            ? `${deletedAppointmentCount} appointment${
                deletedAppointmentCount === 1 ? "" : "s"
              } deleted.`
            : undefined,
      });
      return;
    }

    toast.error("Could not delete client", {
      description: fetcher.data.message,
    });
  }, [fetcher.data, fetcher.state]);

  return (
    <fetcher.Form
      method="delete"
      action="/clients"
      onClick={(event) => event.stopPropagation()}
    >
      <input type="hidden" name="clientId" value={client.id} />
      <Button
        type="submit"
        variant="destructive"
        size="icon-sm"
        aria-label={`Delete ${client.firstName} ${client.lastName}`}
        disabled={isDeleting}
        onClick={(event) => {
          event.stopPropagation();

          if (
            !window.confirm(
              `Delete ${client.firstName} ${client.lastName} and all appointments for this client?`,
            )
          ) {
            event.preventDefault();
          }
        }}
      >
        {isDeleting ? (
          <RefreshCw className="size-3 animate-spin" />
        ) : (
          <Trash2 className="size-3" />
        )}
      </Button>
    </fetcher.Form>
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

function formatDateOnly(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
  }).format(new Date(value));
}

function formatTimeOnly(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    timeStyle: "short",
  }).format(new Date(value));
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    scheduled: "Scheduled",
    confirmation_pending: "Confirmation Pending",
    confirmed: "Confirmed",
    followup_sent: "Follow-up Sent",
    cancel_pending: "Cancel Pending",
    cancelled: "Cancelled",
    completed: "Completed",
    no_show: "No Show",
  };
  return map[status] ?? status;
}

function statusColor(status: string) {
  const map: Record<string, string> = {
    scheduled:
      "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    confirmation_pending:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    confirmed:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    followup_sent:
      "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
    cancel_pending:
      "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
    cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    completed:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
    no_show: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
  };
  return (
    map[status] ??
    "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400"
  );
}

function ClientAppointmentsDialog({
  client,
  onClose,
}: {
  client: Client | null;
  onClose: () => void;
}) {
  const [appointments, setAppointments] = React.useState<Appointment[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const open = client !== null;

  React.useEffect(() => {
    if (!client) {
      setAppointments([]);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    loadClientAppointments(client.id)
      .then((data) => {
        if (!cancelled) {
          setAppointments(data.appointments);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load appointments.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [client]);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="size-4 text-muted-foreground" />
            {client ? `${client.firstName} ${client.lastName}` : "Client"} —
            Appointments
          </DialogTitle>
          <DialogDescription>
            Past and upcoming appointments for this client.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <RefreshCw className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : appointments.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <Calendar className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No appointments found for this client.
            </p>
          </div>
        ) : (
          <div className="max-h-[24rem] overflow-y-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="sticky top-0 border-b bg-background text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Time</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {appointments.map((appointment) => (
                  <tr key={appointment.id} className="border-b last:border-b-0">
                    <td className="px-3 py-2 text-muted-foreground">
                      {formatDateOnly(appointment.startsAt)}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {formatTimeOnly(appointment.startsAt)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                          statusColor(appointment.status),
                        )}
                      >
                        {statusLabel(appointment.status)}
                      </span>
                    </td>
                    <td className="max-w-40 px-3 py-2 text-muted-foreground">
                      <span className="line-clamp-2">
                        {appointment.notes || "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
