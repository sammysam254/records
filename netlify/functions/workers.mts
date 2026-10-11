import type { Context } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

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
          return {
            id: p.id,
            email: authUser?.email || p.email || "",
            full_name: p.full_name || meta.full_name || "Worker",
            phone_number: p.phone_number || meta.phone_number || "",
            device_url: p.device_url || meta.device_url || "",
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
        const worker = {
          id: authUser.id,
          email: authUser.email,
          full_name: profile?.full_name || meta.full_name || "Worker",
          phone_number: profile?.phone_number || meta.phone_number || "",
          device_url: profile?.device_url || meta.device_url || "",
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
