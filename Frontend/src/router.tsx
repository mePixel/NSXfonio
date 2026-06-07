import { createBrowserRouter, Navigate, redirect } from "react-router"

import App from "@/App"
import { RouteErrorPage } from "@/components/route-error"
import { AppointmentsPage } from "@/routes/appointments"
import {
  appointmentSettingsAction,
  appointmentSettingsLoader,
  appointmentsAction,
  appointmentsLoader,
} from "@/routes/appointments-data"
import { ClientsPage } from "@/routes/clients"
import { clientsAction, clientsLoader } from "@/routes/clients-data"
import { getCurrentSession } from "@/lib/auth"
import { LoadingPage } from "@/routes/loading"
import { LoginPage } from "@/routes/login"
import { PublicReschedulerPage } from "@/routes/public-rescheduler"
import {
  publicReschedulerAction,
  publicReschedulerLoader,
} from "@/routes/public-rescheduler-data"
import { ReschedulerPage } from "@/routes/rescheduler"
import { reschedulerAction, reschedulerLoader } from "@/routes/rescheduler-data"
import { settingsAction, settingsLoader } from "@/routes/settings-data"
import { SettingsPage } from "@/routes/settings"
import { OnboardingPage } from "@/routes/onboarding"

function getRedirectTarget(request: Request) {
  const url = new URL(request.url)
  return `${url.pathname}${url.search}`
}

async function protectedLoader({ request }: { request: Request }) {
  const session = await getCurrentSession()

  if (!session) {
    const redirectTo = encodeURIComponent(getRedirectTarget(request))
    throw redirect(`/login?redirectTo=${redirectTo}`)
  }

  if (!session.user.clientId) {
    const url = new URL(request.url)
    if (url.pathname !== "/onboarding") {
      throw redirect("/onboarding")
    }
  }

  return session
}

async function loginLoader() {
  const session = await getCurrentSession()

  if (session) {
    throw redirect("/appointments")
  }

  return null
}

async function onboardingLoader() {
  const session = await getCurrentSession()

  if (!session) {
    throw redirect("/login")
  }

  if (session.user.clientId) {
    throw redirect("/appointments")
  }

  return session
}

export const router = createBrowserRouter([
  {
    path: "/login",
    loader: loginLoader,
    hydrateFallbackElement: <LoadingPage />,
    element: <LoginPage />,
    errorElement: <RouteErrorPage />,
  },
  {
    path: "/onboarding",
    loader: onboardingLoader,
    hydrateFallbackElement: <LoadingPage />,
    element: <OnboardingPage />,
  },
  {
    path: "/reschedule-offer/:offerId",
    loader: publicReschedulerLoader,
    action: publicReschedulerAction,
    hydrateFallbackElement: <LoadingPage />,
    element: <PublicReschedulerPage />,
    errorElement: <RouteErrorPage />,
  },
  {
    id: "root",
    path: "/",
    loader: protectedLoader,
    hydrateFallbackElement: <LoadingPage />,
    element: <App />,
    errorElement: <RouteErrorPage />,
    children: [
      {
        index: true,
        loader: () => redirect("/appointments"),
        element: <Navigate to="/appointments" replace />,
      },
      {
        path: "appointments",
        loader: appointmentsLoader,
        action: appointmentsAction,
        element: <AppointmentsPage />,
      },
      {
        path: "appointment-settings",
        loader: appointmentSettingsLoader,
        action: appointmentSettingsAction,
        element: <Navigate to="/appointments" replace />,
      },
      {
        path: "clients",
        loader: clientsLoader,
        action: clientsAction,
        element: <ClientsPage />,
      },
      {
        path: "rescheduler",
        loader: reschedulerLoader,
        action: reschedulerAction,
        element: <ReschedulerPage />,
      },
      {
        path: "settings",
        loader: settingsLoader,
        action: settingsAction,
        element: <SettingsPage />,
      },
      {
        path: "*",
        element: <Navigate to="/appointments" replace />,
      },
    ],
  },
])
