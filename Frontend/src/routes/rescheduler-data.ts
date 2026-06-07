import { type ActionFunctionArgs } from "react-router";

import { abortReschedulerFlow, loadReschedulerFlows } from "@/lib/rescheduler";

export async function reschedulerLoader() {
  return loadReschedulerFlows();
}

export async function reschedulerAction({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const result = await abortReschedulerFlow(formData);

  return Response.json(result, {
    status: result.ok ? 200 : 400,
  });
}
