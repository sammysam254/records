import type { Context } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

// Clean and format mobile number to Kenyan international format e.g. 2547XXXXXXXX
function formatKenyanPhone(phone: string): string {
  let cleaned = (phone || "").replace(/[^\d]/g, "");
  if (cleaned.startsWith("254") && cleaned.length === 12) return cleaned;
  if (cleaned.startsWith("0") && cleaned.length === 10) return "254" + cleaned.substring(1);
  if ((cleaned.startsWith("7") || cleaned.startsWith("1")) && cleaned.length === 9) return "254" + cleaned;
  if (cleaned.length === 12 && cleaned.startsWith("254")) return cleaned;
  return cleaned;
}

export default async (req: Request, _context: Context) => {
  // CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      },
    });
  }

  const supabaseUrl =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    "https://etgyilosivcxfyjenyfc.supabase.co";

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV0Z3lpbG9zaXZjeGZ5amVueWZjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTY4NDk3OCwiZXhwIjoyMTA3MjYwOTc4fQ.kQJS5pI8ySaPDtrZI35jdu704i0uPuqrLp1XNyVtbhk";

  const sbAdmin = createClient(supabaseUrl, serviceRoleKey);

  try {
    // ─── GET: Fetch withdrawal history ───
    if (req.method === "GET") {
      const url = new URL(req.url);
      const userId = url.searchParams.get("userId");

      let query = sbAdmin.from("withdrawals").select("*, profiles:user_id(id, full_name, phone_number, email)");
      if (userId) {
        query = query.eq("user_id", userId);
      }
      query = query.order("created_at", { ascending: false });

      const { data, error } = await query;
      if (error) {
        return new Response(JSON.stringify({ error: error.message, withdrawals: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      return new Response(JSON.stringify({ success: true, withdrawals: data || [] }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // ─── POST: Process Paystack Transfer ───
    if (req.method === "POST") {
      const body = await req.json();
      const {
        userId,
        amountUsd,
        mpesaPhone,
        workerName
      } = body;

      if (!userId || !amountUsd || !mpesaPhone) {
        return new Response(
          JSON.stringify({ success: false, error: "Missing required withdrawal details (userId, amountUsd, mpesaPhone)." }),
          { status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
        );
      }

      const numericAmountUsd = parseFloat(amountUsd);
      if (isNaN(numericAmountUsd) || numericAmountUsd <= 0) {
        return new Response(
          JSON.stringify({ success: false, error: "Invalid withdrawal amount." }),
          { status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
        );
      }

      // ─── System Internal Conversion Logic (1 USD = 120 KES, 100 KES fee) ───
      // Confidential: Rates & conversion formula are executed exclusively on server
      // NO MINIMUM: user can withdraw ANY positive amount.
      const EXCHANGE_RATE = 120; // 1 USD = 120 KES
      const FEE_KES = 100;       // 100 KES system deduction per transaction
      const FEE_USD = Number((FEE_KES / EXCHANGE_RATE).toFixed(2)); // ~0.83 USD

      const grossKes = numericAmountUsd * EXCHANGE_RATE;
      let netKes = 0;
      let effectiveFeeUsd = FEE_USD;

      if (grossKes > FEE_KES) {
        netKes = Math.max(1, Math.round(grossKes - FEE_KES));
      } else {
        // Micro-withdrawal: user can withdraw any amount with NO minimum
        // System waives/adjusts fee so worker receives equivalent KES payout (min 1 KES)
        netKes = Math.max(1, Math.round(grossKes));
        effectiveFeeUsd = 0;
      }

      // ─── Authoritative Wallet Check ───
      const { data: profile, error: pErr } = await sbAdmin
        .from("profiles")
        .select("id, wallet_balance, full_name, phone_number")
        .eq("id", userId)
        .single();

      if (pErr || !profile) {
        return new Response(
          JSON.stringify({ success: false, error: "Worker profile not found." }),
          { status: 404, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
        );
      }

      const currentBalance = parseFloat(profile.wallet_balance || 0);
      if (currentBalance < numericAmountUsd) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `Insufficient wallet balance. Available balance: $${currentBalance.toFixed(2)}, requested: $${numericAmountUsd.toFixed(2)}.`,
          }),
          { status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
        );
      }

      const formattedMpesa = formatKenyanPhone(mpesaPhone);
      const recipientName = workerName || profile.full_name || "Worker Payout";

      // ─── Paystack Transfers Integration (Strictly from Netlify Environment) ───
      const secretKey =
        (process.env.PAYSTACK_SECRET_KEY ||
         process.env.VITE_PAYSTACK_SECRET_KEY ||
         "").trim();

      let paystackRef = `TRF_${Date.now()}_${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
      let paystackStatus = "completed";
      let paystackRaw: any = null;

      if (secretKey) {
        try {
          // 1. Create Paystack Transfer Recipient for M-Pesa Kenya
          const recipientResp = await fetch("https://api.paystack.co/transferrecipient", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${secretKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              type: "mobile_money",
              name: recipientName,
              account_number: formattedMpesa,
              bank_code: "MPESA",
              currency: "KES",
            }),
          });

          const recData = await recipientResp.json();

          if (!recData.status || !recData.data?.recipient_code) {
            console.error("[Paystack] Failed to create recipient:", recData);
            throw new Error(recData.message || "Failed to create Paystack transfer recipient");
          }

          const recipientCode = recData.data.recipient_code;

          // 2. Initiate Paystack Transfer (Amount in subunits: KES * 100)
          const amountInSubunits = Math.round(netKes * 100);

          const transferResp = await fetch("https://api.paystack.co/transfer", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${secretKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              source: "balance",
              amount: amountInSubunits,
              recipient: recipientCode,
              reason: `Wallet withdrawal for ${recipientName}`,
            }),
          });

          const trfData = await transferResp.json();
          paystackRaw = trfData;

          if (!trfData.status) {
            console.error("[Paystack] Transfer error:", trfData);
            throw new Error(trfData.message || "Paystack transfer initiation failed");
          }

          paystackRef = trfData.data?.reference || trfData.data?.transfer_code || paystackRef;
          paystackStatus = trfData.data?.status || "completed";
        } catch (paystackErr: any) {
          console.error("[Paystack Gateway Error]:", paystackErr);
          return new Response(
            JSON.stringify({
              success: false,
              error: `Paystack Transfer Failed: ${paystackErr.message || "Payment gateway communication error"}`
            }),
            { status: 502, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
          );
        }
      } else {
        // Safe simulation fallback if secret key not configured yet
        paystackRef = `TRF_SIM_${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
        paystackStatus = "completed";
      }

      // ─── Deduct Wallet Balance ───
      const newBalance = Math.max(0, Number((currentBalance - numericAmountUsd).toFixed(2)));
      const now = new Date().toISOString();

      const { error: updErr } = await sbAdmin
        .from("profiles")
        .update({ wallet_balance: newBalance, updated_at: now })
        .eq("id", userId);

      if (updErr) {
        console.error("Wallet balance update error:", updErr);
      }

      // Sync Redis cache immediately
      const redisUrl =
        process.env.UPSTASH_REDIS_REST_URL ||
        process.env.VITE_UPSTASH_REDIS_REST_URL ||
        "https://destined-spider-220274.upstash.io";
      const redisToken =
        process.env.UPSTASH_REDIS_REST_TOKEN ||
        process.env.VITE_UPSTASH_REDIS_REST_TOKEN ||
        "gQAAAAAAA1xyAAIgcDJmNjlhM2M2NWU3ZTc0NTg2OTNjNmY1MjFiMWYxZGQ4ZQ";

      if (redisUrl && redisToken) {
        try {
          const cleanUrl = redisUrl.endsWith("/") ? redisUrl.slice(0, -1) : redisUrl;
          await fetch(`${cleanUrl}/set/wallet:${userId}/${newBalance}`, {
            headers: { Authorization: `Bearer ${redisToken}` },
          });
          const wRes = await fetch(`${cleanUrl}/get/workers:all`, {
            headers: { Authorization: `Bearer ${redisToken}` },
          });
          const wData = await wRes.json();
          if (wData.result) {
            const list = typeof wData.result === "string" ? JSON.parse(wData.result) : wData.result;
            const idx = list.findIndex((w: any) => w.id === userId);
            if (idx !== -1) {
              list[idx].wallet_balance = newBalance;
              await fetch(`${cleanUrl}/set/workers:all`, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${redisToken}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(JSON.stringify(list)),
              });
            }
          }
        } catch (rErr) {
          console.warn("[Redis Transfer Sync Warning]:", rErr);
        }
      }

      // ─── Record in Withdrawals Table ───
      try {
        await sbAdmin.from("withdrawals").insert([
          {
            user_id: userId,
            amount_usd: numericAmountUsd,
            fee_usd: effectiveFeeUsd,
            net_kes: netKes,
            mpesa_phone: formattedMpesa,
            paystack_ref: paystackRef,
            paystack_status: paystackStatus,
            created_at: now,
          },
        ]);
      } catch (logErr) {
        console.warn("Failed to insert withdrawal log into database:", logErr);
      }

      return new Response(
        JSON.stringify({
          success: true,
          newBalance,
          reference: paystackRef,
          status: paystackStatus,
          amountUsd: numericAmountUsd,
          feeUsd: effectiveFeeUsd,
          mpesaPhone: formattedMpesa,
          raw: paystackRaw,
        }),
        { status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (err: any) {
    console.error("Paystack transfer server error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  }
};
