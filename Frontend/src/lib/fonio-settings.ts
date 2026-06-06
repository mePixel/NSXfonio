import { redirect } from "react-router";
import { apiURL } from "@/lib/auth";

export type FonioApiKeySummary = {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
};

type FonioApiKeyResponse = {
  apiKey: FonioApiKeySummary | null;
};

type RotateApiKeyResponse = {
  apiKey: string;
  summary: FonioApiKeySummary;
};

async function ensureAuthenticated(response: Response, redirectTo: string) {
  if (response.status === 401) {
    throw redirect(`/login?redirectTo=${encodeURIComponent(redirectTo)}`);
  }
}

export async function loadFonioApiKey() {
  const response = await fetch(`${apiURL}/api/settings/fonio-api-key`, {
    credentials: "include",
  });

  await ensureAuthenticated(response, "/settings");

  if (!response.ok) {
    throw new Response("Unable to load settings.", {
      status: response.status,
    });
  }

  return (await response.json()) as FonioApiKeyResponse;
}

export async function rotateFonioApiKey(name: string) {
  const response = await fetch(`${apiURL}/api/settings/fonio-api-key`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name }),
  });

  await ensureAuthenticated(response, "/settings");

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: "Unable to rotate API key." }));
    return {
      ok: false as const,
      message: body.error || "Unable to rotate API key.",
    };
  }

  return {
    ok: true as const,
    ...(await response.json() as RotateApiKeyResponse),
  };
}

export async function revokeFonioApiKey() {
  const response = await fetch(`${apiURL}/api/settings/fonio-api-key`, {
    method: "DELETE",
    credentials: "include",
  });

  await ensureAuthenticated(response, "/settings");

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: "Unable to revoke API key." }));
    return {
      ok: false as const,
      message: body.error || "Unable to revoke API key.",
    };
  }

  return {
    ok: true as const,
    ...(await response.json() as { revoked: FonioApiKeySummary | null }),
  };
}
