import { type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";

import {
  cancelAppointment,
  createAppointment,
  getTodayDate,
  loadAppointments,
  loadAppointmentSettings,
  updateAppointmentSettings,
} from "@/lib/appointments";
import { loadClients } from "@/lib/clients";

export async function appointmentsLoader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const date = url.searchParams.get("date") || getTodayDate();
  const [appointments, clients, settings] = await Promise.all([
    loadAppointments(date),
    loadClients(),
    loadAppointmentSettings(),
  ]);

  return {
    date,
    ...appointments,
    ...clients,
    ...settings,
  };
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
