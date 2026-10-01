import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type Payload = {
  mosque_slug?: string;
  password?: string;
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
  const password = clean(payload.password);
  if (!slug || !password) return json({ error: "Mosque and password are required" }, 400);
  if (password !== configuredPassword) return json({ error: "Incorrect super admin password" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Supabase service role is not configured" }, 500);

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
