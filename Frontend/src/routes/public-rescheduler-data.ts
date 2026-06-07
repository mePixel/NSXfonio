import { type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";

import {
  acceptPublicRescheduleOffer,
  loadPublicRescheduleOffer,
} from "@/lib/public-rescheduler";

export async function publicReschedulerLoader({ params }: LoaderFunctionArgs) {
  const offerId = String(params.offerId ?? "").trim();

  if (!offerId) {
    throw new Response("Missing offer id.", { status: 400 });
  }

  return loadPublicRescheduleOffer(offerId);
}

export async function publicReschedulerAction({
  params,
  request,
}: ActionFunctionArgs) {
  const offerId = String(params.offerId ?? "").trim();

  if (!offerId) {
    return Response.json(
      {
        ok: false,
        message: "Missing offer id.",
      },
      { status: 400 },
    );
  }

  const formData = await request.formData();
  const result = await acceptPublicRescheduleOffer(offerId, formData);

  return Response.json(result, {
    status: result.ok ? 200 : 400,
  });
}
