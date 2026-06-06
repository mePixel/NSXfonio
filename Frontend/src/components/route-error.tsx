import { isRouteErrorResponse, useRouteError } from "react-router";

export function RouteErrorPage() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    return (
      <div className="mx-auto flex min-h-[40vh] w-full max-w-3xl flex-col justify-center gap-3 rounded-lg border bg-background p-6 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Request failed
        </p>
        <h1 className="text-2xl font-semibold">
          {error.status} {error.statusText || "Unexpected error"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {typeof error.data === "string" && error.data
            ? error.data
            : "The page could not load its data."}
        </p>
      </div>
    );
  }

  const message = error instanceof Error ? error.message : "The page could not be loaded.";

  return (
    <div className="mx-auto flex min-h-[40vh] w-full max-w-3xl flex-col justify-center gap-3 rounded-lg border bg-background p-6 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
        Request failed
      </p>
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
