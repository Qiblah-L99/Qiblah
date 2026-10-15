const confirmation = require('../../lib/checkout-confirmation');
const {json, readJson, requireTestMosque, supabaseRequest, stripeRequest, handleError} = require('../../lib/stripe-connect');
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method !== 'POST') return json(res,405,{error:'Method not allowed.'});
    const body = await readJson(req);
    requireTestMosque(body.mosque_id);
    if (!/^cs_test_[A-Za-z0-9]+$/.test(body.session_id || '') || typeof body.confirmation_token !== 'string' || body.confirmation_token.length > 128) return json(res,400,{error:'Invalid test checkout.'});
    const rows = await supabaseRequest(`donation_checkout_sessions?stripe_session_id=eq.${encodeURIComponent(body.session_id)}&mosque_id=eq.${encodeURIComponent(body.mosque_id)}&select=stripe_account_id,payment_status&limit=1`);
    if (!rows || !rows[0]) return json(res,404,{error:'Test checkout not found.'});
    if (!confirmation.verify(body.confirmation_token,body.session_id,body.mosque_id,rows[0].stripe_account_id)) return json(res,403,{error:'Unable to verify this test checkout.'});
    const session = await stripeRequest(`/v1/checkout/sessions/${encodeURIComponent(body.session_id)}`, {stripeAccount:rows[0].stripe_account_id});
    if (session.livemode !== false || session.client_reference_id !== body.mosque_id) return json(res,403,{error:'Unable to verify this test checkout.'});
    return json(res,200,{checkout_status:session.status,payment_status:session.payment_status,recorded:rows[0].payment_status === 'paid',test_mode:true});
  } catch (error) { handleError(res,error); }
};
