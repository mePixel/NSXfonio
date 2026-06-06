import { redirect } from "react-router";

import { apiURL } from "@/lib/auth";
import { type Client } from "@/lib/clients";

export type AppointmentStatus = "scheduled" | "cancelled";

export type Appointment = {
  id: string;
  clientId: string;
  appointmentDate: string;
  timeSlot: string;
  status: AppointmentStatus;
  moreInfo: string;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
  client: Client;
};

export type WaitlistOfferResult =
  | {
      started: true;
      offer: {
        id: string;
        status: string;
      };
    }
  | {
      started: false;
      status: "skipped" | "failed";
      reason: string;
    };

export type AppointmentSettings = {
  id: string;
  timeSlotSize: number;
  workingDays: number[];
  officeHoursStart: string;
  officeHoursEnd: string;
  createdAt: string;
  updatedAt: string;
};

export type AppointmentField =
  | "appointmentDate"
  | "timeSlot"
  | "clientId"
  | "moreInfo"
  | "joinWaitlist"
  | "newClient.firstName"
  | "newClient.lastName"
  | "newClient.telephoneNumber"
  | "newClient.email"
  | "newClient.description"
  | "cancellationReason";

export type AppointmentFieldErrors = Partial<Record<AppointmentField, string>>;
export type AppointmentSettingsFieldErrors = Partial<
  Record<"timeSlotSize" | "workingDays" | "officeHoursStart" | "officeHoursEnd", string>
>;

type ApiErrorBody = {
  error?: string;
  errors?: AppointmentFieldErrors & AppointmentSettingsFieldErrors;
};

async function readApiError(response: Response) {
  try {
    const body = (await response.json()) as ApiErrorBody;

    return {
      message: body.error || "Request failed.",
      errors: body.errors ?? {},
    };
  } catch {
    return {
      message: "Request failed.",
      errors: {},
    };
  }
}

function redirectToLogin(requestPath: string) {
  throw redirect(`/login?redirectTo=${encodeURIComponent(requestPath)}`);
}

export function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

export async function loadAppointments(date: string) {
  const response = await fetch(
    `${apiURL}/api/appointments?date=${encodeURIComponent(date)}`,
    {
      credentials: "include",
    },
  );

  if (response.status === 401) {
    redirectToLogin(`/appointments?date=${date}`);
  }

  if (!response.ok) {
    throw new Response("Unable to load appointments.", {
      status: response.status,
    });
  }

  return (await response.json()) as { appointments: Appointment[] };
}

export async function loadAppointmentDates(start: string, end: string) {
  const response = await fetch(
    `${apiURL}/api/appointments?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
    {
      credentials: "include",
    },
  );

  if (response.status === 401) {
    redirectToLogin("/appointments");
  }

  if (!response.ok) {
    throw new Response("Unable to load appointment dates.", {
      status: response.status,
    });
  }

  return (await response.json()) as { appointmentDates: string[] };
}

export async function loadAppointmentSettings() {
  const response = await fetch(`${apiURL}/api/appointment-settings`, {
    credentials: "include",
  });

  if (response.status === 401) {
    redirectToLogin("/appointments");
  }

  if (!response.ok) {
    throw new Response("Unable to load appointment settings.", {
      status: response.status,
    });
  }

  return (await response.json()) as { settings: AppointmentSettings };
}

function appointmentBodyFromFormData(formData: FormData) {
  const clientMode = String(formData.get("clientMode") ?? "existing");

  return {
    clientMode,
    clientId: String(formData.get("clientId") ?? "").trim(),
    appointmentDate: String(formData.get("appointmentDate") ?? "").trim(),
    timeSlot: String(formData.get("timeSlot") ?? "").trim(),
    moreInfo: String(formData.get("moreInfo") ?? "").trim(),
    joinWaitlist: String(formData.get("joinWaitlist") ?? "") === "on",
    firstName: String(formData.get("firstName") ?? "").trim(),
    lastName: String(formData.get("lastName") ?? "").trim(),
    telephoneNumber: String(formData.get("telephoneNumber") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim(),
  };
}

export async function createAppointment(formData: FormData) {
  const values = appointmentBodyFromFormData(formData);
  const response = await fetch(`${apiURL}/api/appointments`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(values),
  });

  if (response.status === 401) {
    redirectToLogin("/appointments");
  }

  if (!response.ok) {
    const error = await readApiError(response);

    return {
      ok: false as const,
      intent: "createAppointment" as const,
      message: error.message,
      errors: error.errors as AppointmentFieldErrors,
      values,
    };
  }

  return {
      ok: true as const,
      intent: "createAppointment" as const,
      message: "Appointment created.",
      ...((await response.json()) as {
        appointments: Appointment[];
        waitlist?: {
          entryId: string;
          created: boolean;
          position: number;
        } | null;
      }),
  };
}

export async function cancelAppointment(formData: FormData) {
  const id = String(formData.get("appointmentId") ?? "").trim();
  const cancellationReason = String(
    formData.get("cancellationReason") ?? "",
  ).trim();
  const response = await fetch(
    `${apiURL}/api/appointments/${encodeURIComponent(id)}/cancel`,
    {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ cancellationReason }),
    },
  );

  if (response.status === 401) {
    redirectToLogin("/appointments");
  }

  if (!response.ok) {
    const error = await readApiError(response);

    return {
      ok: false as const,
      intent: "cancelAppointment" as const,
      message: error.message,
      errors: error.errors as AppointmentFieldErrors,
    };
  }

  return {
    ok: true as const,
    intent: "cancelAppointment" as const,
    message: "Appointment cancelled.",
    ...((await response.json()) as {
      appointments: Appointment[];
      waitlistOffer?: WaitlistOfferResult | null;
    }),
  };
}

export async function updateAppointmentSettings(formData: FormData) {
  const timeSlotSize = Number(formData.get("timeSlotSize"));
  const workingDays = formData.getAll("workingDays").map((day) => Number(day));
  const officeHoursStart = String(formData.get("officeHoursStart") ?? "").trim();
  const officeHoursEnd = String(formData.get("officeHoursEnd") ?? "").trim();
  const response = await fetch(`${apiURL}/api/appointment-settings`, {
    method: "PATCH",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeSlotSize,
      workingDays,
      officeHoursStart,
      officeHoursEnd,
    }),
  });

  if (response.status === 401) {
    redirectToLogin("/appointments");
  }

  if (!response.ok) {
    const error = await readApiError(response);

    return {
      ok: false as const,
      intent: "updateSettings" as const,
      message: error.message,
      errors: error.errors as AppointmentSettingsFieldErrors,
      values: { timeSlotSize, workingDays, officeHoursStart, officeHoursEnd },
    };
  }

  return {
    ok: true as const,
    intent: "updateSettings" as const,
    message: "Settings saved.",
    settings: ((await response.json()) as { settings: AppointmentSettings })
      .settings,
  };
}
