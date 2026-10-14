const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { PassThrough } = require('node:stream');
const demo = require('./fixtures/demo-mosque.json');
const checkout = require('../api/stripe/checkout');
const onboarding = require('../api/stripe/connect-account');
const webhook = require('../api/stripe/webhook');
const readiness = require('../api/stripe/status');
const {handleError} = require('../lib/stripe-connect');
let requests, events, updates, capability, failUpdate;

beforeEach(() => {
  process.env.STRIPE_SECRET_KEY = ['rk', 'test', 'fixture'].join('_');
  process.env.STRIPE_WEBHOOK_SECRET = 'unit-test-signing-secret';
  process.env.SUPABASE_URL = 'https://database.example';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'unit-test-service-role';
  process.env.QIBLAH_SITE_URL = 'http://127.0.0.1:4387';
  requests = []; events = new Map(); updates = []; capability = 'active'; failUpdate = false;
  global.fetch = async (url, options = {}) => {
    const parsed = new URL(url);
    requests.push({url, ...options});
    let data = [];
    if (parsed.host === 'api.stripe.com') {
      if (parsed.pathname.startsWith('/v2/core/accounts/')) {
        assert.equal(parsed.searchParams.has('include[]'), false, 'Stripe v2 requires indexed include parameters');
        assert.equal(parsed.searchParams.get('include[0]'), 'configuration.merchant');
        data = {id:demo.stripe_account_id,livemode:false,configuration:{merchant:{capabilities:{card_payments:{status:capability}}}}};
      } else if (parsed.pathname === '/v1/checkout/sessions') {
        data = {id:'cs_test_fixture',livemode:false,status:'open',payment_status:'unpaid',url:'https://checkout.stripe.com/test-fixture'};
      } else throw new Error('Unexpected Stripe request');
    } else if (parsed.pathname.endsWith('/mosques')) data = [demo];
    else if (parsed.pathname.endsWith('/mosque_stripe_accounts')) data = [{mosque_id:demo.id,stripe_account_id:demo.stripe_account_id,livemode:false}];
    else if (parsed.pathname.endsWith('/stripe_events')) {
      const id = (parsed.searchParams.get('id') || '').replace(/^eq\./, '');
      if (options.method === 'POST') {
        const event = JSON.parse(options.body);
        if (!events.has(event.id)) {events.set(event.id,event);data=[event];}
      } else if (options.method === 'PATCH') {
        Object.assign(events.get(id), JSON.parse(options.body));
      } else data = events.has(id) ? [events.get(id)] : [];
    } else if (parsed.pathname.endsWith('/donation_checkout_sessions')) {
      if (options.method === 'PATCH') {
        if (failUpdate) {failUpdate=false;throw new Error('Simulated database outage');}
        updates.push(JSON.parse(options.body));
      }
    } else throw new Error('Unexpected database request');
    return {ok:true,status:200,text:async()=>JSON.stringify(data)};
  };
});

async function invoke(handler, body, headers = {}, method = 'POST', url = '/') {
  const req = new PassThrough(); req.method=method; req.url=url; req.headers={host:'127.0.0.1:4387',...headers};
  const res = {statusCode:200,setHeader(){},end(value){this.body=JSON.parse(value);}};
  const pending = handler(req,res); req.end(JSON.stringify(body)); await pending; return res;
}
function event(id='evt_test_fixture', type='checkout.session.completed') {
  return {id,type,livemode:false,account:demo.stripe_account_id,data:{object:{id:'cs_test_fixture',payment_status:'paid',status:'complete',payment_intent:'pi_test_fixture'}}};
}
function signature(body) {
  const timestamp=Math.floor(Date.now()/1000);
  const digest=crypto.createHmac('sha256',process.env.STRIPE_WEBHOOK_SECRET).update(timestamp+'.'+JSON.stringify(body)).digest('hex');
  return `t=${timestamp},v1=${digest}`;
}
async function deliver(body) {return invoke(webhook,body,{'stripe-signature':signature(body)});}

