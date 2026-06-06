import { createAuthClient } from "better-auth/react"

function getDefaultApiURL() {
  if (typeof window !== "undefined" && window.location.hostname === "nsxfonio.xaxa.at") {
    return "https://api-nsxfonio.xaxa.at"
  }

  return "http://localhost:3005"
}

export const apiURL =
  import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? getDefaultApiURL()

export const authClient = createAuthClient({
  baseURL: apiURL,
})

export type AuthSession = {
  session: {
    id: string
    expiresAt: string | Date
    userId: string
  }
  user: {
    id: string
    email: string
    emailVerified: boolean
    name?: string | null
    image?: string | null
  }
}

export async function getCurrentSession() {
  let response: Response

  try {
    response = await fetch(`${apiURL}/api/me`, {
      credentials: "include",
    })
  } catch {
    return null
  }

  if (response.status === 401) {
    return null
  }

  if (!response.ok) {
    throw new Response("Unable to load your session.", {
      status: response.status,
    })
  }

  return (await response.json()) as AuthSession
}
