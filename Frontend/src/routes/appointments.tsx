import * as React from "react";
import { type DayButtonProps } from "react-day-picker";
import {
  CalendarClock,
  CalendarDays,
  CircleAlert,
  Clock,
  Plus,
  RefreshCw,
  Settings2,
  UserRound,
  XCircle,
} from "lucide-react";
import {
  Form,
  useFetcher,
  useLoaderData,
  useNavigate,
  useRevalidator,
} from "react-router";

import { Button } from "@/components/ui/button";
import { Calendar, CalendarDayButton } from "@/components/ui/calendar";
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
import {
  type Appointment,
  type AppointmentFieldErrors,
  type AppointmentSettings,
  cancelAppointment,
  createAppointment,
} from "@/lib/appointments";
import { type Client } from "@/lib/clients";
import { cn } from "@/lib/utils";

type AppointmentsLoaderData = {
  date: string;
  calendarMonth: string;
  appointments: Appointment[];
  appointmentDates: string[];
  clients: Client[];
  settings: AppointmentSettings;
};
type AppointmentActionResult =
  | Awaited<ReturnType<typeof createAppointment>>
  | Awaited<ReturnType<typeof cancelAppointment>>;

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function AppointmentsPage() {
  const { date, calendarMonth, appointments, appointmentDates, clients, settings } =
    useLoaderData() as AppointmentsLoaderData;
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const fetcher = useFetcher<AppointmentActionResult>();
  const formRef = React.useRef<HTMLFormElement>(null);
  const [open, setOpen] = React.useState(false);
  const isRefreshing = revalidator.state === "loading";
  const createResult =
    fetcher.data?.intent === "createAppointment" ? fetcher.data : null;
  const fieldErrors = createResult?.ok === false ? createResult.errors : {};
  const formError = createResult?.ok === false ? createResult.message : null;
  const selectedDateAppointments = appointments.filter(
    (appointment) => appointment.appointmentDate === date,
  );
  const activeAppointments = selectedDateAppointments.filter(
    (appointment) => appointment.status !== "cancelled",
  );
  const bookedSlots = new Set(
    activeAppointments.map((appointment) => appointment.timeSlot),
  );

  function handleDateChange(nextDate: string) {
    if (nextDate !== date) {
      void navigate(`/appointments?date=${nextDate}`);
    }
  }

  React.useEffect(() => {
    if (fetcher.state === "idle" && createResult?.ok) {
      const createdAppointment = createResult.appointments[0];

      formRef.current?.reset();
      const closeTimer = window.setTimeout(() => {
        setOpen(false);

        if (
          createdAppointment &&
          createdAppointment.appointmentDate !== date
        ) {
          void navigate(`/appointments?date=${createdAppointment.appointmentDate}`);
        }
      }, 0);

      return () => window.clearTimeout(closeTimer);
    }
  }, [createResult, date, fetcher.state, navigate]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-lg border bg-background p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium text-muted-foreground">
            Daily appointment calendar
          </p>
          <h1 className="truncate text-2xl font-semibold">Appointments</h1>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Form method="get" className="flex items-center gap-2">
            <AppointmentDatePicker
              key={date}
              appointmentDates={appointmentDates}
              calendarMonth={calendarMonth}
              value={date}
              onChange={handleDateChange}
            />
            <Input name="date" type="hidden" value={date} />
            <Button type="submit" variant="outline" size="sm">
              <CalendarClock className="size-4" />
              View
            </Button>
          </Form>
          <CreateAppointmentPopover
            key={date}
            bookedSlots={bookedSlots}
            clients={clients}
            date={date}
            fetcher={fetcher}
            fieldErrors={fieldErrors}
            formError={formError}
            formRef={formRef}
            isSubmitting={fetcher.state !== "idle"}
            open={open}
            setOpen={setOpen}
            settings={settings}
          />
        </div>
      </section>

      <Card className="shadow-sm">
        <CardHeader className="border-b">
          <CardTitle className="flex flex-wrap items-center gap-2">
            <Clock className="size-4 text-muted-foreground" />
            {formatLongDate(date)}
            <span className="rounded-md border bg-muted px-2 py-1 text-xs font-normal text-muted-foreground">
              {settings.timeSlotSize} min slots
            </span>
            <span className="rounded-md border bg-muted px-2 py-1 text-xs font-normal text-muted-foreground">
              {settings.officeHoursStart}-{settings.officeHoursEnd}
            </span>
            <span className="rounded-md border bg-muted px-2 py-1 text-xs font-normal text-muted-foreground">
              {settings.workingDays.map((day) => weekdayLabels[day]).join(", ")}
            </span>
            {isRefreshing ? (
              <RefreshCw className="size-3.5 animate-spin text-muted-foreground" />
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {selectedDateAppointments.length > 0 ? (
            <AppointmentsTable appointments={selectedDateAppointments} />
          ) : (
            <EmptyAppointmentsState onCreate={() => setOpen(true)} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AppointmentDatePicker({
  appointmentDates,
  calendarMonth,
  onChange,
  value,
}: {
  appointmentDates: string[];
  calendarMonth: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const selectedDate = dateStringToDate(value);
  const [visibleMonth, setVisibleMonth] = React.useState(() =>
    startOfMonth(selectedDate),
  );
  const dateFetcher = useFetcher<AppointmentsLoaderData>();
  const visibleMonthDate = dateToDateString(startOfMonth(visibleMonth));
  const loadedAppointmentDates = React.useMemo(() => {
    if (dateFetcher.data?.calendarMonth === visibleMonthDate) {
      return dateFetcher.data.appointmentDates;
    }

    if (calendarMonth === visibleMonthDate) {
      return appointmentDates;
    }

    return [];
  }, [
    appointmentDates,
    calendarMonth,
    dateFetcher.data?.appointmentDates,
    dateFetcher.data?.calendarMonth,
    visibleMonthDate,
  ]);
  const appointmentDateSet = React.useMemo(
    () => new Set(loadedAppointmentDates),
    [loadedAppointmentDates],
  );

  function handleMonthChange(month: Date) {
    const nextVisibleMonth = startOfMonth(month);

    setVisibleMonth(nextVisibleMonth);
    void dateFetcher.load(
      `/appointments?date=${value}&month=${dateToDateString(nextVisibleMonth)}`,
    );
  }

  return (
    <Popover modal="trap-focus">
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label="Filter appointments by date"
          />
        }
      >
        <CalendarDays className="size-4" />
        {formatLongDate(value)}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-0">
        <Calendar
          mode="single"
          month={visibleMonth}
          components={{
            DayButton: (props) => (
              <AppointmentCalendarDayButton
                {...props}
                appointmentDateSet={appointmentDateSet}
              />
            ),
          }}
          selected={selectedDate}
          onMonthChange={handleMonthChange}
          onSelect={(nextDate) => {
            if (nextDate) {
              onChange(dateToDateString(nextDate));
            }
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function AppointmentCalendarDayButton({
  appointmentDateSet,
  ...props
}: DayButtonProps & { appointmentDateSet: Set<string> }) {
  const hasAppointments = appointmentDateSet.has(dateToDateString(props.day.date));

  return (
    <CalendarDayButton
      {...props}
      className={cn(
        props.className,
        hasAppointments &&
          "after:absolute after:bottom-0.5 after:left-1/2 after:size-1 after:-translate-x-1/2 after:rounded-full after:bg-primary data-[selected-single=true]:after:bg-primary-foreground",
      )}
    />
  );
}

function CreateAppointmentPopover({
  bookedSlots,
  clients,
  date,
  fetcher,
  fieldErrors,
  formError,
  formRef,
  isSubmitting,
  open,
  setOpen,
  settings,
}: {
  bookedSlots: Set<string>;
  clients: Client[];
  date: string;
  fetcher: ReturnType<typeof useFetcher<AppointmentActionResult>>;
  fieldErrors: AppointmentFieldErrors;
  formError: string | null;
  formRef: React.RefObject<HTMLFormElement | null>;
  isSubmitting: boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
  settings: AppointmentSettings;
}) {
  const [clientMode, setClientMode] = React.useState<"existing" | "new">(
    clients.length > 0 ? "existing" : "new",
  );
  const [appointmentDate, setAppointmentDate] = React.useState(date);
  const dateAppointmentsFetcher = useFetcher<AppointmentsLoaderData>();
  const slots = generateTimeSlots(settings);
  const isWorkingDay = settings.workingDays.includes(getWeekday(appointmentDate));
  const selectedDateBookings =
    appointmentDate === date
      ? bookedSlots
      : new Set(
          dateAppointmentsFetcher.data?.date === appointmentDate
            ? dateAppointmentsFetcher.data.appointments
                .filter((appointment) => appointment.status !== "cancelled")
                .map((appointment) => appointment.timeSlot)
            : [],
        );
  const isLoadingDateBookings =
    appointmentDate !== date && dateAppointmentsFetcher.state !== "idle";

  function handleAppointmentDateChange(nextDate: string) {
    setAppointmentDate(nextDate);

    if (nextDate !== date) {
      void dateAppointmentsFetcher.load(`/appointments?date=${nextDate}`);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen} modal="trap-focus">
      <PopoverTrigger render={<Button size="sm" />}>
        <Plus className="size-4" />
        New appointment
      </PopoverTrigger>
      <PopoverContent className="w-[30rem] p-0">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-medium">Create appointment</h2>
          <p className="text-xs text-muted-foreground">
            Schedule a patient visit for {formatLongDate(appointmentDate)}.
          </p>
        </div>
        <fetcher.Form
          ref={formRef}
          method="post"
          action="/appointments"
          className="grid max-h-[calc(100vh-8rem)] gap-3 overflow-y-auto p-4"
        >
          <input type="hidden" name="intent" value="createAppointment" />
          <input type="hidden" name="appointmentDate" value={appointmentDate} />
          <input type="hidden" name="clientMode" value={clientMode} />
          {formError ? <FormAlert message={formError} /> : null}
          {!isWorkingDay ? (
            <FormAlert message="This date is outside the configured working days." />
          ) : null}
          <DatePickerField
            error={fieldErrors.appointmentDate}
            label="Appointment date"
            value={appointmentDate}
            onChange={handleAppointmentDateChange}
          />

          <div className="grid gap-2">
            <p className="text-xs font-medium">Patient</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                size="sm"
                variant={clientMode === "existing" ? "default" : "outline"}
                disabled={clients.length === 0}
                onClick={() => setClientMode("existing")}
              >
                Existing
              </Button>
              <Button
                type="button"
                size="sm"
                variant={clientMode === "new" ? "default" : "outline"}
                onClick={() => setClientMode("new")}
              >
                New client
              </Button>
            </div>
          </div>

          {clientMode === "existing" ? (
            <SelectField
              error={fieldErrors.clientId}
              label="Client"
              name="clientId"
              required
            >
              <option value="">Choose a client</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.firstName} {client.lastName}
                </option>
              ))}
            </SelectField>
          ) : (
            <div className="grid gap-3 rounded-md border bg-muted/30 p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField
                  error={fieldErrors["newClient.firstName"]}
                  label="First name"
                  name="firstName"
                  required
                />
                <FormField
                  error={fieldErrors["newClient.lastName"]}
                  label="Last name"
                  name="lastName"
                  required
                />
              </div>
              <FormField
                error={fieldErrors["newClient.telephoneNumber"]}
                label="Telephone number"
                name="telephoneNumber"
                required
                type="tel"
              />
              <FormField
                error={fieldErrors["newClient.email"]}
                label="Email"
                name="email"
                required
                type="email"
              />
              <TextareaField
                error={fieldErrors["newClient.description"]}
                label="Client description"
                name="description"
              />
            </div>
          )}

          <SelectField
            error={fieldErrors.timeSlot}
            label="Time slot"
            name="timeSlot"
            required
          >
            <option value="">Choose a time</option>
            {slots.map((slot) => (
              <option key={slot} value={slot} disabled={selectedDateBookings.has(slot)}>
                {slot}
                {selectedDateBookings.has(slot) ? " - booked" : ""}
              </option>
            ))}
          </SelectField>
          {isLoadingDateBookings ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <RefreshCw className="size-3.5 animate-spin" />
              Checking appointments for {formatLongDate(appointmentDate)}
            </p>
          ) : null}

          <TextareaField
            error={fieldErrors.moreInfo}
            label="More info"
            name="moreInfo"
            placeholder="Reason for visit, preparation notes, or context"
          />

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
            <Button type="submit" size="sm" disabled={isSubmitting || !isWorkingDay}>
              {isSubmitting ? (
                <RefreshCw className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Schedule
            </Button>
          </div>
        </fetcher.Form>
      </PopoverContent>
    </Popover>
  );
}

function DatePickerField({
  error,
  label,
  onChange,
  value,
}: {
  error?: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const selectedDate = dateStringToDate(value);

  return (
    <label className="grid gap-1 text-xs font-medium">
      {label}
      <Popover modal="trap-focus">
        <PopoverTrigger render={<Button type="button" variant="outline" size="sm" />}>
          <CalendarDays className="size-4" />
          {formatLongDate(value)}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(nextDate) => {
              if (nextDate) {
                onChange(dateToDateString(nextDate));
              }
            }}
          />
        </PopoverContent>
      </Popover>
      {error ? (
        <span className="text-xs font-normal text-destructive">{error}</span>
      ) : null}
    </label>
  );
}

function AppointmentsTable({ appointments }: { appointments: Appointment[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] border-collapse text-left text-sm">
        <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Time</th>
            <th className="px-4 py-3 font-medium">Patient</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">More info</th>
            <th className="px-4 py-3 text-right font-medium">Action</th>
          </tr>
        </thead>
        <tbody>
          {appointments.map((appointment) => (
            <AppointmentRow key={appointment.id} appointment={appointment} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AppointmentRow({ appointment }: { appointment: Appointment }) {
  const fetcher = useFetcher<AppointmentActionResult>();
  const isCancelling = fetcher.state !== "idle";
  const patientName = `${appointment.client.firstName} ${appointment.client.lastName}`;

  return (
    <tr
      className={cn(
        "border-b last:border-b-0",
        appointment.status === "cancelled" && "bg-muted/30 text-muted-foreground",
      )}
    >
      <td className="px-4 py-3 font-medium">{appointment.timeSlot}</td>
      <td className="px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground">
            <UserRound className="size-4" />
          </span>
          <span className="truncate font-medium">{patientName}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <span
          className={cn(
            "rounded-md border px-2 py-1 text-xs capitalize",
            appointment.status === "cancelled"
              ? "bg-muted text-muted-foreground"
              : "bg-primary/10 text-primary",
          )}
        >
          {appointment.status}
        </span>
      </td>
      <td className="max-w-80 px-4 py-3 text-muted-foreground">
        <span className="line-clamp-2">
          {appointment.status === "cancelled" && appointment.cancellationReason
            ? `Cancelled: ${appointment.cancellationReason}`
            : appointment.moreInfo || "No notes"}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        {appointment.status === "cancelled" ? null : (
          <fetcher.Form method="post" action="/appointments" className="inline-flex gap-2">
            <input type="hidden" name="intent" value="cancelAppointment" />
            <input type="hidden" name="appointmentId" value={appointment.id} />
            <Input
              aria-label="Cancellation reason"
              className="inline-block w-44"
              name="cancellationReason"
              placeholder="Reason"
            />
            <Button type="submit" variant="destructive" size="sm" disabled={isCancelling}>
              {isCancelling ? (
                <RefreshCw className="size-4 animate-spin" />
              ) : (
                <XCircle className="size-4" />
              )}
              Cancel
            </Button>
          </fetcher.Form>
        )}
      </td>
    </tr>
  );
}

function EmptyAppointmentsState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-3 px-4 py-10 text-center">
      <span className="flex size-10 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
        <Settings2 className="size-5" />
      </span>
      <div className="space-y-1">
        <h2 className="text-sm font-medium">No appointments for this date</h2>
        <p className="max-w-sm text-xs text-muted-foreground">
          Schedule a patient visit for the selected day.
        </p>
      </div>
      <Button type="button" size="sm" onClick={onCreate}>
        <Plus className="size-4" />
        New appointment
      </Button>
    </div>
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

function SelectField({
  children,
  error,
  label,
  name,
  required,
}: {
  children: React.ReactNode;
  error?: string;
  label: string;
  name: string;
  required?: boolean;
}) {
  return (
    <label className="grid gap-1 text-xs font-medium">
      {label}
      <select
        aria-invalid={Boolean(error) || undefined}
        className={cn(
          "h-8 w-full rounded-md border border-input bg-input/20 px-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 md:text-xs dark:bg-input/30",
          error && "border-destructive",
        )}
        name={name}
        required={required}
      >
        {children}
      </select>
      {error ? (
        <span className="text-xs font-normal text-destructive">{error}</span>
      ) : null}
    </label>
  );
}

function TextareaField({
  error,
  label,
  name,
  placeholder,
}: {
  error?: string;
  label: string;
  name: string;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-1 text-xs font-medium">
      {label}
      <textarea
        aria-invalid={Boolean(error) || undefined}
        className={cn(
          "min-h-20 w-full resize-none rounded-md border border-input bg-input/20 px-2 py-1.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 md:text-xs/relaxed dark:bg-input/30",
          error && "border-destructive",
        )}
        name={name}
        placeholder={placeholder}
      />
      {error ? (
        <span className="text-xs font-normal text-destructive">{error}</span>
      ) : null}
    </label>
  );
}

function FormAlert({ message }: { message: string }) {
  return (
    <p className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
      <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
      {message}
    </p>
  );
}

function generateTimeSlots(settings: AppointmentSettings) {
  const slots: string[] = [];
  const startMinutes = timeSlotToMinutes(settings.officeHoursStart);
  const endMinutes = timeSlotToMinutes(settings.officeHoursEnd);

  if (startMinutes === null || endMinutes === null || startMinutes >= endMinutes) {
    return slots;
  }

  for (
    let minutes = startMinutes;
    minutes < endMinutes;
    minutes += settings.timeSlotSize
  ) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    slots.push(`${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`);
  }

  return slots;
}

function timeSlotToMinutes(value: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    return null;
  }

  const [hours, minutes] = value.split(":").map((part) => Number(part));

  return hours * 60 + minutes;
}

function getWeekday(date: string) {
  return new Date(`${date}T00:00:00`).getDay();
}

function dateStringToDate(value: string) {
  return new Date(`${value}T00:00:00`);
}

function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function dateToDateString(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatLongDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "full",
  }).format(dateStringToDate(value));
}
