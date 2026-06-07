import { env } from "../../config/env.js";

const FONIO_URL = "https://app.fonio.ai/api/public/v1/outbound_call";

export function getOutboundCallConfigIssue() {
  if (!env.fonioApiKey) return "Missing API_FONIO";
  if (!env.fonioFromNumber) return "Missing FONIO_FROM_NUMBER";
  if (!env.fonioAgentId) return "Missing FONIO_AGENT_ID";
  return null;
}

export function assertOutboundCallConfig() {
  const issue = getOutboundCallConfigIssue();
  if (issue) {
    throw Object.assign(new Error(issue), { status: 503 });
  }
}

export async function triggerOutboundCall({ toNumber, context = {} }) {
  assertOutboundCallConfig();

  const response = await fetch(FONIO_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.fonioApiKey}`
    },
    body: JSON.stringify({
      apiKey: env.fonioApiKey,
      fromNumber: env.fonioFromNumber,
      toNumber,
      agentId: env.fonioAgentId,
      context
    })
  });

  const body = await response.text();

  if (!response.ok) {
    throw Object.assign(
      new Error(`Fonio error ${response.status}: ${body}`),
      { status: 502 }
    );
  }

  try {
    return JSON.parse(body);
  } catch {
    return { raw: body };
  }
}
