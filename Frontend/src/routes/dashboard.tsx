import {
  CalendarClock,
  CircleCheck,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useRouteLoaderData } from "react-router";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { type AuthSession } from "@/lib/auth";

export function DashboardPage() {
  const session = useRouteLoaderData("root") as AuthSession | undefined;
  const userName = session?.user.name || session?.user.email || "there";

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-lg border bg-background p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium text-muted-foreground">
            Signed in account
          </p>
          <h1 className="truncate text-2xl font-semibold">
            Welcome, {userName}
          </h1>
        </div>
        <div className="flex w-fit items-center gap-2 rounded-md border bg-muted px-2.5 py-1.5 text-xs font-medium text-muted-foreground">
          <CircleCheck className="size-3.5 text-primary" />
          Authenticated
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserRound className="size-4 text-muted-foreground" />
              Profile
            </CardTitle>
            <CardDescription>Google account identity</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="truncate text-sm font-medium">
                {session?.user.email}
              </p>
            </div>
            <Separator />
            <div>
              <p className="text-xs text-muted-foreground">User ID</p>
              <p className="truncate font-mono text-xs">{session?.user.id}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-muted-foreground" />
              Session
            </CardTitle>
            <CardDescription>Backend verified access</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <p className="text-sm font-medium">Active</p>
            </div>
            <Separator />
            <div>
              <p className="text-xs text-muted-foreground">Session ID</p>
              <p className="truncate font-mono text-xs">
                {session?.session.id}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="size-4 text-muted-foreground" />
              Access
            </CardTitle>
            <CardDescription>Router protected route</CardDescription>
            <CardAction>
              <div className="rounded-md border bg-muted px-2 py-1 text-xs text-muted-foreground">
                Live
              </div>
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground">Provider</p>
              <p className="text-sm font-medium">Google</p>
            </div>
            <Separator />
            <div>
              <p className="text-xs text-muted-foreground">Route guard</p>
              <p className="text-sm font-medium">React Router data loader</p>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
