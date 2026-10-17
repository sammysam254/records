import type { Context } from "@netlify/functions";

export const config = {
  path: ["/api/send-sms", "/.netlify/functions/send-sms"]
};

export default async (req: Request, context: Context) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();

    // API Key — hardcoded for Vertex Digital / TextSMS
    let apiKey =
      body.apikey ||
      process.env.TEXTSMS_API_KEY ||
      process.env.VITE_TEXTSMS_API_KEY ||
      "f2cd8d3d47237030b36034a24b7b3b2b";

    if (!apiKey || apiKey === "eebf1d2e1d9df231eec7e63687dc1975") {
      apiKey = "f2cd8d3d47237030b36034a24b7b3b2b";
    }

    // Partner ID — required by TextSMS Kenya (hardcoded fallback: 16450)
    const partnerId =
      process.env.TEXTSMS_PARTNER_ID ||
      process.env.VITE_TEXTSMS_PARTNER_ID ||
      body.partnerID ||
      "16450"; // default partner ID

    // Shortcode — "TextSMS" is the default sender ID
    const shortcode =
      process.env.TEXTSMS_SHORTCODE ||
      process.env.VITE_TEXTSMS_SHORTCODE ||
      body.shortcode ||
      "TextSMS";

    const mobile = body.mobile;
    const message = body.message;

    // Validate required fields
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Missing TEXTSMS_API_KEY in Netlify environment variables." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!partnerId) {
      return new Response(
        JSON.stringify({
          error:
            "Missing TEXTSMS_PARTNER_ID. Log in to https://sms.textsms.co.ke, click 'GET API KEY & PARTNER ID', copy your numeric Partner ID, then set TEXTSMS_PARTNER_ID in Netlify → Site Settings → Environment Variables.",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!mobile || !message) {
      return new Response(
        JSON.stringify({ error: "Missing required mobile or message field." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const payload = {
      apikey: apiKey,
      partnerID: partnerId,
      message: message,
      shortcode: shortcode,
      mobile: mobile,
    };

    console.log(`[TextSMS] Sending to ${mobile} | shortcode: ${shortcode}`);

    const textSmsResp = await fetch("https://sms.textsms.co.ke/api/services/sendsms/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await textSmsResp.json();
    console.log("[TextSMS] Response:", JSON.stringify(result));

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error: any) {
    console.error("[TextSMS] Gateway error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to reach TextSMS Kenya gateway" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};
