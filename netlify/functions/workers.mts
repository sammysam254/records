import type { Context } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

// Helper to extract device serial from workstation URL
function extractDeviceSerial(raw: string | null | undefined): string {
  if (!raw) return '';
  const str = String(raw).trim();
  const tokenRMatch = str.match(/token=[^&]*?:([rR][a-zA-Z0-9_-]+)/i);
  if (tokenRMatch && tokenRMatch[1]) {
    const candidate = tokenRMatch[1].split(':')[0].split('&')[0].split('#')[0];
    if (candidate) return candidate.toUpperCase();
  }
  const udidMatch = str.match(/[?&#]udid=([a-zA-Z0-9_-]+)/i) || str.match(/udid%3D([a-zA-Z0-9_-]+)/i);
  if (udidMatch && udidMatch[1]) {
    return udidMatch[1].split('&')[0].toUpperCase();
  }
  const generalTokenMatch = str.match(/token=([a-zA-Z0-9]+):([a-zA-Z0-9_-]+)/i);
  if (generalTokenMatch && generalTokenMatch[2]) {
    const candidate = generalTokenMatch[2].split(':')[0].split('&')[0].split('#')[0];
    if (candidate) return candidate.toUpperCase();
  }
  const standaloneR = str.match(/\b([rR][a-zA-Z0-9]{8,15})\b/);
  if (standaloneR && standaloneR[1]) return standaloneR[1].toUpperCase();
  return '';
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
    // ─── GET: Return all registered workers from Supabase ───
    if (req.method === "GET") {
      const { data: profiles, error: pErr } = await sbAdmin
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (pErr) {
        return new Response(JSON.stringify({ error: pErr.message }), {
          status: 500,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      // Fetch auth users to map email and user_metadata
      const { data: authData } = await sbAdmin.auth.admin.listUsers();
      const userMap = new Map();
      (authData?.users || []).forEach((u) => userMap.set(u.id, u));

      const workers = (profiles || [])
        .filter((p: any) => {
          const authUser = userMap.get(p.id);
          const email = (authUser?.email || p.email || "").toLowerCase().trim();
          const phone = (p.phone_number || "").trim();
          if (email.endsWith("@records.io")) return false;
          if (phone === "254712345678" || phone === "254722998877" || phone === "254799112233") return false;
          return true;
        })
        .map((p: any) => {
          const authUser = userMap.get(p.id);
          const meta = authUser?.user_metadata || {};
          const rawUrl = p.device_url || meta.device_url || "";
          const deviceSerial = p.device_serial || meta.device_serial || extractDeviceSerial(rawUrl);

          return {
            id: p.id,
            email: authUser?.email || p.email || "",
            full_name: p.full_name || meta.full_name || "Worker",
            phone_number: p.phone_number || meta.phone_number || "",
            device_url: rawUrl,
            device_serial: deviceSerial,
            device_pin: p.device_pin || meta.device_pin || "",
            wallet_balance: parseFloat(p.wallet_balance) || 0,
            role: p.role || "worker",
            phone_verified: Boolean(p.phone_verified),
            created_at: p.created_at,
          };
        });

      return new Response(JSON.stringify(workers), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-cache, no-store",
        },
      });
    }

    // ─── POST: Lookup or Register worker with Supabase Admin ───
    if (req.method === "POST") {
      const body = await req.json();
      const action = body.action || "lookup";

      // Lookup by email
      if (action === "lookup") {
        const email = (body.email || "").toLowerCase().trim();
        const { data: authData } = await sbAdmin.auth.admin.listUsers();
        const authUser = (authData?.users || []).find(
          (u) => (u.email || "").toLowerCase() === email
        );

        if (!authUser) {
          return new Response(
            JSON.stringify({ success: false, error: "Worker not found with this email" }),
            {
              status: 404,
              headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            }
          );
        }

        const { data: profile } = await sbAdmin
          .from("profiles")
          .select("*")
          .eq("id", authUser.id)
          .single();

        const meta = authUser.user_metadata || {};
        const rawUrl = profile?.device_url || meta.device_url || "";
        const deviceSerial = profile?.device_serial || meta.device_serial || extractDeviceSerial(rawUrl);

        const worker = {
          id: authUser.id,
          email: authUser.email,
          full_name: profile?.full_name || meta.full_name || "Worker",
          phone_number: profile?.phone_number || meta.phone_number || "",
          device_url: rawUrl,
          device_serial: deviceSerial,
          device_pin: profile?.device_pin || meta.device_pin || "",
          wallet_balance: parseFloat(profile?.wallet_balance || 0),
          role: profile?.role || "worker",
          phone_verified: Boolean(profile?.phone_verified),
          created_at: profile?.created_at || authUser.created_at,
        };

        return new Response(JSON.stringify({ success: true, worker }), {
          status: 200,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      // Register worker through Admin API
      if (action === "register") {
        const {
          email,
          password,
          fullName,
          phoneNumber,
          deviceUrl,
          devicePin,
          isPhoneVerified,
        } = body;

        const cleanEmail = (email || "").toLowerCase().trim();
        const formattedPhone = phoneNumber;
        const deviceSerial = extractDeviceSerial(deviceUrl);

        // Check if user already exists
        const { data: allUsers } = await sbAdmin.auth.admin.listUsers();
        const existingAuth = (allUsers?.users || []).find(
          (u) => (u.email || "").toLowerCase() === cleanEmail
        );

        let userId = existingAuth?.id;

        if (!userId) {
          const { data: newUser, error: createErr } = await sbAdmin.auth.admin.createUser({
            email: cleanEmail,
            password: password || "password123",
            email_confirm: true,
            user_metadata: {
              full_name: fullName,
              phone_number: formattedPhone,
              device_url: deviceUrl,
              device_serial: deviceSerial,
              device_pin: devicePin,
              role: "worker",
            },
          });

          if (createErr || !newUser.user) {
            return new Response(
              JSON.stringify({ success: false, error: createErr?.message || "Registration failed" }),
              {
                status: 400,
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
              }
            );
          }
          userId = newUser.user.id;
        }

        // Upsert profile in Supabase profiles table
        await sbAdmin.from("profiles").upsert([
          {
            id: userId,
            full_name: fullName,
            phone_number: formattedPhone,
            device_url: deviceUrl,
            device_pin: devicePin,
            wallet_balance: 0,
            role: "worker",
            phone_verified: Boolean(isPhoneVerified),
          },
        ]);

        const worker = {
          id: userId,
          email: cleanEmail,
          full_name: fullName,
          phone_number: formattedPhone,
          device_url: deviceUrl,
          device_serial: deviceSerial,
          device_pin: devicePin,
          wallet_balance: 0,
          role: "worker",
          phone_verified: Boolean(isPhoneVerified),
          created_at: new Date().toISOString(),
        };

        return new Response(JSON.stringify({ success: true, worker }), {
          status: 200,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      // Helper to sync Redis cache
      const syncRedisBalance = async (targetUserId: string, newBal: number) => {
        const redisUrl =
          process.env.UPSTASH_REDIS_REST_URL ||
          process.env.VITE_UPSTASH_REDIS_REST_URL ||
          "https://destined-spider-220274.upstash.io";
        const redisToken =
          process.env.UPSTASH_REDIS_REST_TOKEN ||
          process.env.VITE_UPSTASH_REDIS_REST_TOKEN ||
          "gQAAAAAAA1xyAAIgcDJmNjlhM2M2NWU3ZTc0NTg2OTNjNmY1MjFiMWYxZGQ4ZQ";

        if (!redisUrl || !redisToken) return;

        try {
          const cleanUrl = redisUrl.endsWith("/") ? redisUrl.slice(0, -1) : redisUrl;
          // 1. Update wallet:<userId>
          await fetch(`${cleanUrl}/set/wallet:${targetUserId}/${newBal}`, {
            headers: { Authorization: `Bearer ${redisToken}` },
          });

          // 2. Update worker in workers:all
          const wRes = await fetch(`${cleanUrl}/get/workers:all`, {
            headers: { Authorization: `Bearer ${redisToken}` },
          });
          const wData = await wRes.json();
          if (wData.result) {
            const list = typeof wData.result === "string" ? JSON.parse(wData.result) : wData.result;
            const idx = list.findIndex((w: any) => w.id === targetUserId);
            if (idx !== -1) {
              list[idx].wallet_balance = newBal;
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
        } catch (err) {
          console.warn("[Redis Balance Sync Warning]:", err);
        }
      };

      // Create weekly submission with serverless admin (bypasses RLS)
      if (action === "create-submission") {
        const { userId, amountMade, calculatedCredit, weekDate } = body;
        if (!userId || amountMade === undefined) {
          return new Response(JSON.stringify({ success: false, error: "userId and amountMade are required" }), {
            status: 400,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          });
        }

        const { data: sub, error: subErr } = await sbAdmin
          .from("weekly_submissions")
          .insert([
            {
              user_id: userId,
              amount_made: Number(parseFloat(amountMade).toFixed(2)),
              calculated_credit: Number(parseFloat(calculatedCredit || 0).toFixed(2)),
              status: "pending",
              week_date: weekDate || new Date().toISOString().split("T")[0],
            },
          ])
          .select("*, profiles:user_id(*)")
          .single();

        if (subErr) {
          return new Response(JSON.stringify({ success: false, error: subErr.message }), {
            status: 500,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          });
        }

        return new Response(JSON.stringify({ success: true, submission: sub }), {
          status: 200,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      // Approve submission and credit worker balance
      if (action === "approve-submission") {
        const { submissionId, userId, credit } = body;
        if (!submissionId) {
          return new Response(JSON.stringify({ success: false, error: "submissionId is required" }), {
            status: 400,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          });
        }

        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(submissionId);
        let targetUserId = userId;
        let creditAmount = parseFloat(credit || 0);

        // If it's a UUID, update Supabase weekly_submissions
        if (isUUID) {
          try {
            await sbAdmin
              .from("weekly_submissions")
              .update({ status: "approved", approved_at: new Date().toISOString() })
              .eq("id", submissionId);

            if (!targetUserId || !creditAmount) {
              const { data: sub } = await sbAdmin.from("weekly_submissions").select("*").eq("id", submissionId).single();
              if (sub) {
                targetUserId = targetUserId || sub.user_id;
                creditAmount = creditAmount || parseFloat(sub.calculated_credit || 0);
              }
            }
          } catch (e) {
            console.warn("DB submission update note:", e);
          }
        }

        if (!targetUserId) {
          return new Response(JSON.stringify({ success: false, error: "Worker user_id is required" }), {
            status: 400,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          });
        }

        // Fetch current profile balance and credit
        const { data: profile } = await sbAdmin.from("profiles").select("wallet_balance").eq("id", targetUserId).single();
        const currentBal = parseFloat(profile?.wallet_balance || 0);
        const newBalance = Number((currentBal + creditAmount).toFixed(2));

        await sbAdmin
          .from("profiles")
          .update({ wallet_balance: newBalance, updated_at: new Date().toISOString() })
          .eq("id", targetUserId);

        // Sync Redis immediately
        await syncRedisBalance(targetUserId, newBalance);

        return new Response(JSON.stringify({ success: true, newBalance, submissionId }), {
          status: 200,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      // Mark submission as paid and deduct from worker balance
      if (action === "mark-paid") {
        const { submissionId, userId, deductAmount } = body;
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(submissionId);
        let targetUserId = userId;
        let deduction = parseFloat(deductAmount || 0);

        if (isUUID) {
          try {
            await sbAdmin
              .from("weekly_submissions")
              .update({ status: "paid", paid_at: new Date().toISOString() })
              .eq("id", submissionId);

            if (!targetUserId || !deduction) {
              const { data: sub } = await sbAdmin.from("weekly_submissions").select("*").eq("id", submissionId).single();
              if (sub) {
                targetUserId = targetUserId || sub.user_id;
                deduction = deduction || parseFloat(sub.calculated_credit || 0);
              }
            }
          } catch (e) {
            console.warn("DB submission mark-paid note:", e);
          }
        }

        if (targetUserId) {
          const { data: profile } = await sbAdmin.from("profiles").select("wallet_balance").eq("id", targetUserId).single();
          const currentBal = parseFloat(profile?.wallet_balance || 0);
          const newBalance = Math.max(0, Number((currentBal - deduction).toFixed(2)));

          await sbAdmin
            .from("profiles")
            .update({ wallet_balance: newBalance, updated_at: new Date().toISOString() })
            .eq("id", targetUserId);

          await syncRedisBalance(targetUserId, newBalance);

          return new Response(JSON.stringify({ success: true, newBalance, submissionId }), {
            status: 200,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          });
        }

        return new Response(JSON.stringify({ success: false, error: "user_id not provided" }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      // Admin update balance directly
      if (action === "update-balance") {
        const { userId, balance } = body;
        const cleanBalance = Number(Math.max(0, balance || 0).toFixed(2));
        await sbAdmin
          .from("profiles")
          .update({ wallet_balance: cleanBalance, updated_at: new Date().toISOString() })
          .eq("id", userId);

        await syncRedisBalance(userId, cleanBalance);

        return new Response(JSON.stringify({ success: true, balance: cleanBalance }), {
          status: 200,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Server Error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
};
