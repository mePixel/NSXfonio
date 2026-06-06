import { type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";

import {
  cancelAppointment,
  createAppointment,
  getTodayDate,
  loadAppointmentDates,
  loadAppointments,
  loadAppointmentSettings,
  updateAppointmentSettings,
} from "@/lib/appointments";
import { loadClients } from "@/lib/clients";

export async function appointmentsLoader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const date = url.searchParams.get("date") || getTodayDate();
  const calendarMonth = getMonthStartDate(url.searchParams.get("month") || date);
  const calendarEnd = getMonthEndDate(calendarMonth);
  const [appointments, clients, settings, appointmentDates] = await Promise.all([
    loadAppointments(date),
    loadClients(),
    loadAppointmentSettings(),
    loadAppointmentDates(calendarMonth, calendarEnd),
  ]);

  return {
    date,
    calendarMonth,
    ...appointments,
    ...clients,
    ...settings,
    ...appointmentDates,
  };
}

function getMonthStartDate(value: string) {
  const date = new Date(`${value}T00:00:00`);

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    "01",
  ].join("-");
}

function getMonthEndDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);

  return [
    end.getFullYear(),
    String(end.getMonth() + 1).padStart(2, "0"),
    String(end.getDate()).padStart(2, "0"),
  ].join("-");
}

export async function appointmentsAction({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const result =
    intent === "cancelAppointment"
      ? await cancelAppointment(formData)
      : await createAppointment(formData);

  return Response.json(result, {
    status: result.ok ? 200 : 400,
  });
}

export async function appointmentSettingsLoader() {
  return loadAppointmentSettings();
}

export async function appointmentSettingsAction({
  request,
}: ActionFunctionArgs) {
  const result = await updateAppointmentSettings(await request.formData());

  return Response.json(result, {
    status: result.ok ? 200 : 400,
  });
}