test('real mosque IDs cannot start test donations', async()=>{
  const res=await invoke(checkout,{mosque_id:'caa61c18-8f20-48f3-bbae-88161358e5ee',amount:10});
  assert.equal(res.statusCode,403);assert.equal(requests.length,0);
});
test('invalid donation amounts never reach Stripe', async()=>{
  for (const amount of [0,-1,10001,'invalid']) assert.equal((await invoke(checkout,{mosque_id:demo.id,amount})).statusCode,400);
  assert.equal(requests.length,0);
});
test('verified sign-in is required for onboarding', async()=>{
  assert.equal((await invoke(onboarding,{mosque_id:demo.id})).statusCode,401);
  assert.equal(requests.length,0);
});
test('Checkout uses the connected account, GBP and no platform fee', async()=>{
  const res=await invoke(checkout,{mosque_id:demo.id,amount:10,idempotency_key:'demo-donation-test-1'});
  assert.equal(res.statusCode,200);
  const request=requests.find(r=>r.url.endsWith('/v1/checkout/sessions'));
  assert.equal(request.headers['Stripe-Account'],demo.stripe_account_id);
  assert.equal(request.headers['Idempotency-Key'],'demo-donation-test-1');
  const body=new URLSearchParams(request.body);
  assert.equal(body.get('line_items[0][price_data][unit_amount]'),'1000');
  assert.equal(body.get('line_items[0][price_data][currency]'),'gbp');
  assert.equal(body.get('metadata[qiblah_platform_fee]'),'0');
  assert.ok(!request.body.includes('application_fee_amount'));
  assert.ok(!request.body.includes('payment_method_types'));
});
test('incomplete onboarding blocks Checkout', async()=>{
  capability='inactive';assert.equal((await invoke(checkout,{mosque_id:demo.id,amount:10})).statusCode,409);
  assert.ok(!requests.some(r=>r.url.endsWith('/v1/checkout/sessions')));
});
test('live credentials are rejected before any Stripe request', async()=>{
  process.env.STRIPE_SECRET_KEY=['sk','live','fixture'].join('_');
  assert.equal((await invoke(checkout,{mosque_id:demo.id,amount:10})).statusCode,500);
  assert.ok(!requests.some(r=>r.url.startsWith('https://api.stripe.com')));
});
test('unsigned and tampered webhooks do not touch the database', async()=>{
  const body=event();assert.equal((await invoke(webhook,body)).statusCode,400);
  const sig=signature(body);body.id='evt_tampered';
  assert.equal((await invoke(webhook,body,{'stripe-signature':sig})).statusCode,400);
  assert.equal(requests.length,0);
});
test('live webhook events are rejected even with a valid signature', async()=>{
  const body=event();body.livemode=true;assert.equal((await deliver(body)).statusCode,400);assert.equal(events.size,0);
});
test('duplicate completed events update a payment only once', async()=>{
  const body=event();assert.equal((await deliver(body)).statusCode,200);
  assert.equal((await deliver(body)).body.duplicate,true);assert.equal(updates.length,1);
});
test('a webhook interrupted by an outage can be retried successfully', async()=>{
  failUpdate=true;const body=event();assert.equal((await deliver(body)).statusCode,500);
  assert.equal(events.get(body.id).processed_at,null);
  assert.equal((await deliver(body)).statusCode,200);assert.equal(updates.length,1);
  assert.ok(events.get(body.id).processed_at);
});
test('asynchronous payment failure stays unpaid and success becomes paid', async()=>{
  const failed=event('evt_failed','checkout.session.async_payment_failed');failed.data.object.payment_status='unpaid';
  await deliver(failed);assert.equal(updates[0].payment_status,'unpaid');
  await deliver(event('evt_paid','checkout.session.async_payment_succeeded'));assert.equal(updates[1].payment_status,'paid');
});
test('readiness keeps checkout disabled when webhook setup is missing', async()=>{
  delete process.env.STRIPE_WEBHOOK_SECRET;
  const res=await invoke(readiness,{}, {},'GET','/api/stripe/status?mosque_id='+demo.id);
  assert.equal(res.statusCode,200);assert.equal(res.body.ready,false);assert.equal(requests.length,0);
});
test('readiness never uses a live credential', async()=>{
  process.env.STRIPE_SECRET_KEY=['rk','live','fixture'].join('_');
  const res=await invoke(readiness,{}, {},'GET','/api/stripe/status?mosque_id='+demo.id);
  assert.equal(res.body.ready,false);assert.equal(requests.length,0);
});
test('readiness enables only an active connected sandbox account', async()=>{
  const res=await invoke(readiness,{}, {},'GET','/api/stripe/status?mosque_id='+demo.id);
  assert.equal(res.body.ready,true);assert.equal(res.body.test_mode,true);
  capability='inactive';
  assert.equal((await invoke(readiness,{}, {},'GET','/api/stripe/status?mosque_id='+demo.id)).body.ready,false);
});
test('readiness rejects real mosque records', async()=>{
  const res=await invoke(readiness,{}, {},'GET','/api/stripe/status?mosque_id=caa61c18-8f20-48f3-bbae-88161358e5ee');
  assert.equal(res.statusCode,403);assert.equal(requests.length,0);
});
test('credential failures never return Stripe keys to the browser', ()=>{
  const secret=['rk','test','do-not-expose'].join('_');
  const error=Object.assign(new Error('Invalid API Key provided: '+secret),{statusCode:401,stripe:{type:'authentication_error'}});
  const res={setHeader(){},end(value){this.body=value;}};
  handleError(res,error);assert.equal(res.statusCode,401);assert.ok(!res.body.includes(secret));
});
