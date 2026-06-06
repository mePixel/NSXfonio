import { type ActionFunctionArgs } from "react-router";

import { createClient, loadClients } from "@/lib/clients";

export async function clientsLoader() {
  return loadClients();
}

export async function clientsAction({ request }: ActionFunctionArgs) {
  const result = await createClient(await request.formData());

  return Response.json(result, {
    status: result.ok ? 201 : 400,
  });
}
