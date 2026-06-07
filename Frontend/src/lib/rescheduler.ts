import { redirect } from "react-router";

import { apiURL } from "@/lib/auth";

export type ReschedulerState = "pending" | "calling" | "filled" | "aborted" | "failed";
export type ReschedulerCandidateState =
  | "not_reached"
  | "declined"
  | "interested"
  | "accepted"
  | "skipped";

type ReschedulerCustomer = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  whatsappPhone: string | null;
  email: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ReschedulerCandidate = {
  id: string;
  state: ReschedulerCandidateState;
  notes: string | null;
  calledAt: string | null;
  waitlistOfferId: string | null;
  customer: ReschedulerCustomer | null;
  createdAt: string;
  updatedAt: string;
};

export type ReschedulerFlow = {
  id: string;
  state: ReschedulerState;
  startedAt: string | null;
  completedAt: string | null;
  abortedAt: string | null;
  createdAt: string;
  updatedAt: string;
  cancellationReason: string | null;
  originalAppointment: {
    id: string;
    title: string;
    startsAt: string;
    endsAt: string;
    status: string;
    cancellationReason: string | null;
    customer: ReschedulerCustomer | null;
  };
  originalSlot: {
    id: string;
    startsAt: string;
    endsAt: string;
    status: string;
  } | null;
  replacement: {
    appointmentId: string | null;
    customer: ReschedulerCustomer | null;
  } | null;
  candidates: ReschedulerCandidate[];
};

type ApiErrorBody = {
  error?: string;
};

async function readApiError(response: Response) {
  try {
    const body = (await response.json()) as ApiErrorBody;
    return body.error || "Request failed.";
  } catch {
    return "Request failed.";
  }
}

function redirectToLogin() {
  throw redirect(`/login?redirectTo=${encodeURIComponent("/rescheduler")}`);
}

export async function loadReschedulerFlows() {
  const response = await fetch(`${apiURL}/api/rescheduler`, {
    credentials: "include",
  });

  if (response.status === 401) {
    redirectToLogin();
  }

  if (!response.ok) {
    throw new Response("Unable to load rescheduler flows.", {
      status: response.status,
    });
  }

  return (await response.json()) as { reschedulerFlows: ReschedulerFlow[] };
}

export async function abortReschedulerFlow(formData: FormData) {
  const id = String(formData.get("reschedulerFlowId") ?? "").trim();
  const response = await fetch(
    `${apiURL}/api/rescheduler/${encodeURIComponent(id)}/abort`,
    {
      method: "POST",
      credentials: "include",
    },
  );

  if (response.status === 401) {
    redirectToLogin();
  }

  if (!response.ok) {
    return {
      ok: false as const,
      intent: "abortReschedulerFlow" as const,
      flowId: id,
      message: await readApiError(response),
    };
  }

  return {
    ok: true as const,
    intent: "abortReschedulerFlow" as const,
    flowId: id,
    message: "Rebooking aborted.",
  };
}
