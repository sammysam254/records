import type { Context } from "@netlify/functions";

export default async (req: Request, context: Context) => {
  // CORS preflight response
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
    const apiKey = process.env.TEXTSMS_API_KEY || body.apikey || "";
    const partnerId = process.env.TEXTSMS_PARTNER_ID || body.partnerID || "";
    const shortcode = process.env.TEXTSMS_SHORTCODE || body.shortcode || "TextSMS";
    const mobile = body.mobile;
    const message = body.message;

    if (!apiKey || !partnerId || !mobile || !message) {
      return new Response(
        JSON.stringify({
          error: "Missing required parameters (apikey, partnerID, mobile, message)",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const payload = {
      apikey: apiKey,
      partnerID: partnerId,
      message: message,
      shortcode: shortcode,
      mobile: mobile,
    };

    const textSmsResp = await fetch("https://sms.textsms.co.ke/api/services/sendsms/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await textSmsResp.json();

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error: any) {
    return new Response(
      JSON.stringify({
        error: error.message || "Failed to communicate with TextSMS Kenya gateway",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};
