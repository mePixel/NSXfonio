import { type ActionFunctionArgs } from "react-router";

import { createClient, deleteClient, loadClients } from "@/lib/clients";

export async function clientsLoader() {
  return loadClients();
}

export async function clientsAction({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const result =
    request.method.toUpperCase() === "DELETE"
      ? await deleteClient(formData)
      : await createClient(formData);

  return Response.json(result, {
    status: result.ok
      ? request.method.toUpperCase() === "DELETE"
        ? 200
        : 201
      : 400,
  });
}
