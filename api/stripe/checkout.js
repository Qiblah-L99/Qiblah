const {
  CONNECT_INTEGRATION_ID,
  handleError,
  json,
  randomSuffix,
  readJson,
  requiredEnv,
  requireTestMosque,
  siteUrl,
  stripeRequest,
  supabaseRequest
} = require('../../lib/stripe-connect');

function cleanAmount(value) {
  const amount = Math.round(Number(value) * 100);
  if (!Number.isFinite(amount) || amount < 100) return null;
  if (amount > 1000000) return null;
  return amount;
}

function cleanEmail(value) {
  const email = String(value || '').trim();
  return email && email.includes('@') ? email.slice(0, 320) : undefined;
}

async function findMosque(mosqueId) {
  const rows = await supabaseRequest(
    `mosques?select=id,slug,name,email,donation_url&id=eq.${encodeURIComponent(mosqueId)}&limit=1`
  );
  return rows && rows[0] ? rows[0] : null;
}

async function findConnection(mosqueId) {
  const rows = await supabaseRequest(
    `mosque_stripe_accounts?select=*&mosque_id=eq.${encodeURIComponent(mosqueId)}&limit=1`
  );
  return rows && rows[0] ? rows[0] : null;
}

async function assertReady(connection) {
  if (connection && connection.livemode !== false) {
    const error = new Error('Only a test mosque account can accept test donations.');
    error.statusCode = 409;
    throw error;
  }
  if (!connection || !connection.stripe_account_id) {
    const error = new Error('This mosque has not connected Stripe yet.');
    error.statusCode = 409;
    error.expose = 'Stripe donations are not ready for this mosque yet.';
    throw error;
  }
  const account = await stripeRequest(
    `/v2/core/accounts/${encodeURIComponent(connection.stripe_account_id)}?include[]=configuration.merchant&include[]=defaults`
  );
  const status = account &&
    account.configuration &&
    account.configuration.merchant &&
    account.configuration.merchant.capabilities &&
    account.configuration.merchant.capabilities.card_payments &&
    account.configuration.merchant.capabilities.card_payments.status;
  await supabaseRequest(`mosque_stripe_accounts?mosque_id=eq.${encodeURIComponent(connection.mosque_id)}`, {
    method: 'PATCH',
    body: {
      card_payments_status: status || 'unknown',
      onboarding_complete: status === 'active',
      details: account,
      updated_at: new Date().toISOString()
    }
  });
  if (status !== 'active') {
    const error = new Error('Stripe onboarding is not complete for this mosque.');
    error.statusCode = 409;
    error.expose = 'Stripe donations are not ready for this mosque yet.';
    throw error;
  }
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return json(res, 405, { error: 'Method not allowed.' });
    }

    const body = await readJson(req);
    if (!body.mosque_id) return json(res, 400, { error: 'Missing mosque_id.' });
    requireTestMosque(body.mosque_id);
    const amount = cleanAmount(body.amount);
    if (!amount) return json(res, 400, { error: 'Enter a donation amount between £1 and £10,000.' });
    requiredEnv('STRIPE_WEBHOOK_SECRET');

    const mosque = await findMosque(body.mosque_id);
    if (!mosque) return json(res, 404, { error: 'Mosque not found.' });
    const connection = await findConnection(body.mosque_id);
    await assertReady(connection);

    const base = siteUrl(req);
    const idempotencyKey = body.idempotency_key || `qiblah-donation-${body.mosque_id}-${amount}-${Date.now()}-${randomSuffix()}`;
    const session = await stripeRequest('/v1/checkout/sessions', {
      method: 'POST',
      stripeAccount: connection.stripe_account_id,
      idempotencyKey,
      form: {
        mode: 'payment',
        success_url: `${base}/?donation=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${base}/?donation=cancelled&mosque=${encodeURIComponent(mosque.slug || mosque.id)}`,
        customer_email: cleanEmail(body.email),
        client_reference_id: mosque.id,
        integration_identifier: CONNECT_INTEGRATION_ID + randomSuffix(),
        line_items: [{
          quantity: 1,
          price_data: {
            currency: 'gbp',
            unit_amount: amount,
            product_data: {
              name: `Donation to ${mosque.name || 'mosque'}`,
              metadata: {
                qiblah_mosque_id: mosque.id
              }
            }
          }
        }],
        payment_intent_data: {
          metadata: {
            qiblah_mosque_id: mosque.id,
            qiblah_mosque_name: mosque.name || '',
            qiblah_platform_fee: '0'
          }
        },
        metadata: {
          qiblah_mosque_id: mosque.id,
          qiblah_mosque_name: mosque.name || '',
          qiblah_platform_fee: '0'
        }
      }
    });

    await supabaseRequest('donation_checkout_sessions?on_conflict=stripe_session_id', {
      method: 'POST',
      prefer: 'resolution=ignore-duplicates,return=representation',
      body: {
        stripe_session_id: session.id,
        stripe_account_id: connection.stripe_account_id,
        mosque_id: mosque.id,
        amount: amount,
        currency: 'gbp',
        payment_status: session.payment_status || 'unpaid',
        checkout_status: session.status || 'open',
        donor_email: cleanEmail(body.email) || null,
        raw_session: session
      }
    });

    json(res, 200, { url: session.url, id: session.id });
  } catch (error) {
    handleError(res, error);
  }
};
