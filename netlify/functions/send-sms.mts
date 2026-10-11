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
    const apiKey = process.env.TEXTSMS_API_KEY || process.env.VITE_TEXTSMS_API_KEY || body.apikey || "";
    const partnerId = process.env.TEXTSMS_PARTNER_ID || process.env.VITE_TEXTSMS_PARTNER_ID || body.partnerID || "";
    const shortcode = process.env.TEXTSMS_SHORTCODE || process.env.VITE_TEXTSMS_SHORTCODE || body.shortcode || "TextSMS";
    const mobile = body.mobile;
    const message = body.message;

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Missing TextSMS API Key (TEXTSMS_API_KEY)" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!partnerId) {
      return new Response(
        JSON.stringify({
          error: "Missing TextSMS Partner ID. In your TextSMS Kenya dashboard, click 'GET API KEY & PARTNER ID' to copy your Partner ID, and set TEXTSMS_PARTNER_ID in Netlify or Settings.",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!mobile || !message) {
      return new Response(
        JSON.stringify({ error: "Missing required mobile number or message" }),
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

    console.log(`Sending real SMS to ${mobile} via TextSMS Kenya...`);

    const textSmsResp = await fetch("https://sms.textsms.co.ke/api/services/sendsms/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await textSmsResp.json();
    console.log("TextSMS Gateway response:", JSON.stringify(result));

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error: any) {
    console.error("TextSMS gateway error:", error);
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
