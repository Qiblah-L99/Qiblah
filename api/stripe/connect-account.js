const {
  handleError,
  json,
  readJson,
  requireMosqueAdmin,
  requireTestMosque,
  siteUrl,
  stripeRequest,
  supabaseRequest
} = require('../../lib/stripe-connect');

async function findConnection(mosqueId) {
  const rows = await supabaseRequest(
    `mosque_stripe_accounts?select=*&mosque_id=eq.${encodeURIComponent(mosqueId)}&limit=1`
  );
  return rows && rows[0] ? rows[0] : null;
}

function capabilityStatus(account) {
  return account &&
    account.configuration &&
    account.configuration.merchant &&
    account.configuration.merchant.capabilities &&
    account.configuration.merchant.capabilities.card_payments
    ? account.configuration.merchant.capabilities.card_payments.status
    : 'unknown';
}

async function retrieveAccount(accountId) {
  return stripeRequest(`/v2/core/accounts/${encodeURIComponent(accountId)}?include[]=configuration.merchant&include[]=identity&include[]=defaults`);
}

async function saveConnection(mosqueId, account, extra) {
  const payload = Object.assign({
    mosque_id: mosqueId,
    stripe_account_id: account.id,
    livemode: Boolean(account.livemode),
    dashboard: account.dashboard || 'full',
    fees_collector: account.defaults && account.defaults.responsibilities ? account.defaults.responsibilities.fees_collector : 'stripe',
    losses_collector: account.defaults && account.defaults.responsibilities ? account.defaults.responsibilities.losses_collector : 'stripe',
    card_payments_status: capabilityStatus(account),
    onboarding_complete: capabilityStatus(account) === 'active',
    details: account,
    updated_at: new Date().toISOString()
  }, extra || {});

  const rows = await supabaseRequest('mosque_stripe_accounts?on_conflict=mosque_id', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: payload
  });
  return rows && rows[0] ? rows[0] : payload;
}

async function createAccount(body) {
  const name = String(body.mosque_name || 'Qiblah mosque').slice(0, 120);
  const email = body.email && String(body.email).includes('@') ? String(body.email).slice(0, 320) : undefined;
  return stripeRequest('/v2/core/accounts', {
    method: 'POST',
    idempotencyKey: `qiblah-connect-${body.mosque_id}`,
    json: {
      contact_email: email,
      display_name: name,
      identity: {
        country: 'gb',
        entity_type: 'company',
        business_details: {
          registered_name: name
        }
      },
      configuration: {
        merchant: {
          capabilities: {
            card_payments: {
              requested: true
            }
          }
        }
      },
      defaults: {
        currency: 'gbp',
        responsibilities: {
          fees_collector: 'stripe',
          losses_collector: 'stripe'
        }
      },
      dashboard: 'full',
      metadata: {
        qiblah_mosque_id: body.mosque_id
      },
      include: [
        'configuration.merchant',
        'identity',
        'defaults'
      ]
    }
  });
}

async function createAccountLink(req, accountId, mosqueId) {
  const base = siteUrl(req);
  return stripeRequest('/v1/account_links', {
    method: 'POST',
    idempotencyKey: `qiblah-onboarding-${mosqueId}-${Date.now()}`,
    form: {
      account: accountId,
      type: 'account_onboarding',
      refresh_url: `${base}/mosque/?stripe_refresh=1`,
      return_url: `${base}/mosque/?stripe_return=1`
    }
  });
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const url = new URL(req.url, `https://${req.headers.host || 'qiblah.local'}`);
      const mosqueId = url.searchParams.get('mosque_id');
      if (!mosqueId) return json(res, 400, { error: 'Missing mosque_id.' });
      requireTestMosque(mosqueId);
      await requireMosqueAdmin(req, mosqueId);
      const connection = await findConnection(mosqueId);
      if (!connection) return json(res, 200, { connected: false });
      const account = await retrieveAccount(connection.stripe_account_id);
      const saved = await saveConnection(mosqueId, account);
      return json(res, 200, { connected: true, account: saved });
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return json(res, 405, { error: 'Method not allowed.' });
    }

    const body = await readJson(req);
    if (!body.mosque_id) return json(res, 400, { error: 'Missing mosque_id.' });
    requireTestMosque(body.mosque_id);
    await requireMosqueAdmin(req, body.mosque_id);

    let connection = await findConnection(body.mosque_id);
    const existingAccountId = connection
      ? connection.stripe_account_id
      : process.env.QIBLAH_TEST_STRIPE_ACCOUNT_ID;
    let account = existingAccountId ? await retrieveAccount(existingAccountId) : await createAccount(body);
    connection = await saveConnection(body.mosque_id, account);

    const link = await createAccountLink(req, account.id, body.mosque_id);
    await supabaseRequest(`mosque_stripe_accounts?mosque_id=eq.${encodeURIComponent(body.mosque_id)}`, {
      method: 'PATCH',
      prefer: 'return=representation',
      body: {
        onboarding_url: link.url,
        onboarding_url_expires_at: new Date(link.expires_at * 1000).toISOString(),
        updated_at: new Date().toISOString()
      }
    });

    json(res, 200, {
      connected: true,
      account: connection,
      onboarding_url: link.url,
      expires_at: link.expires_at
    });
  } catch (error) {
    handleError(res, error);
  }
};
