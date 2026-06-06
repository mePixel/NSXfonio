import { createBrowserRouter, redirect } from "react-router"

import App from "@/App"
import { ClientsPage } from "@/routes/clients"
import { clientsAction, clientsLoader } from "@/routes/clients-data"
import { getCurrentSession } from "@/lib/auth"
import { DashboardPage } from "@/routes/dashboard"
import { LoadingPage } from "@/routes/loading"
import { LoginPage } from "@/routes/login"

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

  return session
}

async function loginLoader() {
  const session = await getCurrentSession()

  if (session) {
    throw redirect("/")
  }

  return null
}

export const router = createBrowserRouter([
  {
    path: "/login",
    loader: loginLoader,
    hydrateFallbackElement: <LoadingPage />,
    element: <LoginPage />,
  },
  {
    id: "root",
    path: "/",
    loader: protectedLoader,
    hydrateFallbackElement: <LoadingPage />,
    element: <App />,
    children: [
      {
        index: true,
        element: <DashboardPage />,
      },
      {
        path: "clients",
        loader: clientsLoader,
        action: clientsAction,
        element: <ClientsPage />,
      },
      {
        path: "*",
        element: <DashboardPage />,
      },
    ],
  },
])
