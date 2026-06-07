import { useEffect, useState, type ReactNode } from "react";
import { CalendarClock, CheckCircle2, CircleAlert, Clock3, RefreshCw } from "lucide-react";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type PublicRescheduleOffer } from "@/lib/public-rescheduler";

type PublicReschedulerLoaderData = {
  offer: PublicRescheduleOffer;
};

type PublicReschedulerActionData = {
  ok: boolean;
  message: string;
};

export function PublicReschedulerPage() {
  const { offer } = useLoaderData() as PublicReschedulerLoaderData;
  const actionData = useActionData() as PublicReschedulerActionData | undefined;
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const appointments = offer.upcomingAppointments;
  const hasSelectableAppointment = appointments.length > 0;
  const remainingTime = useRemainingTime(offer.responseDeadlineAt);
  const isExpired = remainingTime !== null && remainingTime <= 0;

  return (
    <main className="min-h-svh bg-[linear-gradient(180deg,rgba(245,247,250,1)_0%,rgba(255,255,255,1)_35%,rgba(244,238,226,0.9)_100%)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <section className="rounded-[28px] border border-slate-200/80 bg-white/90 p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.35)] backdrop-blur sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
            Earlier Appointment Available
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            Confirm your new appointment
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
            We opened an earlier time for {offer.customer.firstName} {offer.customer.lastName}. Choose which of the next
            three appointments should be cancelled after this new booking is confirmed.
          </p>
        </section>

        <Card className="rounded-[24px] border-slate-200/80 shadow-[0_20px_50px_-35px_rgba(15,23,42,0.45)]">
          <CardHeader className="gap-4 border-b border-slate-200/80">
            <CardTitle className="flex items-center gap-2 text-slate-950">
              <CalendarClock className="size-5 text-slate-500" />
              New free slot
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 p-6 sm:grid-cols-2">
            <InfoCard
              icon={<CalendarClock className="size-4 text-slate-500" />}
              label="Date"
              value={formatDate(offer.slot.startsAt)}
            />
            <InfoCard
              icon={<Clock3 className="size-4 text-slate-500" />}
              label="Time"
              value={`${formatTime(offer.slot.startsAt)} - ${formatTime(offer.slot.endsAt)}`}
            />
          </CardContent>
        </Card>

        <Card className="rounded-[24px] border-slate-200/80 shadow-[0_20px_50px_-35px_rgba(15,23,42,0.45)]">
          <CardHeader className="gap-3 border-b border-slate-200/80">
            <CardTitle className="text-slate-950">Which appointment should we cancel?</CardTitle>
            <p className="text-sm text-slate-600">
              We show up to the next three future appointments currently assigned to this patient.
            </p>
          </CardHeader>
          <CardContent className="space-y-5 p-6">
            {actionData ? (
              <div
                className={
                  actionData.ok
                    ? "rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
                    : "rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
                }
              >
                {actionData.message}
              </div>
            ) : null}

            {!hasSelectableAppointment ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                No upcoming appointment was found to replace. Please contact the practice directly.
              </div>
            ) : null}

            {isExpired ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                This invitation has expired. The appointment may already have been offered to another patient.
              </div>
            ) : null}

            {appointments.length > 0 ? (
              <div className="space-y-3">
                {appointments.map((appointment) => (
                  <div
                    key={appointment.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3"
                  >
                    <div className="text-sm font-medium text-slate-900">{appointment.title}</div>
                    <div className="mt-1 text-sm text-slate-600">
                      {formatDate(appointment.startsAt)} · {formatTime(appointment.startsAt)} - {formatTime(appointment.endsAt)}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {actionData?.ok ? (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                <CheckCircle2 className="size-4" />
                The new booking is confirmed.
              </div>
            ) : (
              <Form method="post" className="space-y-4">
                <div className="space-y-2">
                  <label
                    htmlFor="selectedAppointmentId"
                    className="text-sm font-medium text-slate-800"
                  >
                    Appointment to cancel
                  </label>
                  <select
                    id="selectedAppointmentId"
                    name="selectedAppointmentId"
                    required
                    disabled={!hasSelectableAppointment || isSubmitting || isExpired}
                    defaultValue={appointments[0]?.id ?? ""}
                    className="flex h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-950 focus:ring-2 focus:ring-slate-950/10 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    {appointments.map((appointment) => (
                      <option key={appointment.id} value={appointment.id}>
                        {formatDate(appointment.startsAt)} - {formatTime(appointment.startsAt)} - {appointment.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  Confirming will book the earlier free slot and cancel the selected old appointment. Declining will release
                  this offer and contact the next patient immediately.
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button
                    type="submit"
                    name="intent"
                    value="accept"
                    size="lg"
                    className="h-11 rounded-xl bg-slate-950 px-5 text-white hover:bg-slate-800"
                    disabled={!hasSelectableAppointment || isSubmitting || isExpired}
                  >
                    {isSubmitting ? <RefreshCw className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                    Confirm and reschedule
                  </Button>
                  <Button
                    type="submit"
                    name="intent"
                    value="decline"
                    size="lg"
                    variant="outline"
                    className="h-11 rounded-xl border-slate-300 px-5 text-slate-700 hover:bg-slate-100"
                    disabled={isSubmitting || isExpired}
                  >
                    {isSubmitting ? <RefreshCw className="size-4 animate-spin" /> : null}
                    Decline this offer
                  </Button>
                </div>
              </Form>
            )}

            {offer.responseDeadlineAt ? (
              <div
                className={
                  isExpired
                    ? "flex items-center gap-2 text-sm font-medium text-rose-600"
                    : "flex items-center gap-2 text-sm text-slate-500"
                }
              >
                <CircleAlert className="size-4" />
                {isExpired
                  ? `Expired at ${formatDateTime(offer.responseDeadlineAt)}.`
                  : `Expires in ${formatRemainingTime(remainingTime)} (${formatDateTime(offer.responseDeadlineAt)}).`}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function InfoCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-base font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function useRemainingTime(deadline: string | null) {
  const [remainingTime, setRemainingTime] = useState(() =>
    deadline ? new Date(deadline).getTime() - Date.now() : null,
  );

  useEffect(() => {
    if (!deadline) return;

    const timer = window.setInterval(() => {
      const nextRemainingTime = Math.max(
        0,
        new Date(deadline).getTime() - Date.now(),
      );
      setRemainingTime(nextRemainingTime);

      if (nextRemainingTime === 0) {
        window.clearInterval(timer);
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [deadline]);

  return remainingTime;
}

function formatRemainingTime(remainingTime: number | null) {
  if (remainingTime === null) return "";

  const totalSeconds = Math.max(0, Math.ceil(remainingTime / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}
