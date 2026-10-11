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
    const apiKey = process.env.TEXTSMS_API_KEY || "";
    const partnerId = process.env.TEXTSMS_PARTNER_ID || "";

    if (!apiKey || !partnerId) {
      return new Response(
        JSON.stringify({ error: "Missing TEXTSMS_API_KEY or TEXTSMS_PARTNER_ID env vars" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

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
