import { redirect } from "react-router";

import { apiURL } from "@/lib/auth";

export type Client = {
  id: string;
  firstName: string;
  lastName: string;
  telephoneNumber: string;
  email: string;
  description: string;
  waitlist: {
    isOnWaitlist: boolean;
    entryId: string | null;
    position: number | null;
    notes: string | null;
  };
  createdAt: string;
  updatedAt: string;
};

export type ClientsResponse = {
  clients: Client[];
};

export type ClientFormValues = {
  firstName: string;
  lastName: string;
  telephoneNumber: string;
  email: string;
  description: string;
};

export type ClientFieldErrors = Partial<Record<keyof ClientFormValues, string>>;

type ApiErrorBody = {
  error?: string;
  errors?: ClientFieldErrors;
};

function toClientFormValues(formData: FormData): ClientFormValues {
  return {
    firstName: String(formData.get("firstName") ?? "").trim(),
    lastName: String(formData.get("lastName") ?? "").trim(),
    telephoneNumber: String(formData.get("telephoneNumber") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim(),
  };
}

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

export async function loadClients() {
  const response = await fetch(`${apiURL}/api/clients`, {
    credentials: "include",
  });

  if (response.status === 401) {
    throw redirect("/login?redirectTo=%2Fclients");
  }

  if (!response.ok) {
    throw new Response("Unable to load clients.", {
      status: response.status,
    });
  }

  return (await response.json()) as ClientsResponse;
}

export type Appointment = {
  id: string;
  clientId: string;
  customerId: string;
  slotId: string | null;
  title: string;
  startsAt: string;
  endsAt: string;
  status: string;
  confirmationDeadlineAt: string | null;
  followupDeadlineAt: string | null;
  cancelReason: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AppointmentsResponse = {
  appointments: Appointment[];
};

export async function loadClientAppointments(clientId: string) {
  const response = await fetch(
    `${apiURL}/api/customers/${clientId}/appointments`,
    {
      credentials: "include",
    },
  );

  if (response.status === 401) {
    throw redirect("/login?redirectTo=%2Fclients");
  }

  if (!response.ok) {
    throw new Response("Unable to load appointments.", {
      status: response.status,
    });
  }

  return (await response.json()) as AppointmentsResponse;
}

export async function createClient(formData: FormData) {
  const values = toClientFormValues(formData);
  const response = await fetch(`${apiURL}/api/clients`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(values),
  });

  if (response.status === 401) {
    throw redirect("/login?redirectTo=%2Fclients");
  }

  if (!response.ok) {
    const error = await readApiError(response);

    return {
      ok: false as const,
      message: error.message,
      errors: error.errors,
      values,
    };
  }

  return {
    ok: true as const,
    message: "Client created.",
    clients: ((await response.json()) as ClientsResponse).clients,
  };
}

export async function deleteClient(formData: FormData) {
  const clientId = String(formData.get("clientId") ?? "").trim();

  if (!clientId) {
    return {
      ok: false as const,
      message: "Choose a client to delete.",
      errors: {},
    };
  }

  const response = await fetch(
    `${apiURL}/api/clients/${encodeURIComponent(clientId)}`,
    {
      method: "DELETE",
      credentials: "include",
    },
  );

  if (response.status === 401) {
    throw redirect("/login?redirectTo=%2Fclients");
  }

  if (!response.ok) {
    const error = await readApiError(response);

    return {
      ok: false as const,
      message: error.message,
      errors: error.errors,
    };
  }

  const body = (await response.json()) as ClientsResponse & {
    deletedAppointmentCount?: number;
  };

  return {
    ok: true as const,
    message: "Client deleted.",
    clients: body.clients,
    deletedAppointmentCount: body.deletedAppointmentCount ?? 0,
  };
}
