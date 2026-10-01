import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type Payload = {
  action?: string;
  claim_id?: string;
  mosque_slug?: string;
  password?: string;
  role?: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function clean(value: unknown): string {
  return String(value || "").trim();
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const configuredPassword = Deno.env.get("SUPER_ADMIN_MOSQUE_PASSWORD");
  if (!configuredPassword) return json({ error: "Super admin access is not configured" }, 500);

  let payload: Payload;
  try {
    payload = await req.json();
  } catch (_error) {
    return json({ error: "Invalid request" }, 400);
  }

  const slug = clean(payload.mosque_slug).toLowerCase().replace(/[^a-z0-9-]/g, "");
  const action = clean(payload.action);
  const claimId = clean(payload.claim_id);
  const role = clean(payload.role) || "admin";
  const password = clean(payload.password);
  if (!password) return json({ error: "Password is required" }, 400);
  if (password !== configuredPassword) return json({ error: "Incorrect super admin password" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Supabase service role is not configured" }, 500);

  if (action === "approve_claim" || action === "reject_claim") {
    if (!isUuid(claimId)) return json({ error: "Valid claim is required" }, 400);
    if (!["owner", "admin", "editor"].includes(role)) return json({ error: "Invalid role" }, 400);

    const fnName = action === "approve_claim" ? "approve_mosque_claim" : "reject_mosque_claim";
    const body = action === "approve_claim"
      ? { p_claim_id: claimId, p_role: role }
      : { p_claim_id: claimId };

    const rpc = await fetch(supabaseUrl + "/rest/v1/rpc/" + fnName, {
      method: "POST",
      headers: {
        "apikey": serviceRoleKey,
        "Authorization": "Bearer " + serviceRoleKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!rpc.ok) {
      let error = "Could not update mosque access request";
      try {
        const detail = await rpc.json();
        error = detail.message || detail.error || error;
      } catch (_error) {
        error = await rpc.text() || error;
      }
      return json({ error }, rpc.status);
    }

    return json({ ok: true, status: action === "approve_claim" ? "approved" : "rejected" });
  }

  if (!slug) return json({ error: "Mosque is required" }, 400);

  const select = "id,slug,name,address,area,borough,jummah,jummah2,jummah3,phone,website,email,about,facilities,logo";
  const response = await fetch(supabaseUrl + "/rest/v1/mosques?slug=eq." + encodeURIComponent(slug) + "&select=" + select + "&limit=1", {
    headers: {
      "apikey": serviceRoleKey,
      "Authorization": "Bearer " + serviceRoleKey,
    },
  });

  if (!response.ok) return json({ error: "Could not load mosque" }, response.status);
  const rows = await response.json();
  const mosque = Array.isArray(rows) && rows[0] ? rows[0] : null;
  if (!mosque) return json({ error: "Mosque not found" }, 404);

  return json({ mosque });
});
