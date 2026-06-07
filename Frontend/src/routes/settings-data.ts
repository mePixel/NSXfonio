import { type ActionFunctionArgs } from "react-router";
import { loadFonioApiKey, revokeFonioApiKey, rotateFonioApiKey } from "@/lib/fonio-settings";

export async function settingsLoader() {
  return loadFonioApiKey();
}

export async function settingsAction({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const intent = String(formData.get("_intent") ?? "");
  const name = String(formData.get("name") ?? "").trim() || "Fonio";

  if (intent === "rotate") {
    const result = await rotateFonioApiKey(name);
    return Response.json(result, { status: result.ok ? 201 : 400 });
  }

  if (intent === "revoke") {
    const result = await revokeFonioApiKey();
    return Response.json(result, { status: result.ok ? 200 : 400 });
  }

  return Response.json({ ok: false, message: "Unknown action." }, { status: 400 });
}
