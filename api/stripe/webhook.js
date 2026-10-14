const {
  handleError,
  json,
  readRawBody,
  supabaseRequest,
  verifyStripeSignature
} = require('../../lib/stripe-connect');

async function recordEvent(event) {
  const rows = await supabaseRequest('stripe_events?on_conflict=id', {
    method: 'POST',
    prefer: 'resolution=ignore-duplicates,return=representation',
    body: {
      id: event.id,
      type: event.type,
      stripe_account_id: event.account || null,
      livemode: Boolean(event.livemode),
      payload: event,
      processed_at: null
    }
  });
  if (rows && rows.length) return true;
  const existing = await supabaseRequest(`stripe_events?select=processed_at&id=eq.${encodeURIComponent(event.id)}&limit=1`);
  // An interrupted attempt must be retried; only completed events are duplicates.
  return !existing || !existing.length || !existing[0].processed_at;
}

async function markProcessed(eventId) {
  await supabaseRequest(`stripe_events?id=eq.${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    body: {
      processed_at: new Date().toISOString()
    }
  });
}

async function updateCheckoutSession(session, accountId) {
  if (!session || !session.id) return;
  await supabaseRequest(`donation_checkout_sessions?stripe_session_id=eq.${encodeURIComponent(session.id)}`, {
    method: 'PATCH',
    body: {
      stripe_account_id: accountId || null,
      payment_intent_id: session.payment_intent || null,
      payment_status: session.payment_status || null,
      checkout_status: session.status || null,
      donor_email: (session.customer_details && session.customer_details.email) || session.customer_email || null,
      raw_session: session,
      updated_at: new Date().toISOString()
    }
  });
}

async function updateAccount(account) {
  if (!account || !account.id) return;
  const status = account.configuration &&
    account.configuration.merchant &&
    account.configuration.merchant.capabilities &&
    account.configuration.merchant.capabilities.card_payments &&
    account.configuration.merchant.capabilities.card_payments.status;
  await supabaseRequest(`mosque_stripe_accounts?stripe_account_id=eq.${encodeURIComponent(account.id)}`, {
    method: 'PATCH',
    body: {
      card_payments_status: status || 'unknown',
      onboarding_complete: status === 'active',
      details: account,
      updated_at: new Date().toISOString()
    }
  });
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return json(res, 405, { error: 'Method not allowed.' });
    }

    const raw = await readRawBody(req);
    try {
      verifyStripeSignature(raw, req.headers['stripe-signature']);
    } catch (error) {
      if (!String(error.message).startsWith('Missing STRIPE_WEBHOOK_SECRET')) error.statusCode = 400;
      throw error;
    }
    const event = JSON.parse(raw.toString('utf8'));
    if (event.livemode !== false) return json(res, 400, { error: 'Only sandbox webhook events are accepted.' });
    const firstSeen = await recordEvent(event);
    if (!firstSeen) return json(res, 200, { received: true, duplicate: true });

    const object = event.data && event.data.object;
    if (
      event.type === 'checkout.session.completed' ||
      event.type === 'checkout.session.async_payment_succeeded' ||
      event.type === 'checkout.session.async_payment_failed'
    ) {
      await updateCheckoutSession(object, event.account);
    } else if (
      event.type === 'v2.core.account.updated' ||
      event.type === 'account.updated'
    ) {
      await updateAccount(object);
    }

    await markProcessed(event.id);
    json(res, 200, { received: true });
  } catch (error) {
    handleError(res, error);
  }
};
