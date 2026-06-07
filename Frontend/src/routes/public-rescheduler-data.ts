import { type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";

import {
  acceptPublicRescheduleOffer,
  declinePublicRescheduleOffer,
  loadPublicRescheduleOffer,
} from "@/lib/public-rescheduler";

export async function publicReschedulerLoader({ params }: LoaderFunctionArgs) {
  const candidateId = String(params.candidateId ?? "").trim();

  if (!candidateId) {
    throw new Response("Missing candidate id.", { status: 400 });
  }

  return loadPublicRescheduleOffer(candidateId);
}

export async function publicReschedulerAction({
  params,
  request,
}: ActionFunctionArgs) {
  const candidateId = String(params.candidateId ?? "").trim();

  if (!candidateId) {
    return Response.json(
      {
        ok: false,
        message: "Missing candidate id.",
      },
      { status: 400 },
    );
  }

  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "accept").trim();
  const result = intent === "decline"
    ? await declinePublicRescheduleOffer(candidateId)
    : await acceptPublicRescheduleOffer(candidateId, formData);

  return Response.json(result, {
    status: result.ok ? 200 : 400,
  });
}
