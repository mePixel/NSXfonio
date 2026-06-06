import { useState } from "react";
import {
  CalendarClock,
  CircleCheck,
  ShieldCheck,
  UserRound,
  Phone,
  Loader2,
} from "lucide-react";
import { useRouteLoaderData } from "react-router";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { type AuthSession } from "@/lib/auth";

export function DashboardPage() {
  const session = useRouteLoaderData("root") as AuthSession | undefined;
  const userName = session?.user.name || session?.user.email || "there";
  const [testOfferId, setTestOfferId] = useState("");
  const [testLoading, setTestLoading] = useState(false);
  const [testMessage, setTestMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function simulateNoAnswerCall() {
    if (!testOfferId.trim()) {
      setTestMessage({ type: "error", text: "Please enter an Offer ID" });
      return;
    }

    setTestLoading(true);
    setTestMessage(null);

    try {
      const response = await fetch("http://localhost:3005/api/webhooks/fonio/test/simulate-no-answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId: testOfferId })
      });

      const data = await response.json();

      if (!response.ok) {
        setTestMessage({
          type: "error",
          text: data.error || "Failed to simulate call"
        });
        return;
      }

      setTestMessage({
        type: "success",
        text: "No-answer call simulated! Email should be sent if customer has an email address."
      });
      setTestOfferId("");
    } catch (error) {
      setTestMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Network error"
      });
    } finally {
      setTestLoading(false);
    }
  }

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

      <section>
        <Card className="shadow-sm border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-900">
              <Phone className="size-4" />
              Email Feature Testing
            </CardTitle>
            <CardDescription className="text-blue-800">
              Simulate a missed call to test the email sending feature
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="offerId" className="text-sm font-medium">
                Offer ID
              </label>
              <Input
                id="offerId"
                placeholder="Enter the offer ID to simulate no-answer call"
                value={testOfferId}
                onChange={(e) => setTestOfferId(e.target.value)}
                disabled={testLoading}
              />
            </div>

            <Button
              onClick={simulateNoAnswerCall}
              disabled={testLoading}
              className="w-full"
            >
              {testLoading ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Simulating...
                </>
              ) : (
                "Simulate No-Answer Call"
              )}
            </Button>

            {testMessage && (
              <div
                className={`rounded-md p-3 text-sm ${
                  testMessage.type === "success"
                    ? "bg-green-100 text-green-800"
                    : "bg-red-100 text-red-800"
                }`}
              >
                {testMessage.text}
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              💡 This will trigger the email sending workflow as if a Fonio call wasn't answered.
              Check your email/Mailtrap inbox for the follow-up message.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
