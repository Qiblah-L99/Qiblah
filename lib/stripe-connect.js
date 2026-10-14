const crypto = require('crypto');

const STRIPE_API_VERSION = process.env.STRIPE_API_VERSION || '2026-09-30.endive';
const CONNECT_INTEGRATION_ID = 'qiblah_connect_';
const TEST_MOSQUE_ID = process.env.QIBLAH_TEST_MOSQUE_ID || '49a8bf95-1f45-4c99-9af7-030f00214d0d';

function requireTestMosque(mosqueId) {
  if (mosqueId !== TEST_MOSQUE_ID) {
    const error = new Error('Stripe testing is currently limited to Qiblah Demo Mosque.');
    error.statusCode = 403;
    throw error;
  }
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    const error = new Error(`Missing ${name}`);
    error.statusCode = 500;
    throw error;
  }
  return value;
}

function siteUrl(req) {
  const configured = process.env.QIBLAH_SITE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (configured) {
    const clean = configured.replace(/\/+$/, '');
    return /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;
  }
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}`;
}

function json(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function readJson(req) {
  return readRawBody(req).then((raw) => {
    if (!raw.length) return {};
    try {
      return JSON.parse(raw.toString('utf8'));
    } catch (error) {
      error.statusCode = 400;
      error.expose = 'Invalid JSON body.';
      throw error;
    }
  });
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function formBody(values, prefix) {
  const params = new URLSearchParams();
  function append(value, key) {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => append(item, `${key}[${index}]`));
      return;
    }
    if (typeof value === 'object') {
      Object.keys(value).forEach((child) => append(value[child], key ? `${key}[${child}]` : child));
      return;
    }
    params.append(key, String(value));
  }
  append(values, prefix || '');
  return params;
}

async function stripeRequest(path, options = {}) {
  const key = requiredEnv('STRIPE_SECRET_KEY');
  if (!/^(?:sk|rk)_test_/.test(key)) {
    throw new Error('Only a fresh Stripe test key may be used for this test setup. Live payments are disabled.');
  }
  const headers = {
    Authorization: `Bearer ${key}`,
    'Stripe-Version': options.apiVersion || STRIPE_API_VERSION
  };
  if (options.stripeAccount) headers['Stripe-Account'] = options.stripeAccount;
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

  let body;
  if (options.json) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.json);
  } else if (options.form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = formBody(options.form).toString();
  }

  const response = await fetch(`https://api.stripe.com${path}`, {
    method: options.method || 'GET',
    headers,
    body
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const error = new Error((data.error && data.error.message) || response.statusText);
    error.statusCode = response.status;
    error.stripe = data.error || data;
    throw error;
  }
  if (data.livemode === true) throw new Error('Live Stripe data is not allowed in this test setup.');
  return data;
}

async function supabaseRequest(path, options = {}) {
  const url = requiredEnv('SUPABASE_URL').replace(/\/+$/, '');
  const key = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json'
  };
  if (options.prefer) headers.Prefer = options.prefer;
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await response.text();
  if (!response.ok) {
    const error = new Error(text || response.statusText);
    error.statusCode = response.status;
    throw error;
  }
  return text ? JSON.parse(text) : null;
}

async function getSupabaseUser(accessToken) {
  if (!accessToken) return null;
  const url = requiredEnv('SUPABASE_URL').replace(/\/+$/, '');
  const anon = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: {
      apikey: anon,
      Authorization: `Bearer ${accessToken}`
    }
  });
  if (!response.ok) return null;
  return response.json();
}

async function requireMosqueAdmin(req, mosqueId) {
  const auth = String(req.headers.authorization || '');
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  const user = await getSupabaseUser(token);
  if (!user || !user.id) {
    const error = new Error('Please sign in with verified mosque admin access.');
    error.statusCode = 401;
    throw error;
  }
  const rows = await supabaseRequest(
    `mosque_admin_members?select=id,role,status&mosque_id=eq.${encodeURIComponent(mosqueId)}&user_id=eq.${encodeURIComponent(user.id)}&status=eq.active&limit=1`
  );
  if (!rows || !rows.length) {
    const error = new Error('This account is not approved to manage that mosque.');
    error.statusCode = 403;
    throw error;
  }
  return { user, membership: rows[0] };
}

function randomSuffix() {
  return crypto.randomBytes(4).toString('hex');
}

function verifyStripeSignature(rawBody, signatureHeader) {
  const secret = requiredEnv('STRIPE_WEBHOOK_SECRET');
  const parts = String(signatureHeader || '').split(',').reduce((acc, item) => {
    const index = item.indexOf('=');
    if (index > -1) {
      const key = item.slice(0, index);
      const value = item.slice(index + 1);
      if (!acc[key]) acc[key] = [];
      acc[key].push(value);
    }
    return acc;
  }, {});
  const timestamp = parts.t && parts.t[0];
  const signatures = parts.v1 || [];
  if (!timestamp || !signatures.length) throw new Error('Missing Stripe signature.');
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) throw new Error('Expired Stripe signature.');
  const payload = `${timestamp}.${rawBody.toString('utf8')}`;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const ok = signatures.some((sig) => {
    const a = Buffer.from(sig, 'hex');
    const b = Buffer.from(expected, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
  if (!ok) throw new Error('Invalid Stripe signature.');
}

function handleError(res, error) {
  const status = error.statusCode || 500;
  json(res, status, {
    error: error.stripe && error.stripe.type === 'authentication_error'
      ? 'Stripe test credentials need configuration.'
      : error.expose || (status >= 500 ? 'The Stripe test service is unavailable. No payment is confirmed.' : error.message) || 'Unexpected error.',
    code: error.stripe && error.stripe.code ? error.stripe.code : undefined
  });
}

module.exports = {
  CONNECT_INTEGRATION_ID,
  STRIPE_API_VERSION,
  handleError,
  json,
  randomSuffix,
  readJson,
  readRawBody,
  requireMosqueAdmin,
  requiredEnv,
  requireTestMosque,
  siteUrl,
  stripeRequest,
  supabaseRequest,
  verifyStripeSignature
};
