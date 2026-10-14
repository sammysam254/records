import type { Context } from "@netlify/functions";

export default async (req: Request, context: Context) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      },
    });
  }

  try {
    let body: any = {};
    if (req.method === "POST") {
      try {
        body = await req.json();
      } catch {
        body = {};
      }
    }

    let apiKey =
      body.apikey ||
      process.env.TEXTSMS_API_KEY ||
      process.env.VITE_TEXTSMS_API_KEY ||
      "f2cd8d3d47237030b36034a24b7b3b2b";

    if (!apiKey || apiKey === "eebf1d2e1d9df231eec7e63687dc1975") {
      apiKey = "f2cd8d3d47237030b36034a24b7b3b2b";
    }

    const partnerId =
      body.partnerID ||
      process.env.TEXTSMS_PARTNER_ID ||
      process.env.VITE_TEXTSMS_PARTNER_ID ||
      "16450";

    const resp = await fetch("https://sms.textsms.co.ke/api/services/getbalance/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apikey: apiKey, partnerID: partnerId }),
    });

    const data = await resp.json();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message || "Failed to check balance" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
