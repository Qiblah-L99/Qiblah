import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type SignupPayload = {
  mosque_name?: string;
  contact_name?: string;
  email?: string;
  phone?: string | null;
  borough?: string | null;
  area?: string | null;
  address?: string | null;
  message?: string | null;
  source?: string | null;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function clean(value: unknown): string {
  return String(value || "").trim();
}

function optional(value: unknown): string {
  return clean(value) || "Not provided";
}

function escapeHtml(value: unknown): string {
  return optional(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function row(label: string, value: unknown): string {
  return '<tr><td style="padding:8px 12px;color:#6f6453;font-weight:600;width:140px">' + label + '</td><td style="padding:8px 12px;color:#1f1b16">' + escapeHtml(value) + '</td></tr>';
}

async function sendEmail(params: {
  from: string;
  to: string[];
  reply_to?: string;
  subject: string;
  html: string;
  text: string;
}, apiKey: string): Promise<Response> {
  return fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  let payload: SignupPayload;
  try {
    payload = await req.json();
  } catch (_error) {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const mosqueName = clean(payload.mosque_name);
  const contactName = clean(payload.contact_name);
  const contactEmail = clean(payload.email);
  if (!mosqueName || !contactName || !contactEmail) {
    return new Response(JSON.stringify({ error: "Missing required signup fields" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const notifyTo = Deno.env.get("SIGNUP_NOTIFY_TO") || "info@qiblah.co.uk";
  const fromEmail = Deno.env.get("SIGNUP_NOTIFY_FROM") || "Qiblah <info@qiblah.co.uk>";

  if (!resendApiKey) {
    return new Response(JSON.stringify({ skipped: true, reason: "RESEND_API_KEY is not configured" }), {
      status: 202,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const detailsHtml =
    row("Mosque", payload.mosque_name) +
    row("Contact", payload.contact_name) +
    row("Email", payload.email) +
    row("Phone", payload.phone) +
    row("Borough", payload.borough) +
    row("Area", payload.area) +
    row("Address", payload.address) +
    row("Source", payload.source) +
    (payload.message ? row("Message", payload.message) : "");

  const internalText = [
    "New mosque signup",
    "",
    "Mosque: " + optional(payload.mosque_name),
    "Contact: " + optional(payload.contact_name),
    "Email: " + optional(payload.email),
    "Phone: " + optional(payload.phone),
    "Borough: " + optional(payload.borough),
    "Area: " + optional(payload.area),
    "Address: " + optional(payload.address),
    "Source: " + optional(payload.source),
    payload.message ? "Message: " + optional(payload.message) : "",
  ].filter(Boolean).join("\n");

  const internalHtml = '<div style="font-family:Arial,sans-serif;background:#f6f1e8;padding:24px">' +
    '<div style="max-width:640px;margin:0 auto;background:#fffdf9;border:1px solid #e4dac8;border-radius:12px;overflow:hidden">' +
    '<div style="padding:18px 22px;background:#1f1b16;color:#f6f1e8">' +
    '<div style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#c79c55">Qiblah registration</div>' +
    '<h1 style="margin:8px 0 0;font-size:22px">New mosque signup</h1>' +
    '</div><table style="width:100%;border-collapse:collapse;font-size:14px">' + detailsHtml + '</table></div></div>';

  const ackText = [
    "Assalamu alaikum " + contactName + ",",
    "",
    "JazakAllah khair. We have received the Qiblah registration for " + mosqueName + ".",
    "Our team will review the details and follow up from info@qiblah.co.uk.",
    "",
    "Qiblah",
  ].join("\n");

  const ackHtml = '<div style="font-family:Arial,sans-serif;background:#f6f1e8;padding:24px">' +
    '<div style="max-width:560px;margin:0 auto;background:#fffdf9;border:1px solid #e4dac8;border-radius:12px;padding:22px;color:#1f1b16">' +
    '<h1 style="margin:0 0 14px;font-size:22px">We received your Qiblah registration</h1>' +
    '<p>Assalamu alaikum ' + escapeHtml(contactName) + ',</p>' +
    '<p>JazakAllah khair. We have received the Qiblah registration for <strong>' + escapeHtml(mosqueName) + '</strong>.</p>' +
    '<p>Our team will review the details and follow up from <a href="mailto:info@qiblah.co.uk" style="color:#966d2e">info@qiblah.co.uk</a>.</p>' +
    '<p style="margin-top:22px;color:#6f6453">Qiblah</p>' +
    '</div></div>';

  const results = await Promise.allSettled([
    sendEmail({
      from: fromEmail,
      to: [notifyTo],
      reply_to: contactEmail,
      subject: "New mosque registration: " + mosqueName,
      html: internalHtml,
      text: internalText,
    }, resendApiKey),
    sendEmail({
      from: fromEmail,
      to: [contactEmail],
      reply_to: notifyTo,
      subject: "We received your Qiblah registration",
      html: ackHtml,
      text: ackText,
    }, resendApiKey),
  ]);

  const failed = [];
  for (const [index, result] of results.entries()) {
    if (result.status === "rejected") {
      failed.push({ email: index === 0 ? "internal" : "acknowledgement", error: String(result.reason) });
      continue;
    }
    if (!result.value.ok) {
      failed.push({ email: index === 0 ? "internal" : "acknowledgement", status: result.value.status, body: await result.value.text() });
    }
  }

  if (failed.length) {
    return new Response(JSON.stringify({ ok: false, failed }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
