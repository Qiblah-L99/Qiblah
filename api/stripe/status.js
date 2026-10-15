const {json, requireTestMosque, stripeRequest, supabaseRequest, handleError} = require('../../lib/stripe-connect');
const donationSettings = require('../../lib/donation-settings');
module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'GET') return json(res,405,{error:'Method not allowed.'});
    const id = new URL(req.url,'https://qiblah.local').searchParams.get('mosque_id');
    requireTestMosque(id);
    res.setHeader('Cache-Control','no-store');
    const key = process.env.STRIPE_SECRET_KEY || '';
    if (!/^(?:sk|rk)_test_/.test(key) || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.SUPABASE_URL || !process.env.STRIPE_WEBHOOK_SECRET) {
      return json(res,200,{ready:false,test_mode:true,reason:'Stripe test checkout is not configured yet. No payment can be taken.'});
    }
    const rows = await supabaseRequest(`mosque_stripe_accounts?select=stripe_account_id,livemode&mosque_id=eq.${encodeURIComponent(id)}&limit=1`);
    if ((await donationSettings(id)).mode !== 'stripe') return json(res,200,{ready:false,test_mode:true,reason:'This mosque has chosen an external donation link.'});
    const connection = rows && rows[0];
    if (!connection || connection.livemode !== false) return json(res,200,{ready:false,test_mode:true,reason:'The demo mosque is not connected to its Stripe sandbox account yet.'});
    const account = await stripeRequest(`/v2/core/accounts/${encodeURIComponent(connection.stripe_account_id)}?include[0]=configuration.merchant`);
    const ready = account.configuration?.merchant?.capabilities?.card_payments?.status === 'active';
    return json(res,200,{ready,test_mode:true,reason:ready?'Stripe sandbox ready.':'The Stripe demo account still needs onboarding information.'});
  } catch (error) { handleError(res,error); }
};
