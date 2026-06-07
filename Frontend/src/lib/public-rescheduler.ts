import { apiURL } from "@/lib/auth";

type ApiErrorBody = {
  error?: string;
};

export type PublicRescheduleAppointment = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  status: string;
};

export type PublicRescheduleOffer = {
  id: string;
  status: string;
  responseDeadlineAt: string | null;
  createdAt: string;
  slot: {
    id: string;
    startsAt: string;
    endsAt: string;
  };
  customer: {
    id: string;
    firstName: string;
    lastName: string;
  };
  upcomingAppointments: PublicRescheduleAppointment[];
  totalUpcomingAppointments: number;
};

async function readApiError(response: Response) {
  try {
    const body = (await response.json()) as ApiErrorBody;
    return body.error || "Request failed.";
  } catch {
    return "Request failed.";
  }
}

export async function loadPublicRescheduleOffer(candidateId: string) {
  const response = await fetch(`${apiURL}/api/rescheduler/candidates/${encodeURIComponent(candidateId)}`);

  if (!response.ok) {
    throw new Response(await readApiError(response), {
      status: response.status,
      statusText: "Unable to load offer",
    });
  }

  return (await response.json()) as { offer: PublicRescheduleOffer };
}

export async function acceptPublicRescheduleOffer(candidateId: string, formData: FormData) {
  const selectedAppointmentId = String(formData.get("selectedAppointmentId") ?? "").trim();

  const response = await fetch(
    `${apiURL}/api/rescheduler/candidates/${encodeURIComponent(candidateId)}/accept-public`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        selectedAppointmentId: selectedAppointmentId || null,
      }),
    },
  );

  if (!response.ok) {
    return {
      ok: false as const,
      message: await readApiError(response),
    };
  }

  return {
    ok: true as const,
    message: "The earlier appointment has been confirmed and your selected appointment was cancelled.",
  };
}

export async function declinePublicRescheduleOffer(candidateId: string) {
  const response = await fetch(
    `${apiURL}/api/rescheduler/candidates/${encodeURIComponent(candidateId)}/decline-public`,
    {
      method: "POST",
    },
  );

  if (!response.ok) {
    return {
      ok: false as const,
      message: await readApiError(response),
    };
  }

  return {
    ok: true as const,
    message: "This offer has been declined. If the slot is still open, the next patient is being contacted now.",
  };
}
