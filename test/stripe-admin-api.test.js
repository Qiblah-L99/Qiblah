const {test} = require('node:test');
const assert = require('node:assert/strict');
const {PassThrough} = require('node:stream');
const onboarding = require('../api/stripe/connect-account');
const DEMO = '49a8bf95-1f45-4c99-9af7-030f00214d0d';

async function request(method, approved) {
  const calls=[];
  process.env.STRIPE_SECRET_KEY='rk_test_fixture';
  process.env.SUPABASE_URL='https://database.example';
  process.env.SUPABASE_SERVICE_ROLE_KEY='test-service-role';
  process.env.QIBLAH_SITE_URL='https://qiblah.example';
  global.fetch=async (url, options={})=>{
    calls.push({url,options});
    const parsed=new URL(url);
    let data;
    if(parsed.pathname==='/auth/v1/user') data={id:'verified-user'};
    else if(parsed.pathname.endsWith('/mosque_admin_members')) data=approved ? [{id:'member',role:'admin',status:'active'}] : [];
    else if(parsed.pathname.startsWith('/v2/core/accounts/')) data={id:'acct_demo',livemode:false,dashboard:'full',identity:{private_value:'not-for-browser'},defaults:{responsibilities:{fees_collector:'stripe',losses_collector:'stripe'}},configuration:{merchant:{capabilities:{card_payments:{status:'active'}}}}};
    else if(parsed.pathname==='/v1/account_links') data={url:'https://connect.stripe.com/setup/fixture',expires_at:1900000000};
    else if(parsed.pathname.endsWith('/mosque_stripe_accounts')) {
      if(options.method==='POST') data=[JSON.parse(options.body)];
      else data=[{mosque_id:DEMO,stripe_account_id:'acct_demo',livemode:false}];
    } else throw new Error('Unexpected request '+url);
    return {ok:true,status:200,text:async()=>JSON.stringify(data),json:async()=>data};
  };
  const req=new PassThrough();
  req.method=method;req.url='/api/stripe/connect-account?mosque_id='+DEMO;req.headers={authorization:'Bearer verified-token'};
  const res={setHeader(){},end(data){this.body=JSON.parse(data);}};
  const pending=onboarding(req,res);req.end(JSON.stringify({mosque_id:DEMO}));await pending;
  return {res,calls};
}
test('approved admin gets minimal sandbox status, without identity details',async()=>{
  const {res}=await request('GET',true);
  assert.equal(res.statusCode,200);
  assert.equal(res.body.test_mode,true);
  assert.equal(res.body.account.card_payments_status,'active');
  assert.equal(res.body.account.details,undefined);
  assert.equal(res.body.account.identity,undefined);
  assert.equal(res.body.account.onboarding_url,undefined);
});
test('unapproved signed-in user never reaches Stripe',async()=>{
  const {res,calls}=await request('POST',false);
  assert.equal(res.statusCode,403);
  assert.ok(!calls.some(call=>call.url.startsWith('https://api.stripe.com')));
});
test('onboarding return and refresh URLs keep the approved mosque context',async()=>{
  const {res,calls}=await request('POST',true);
  assert.equal(res.statusCode,200);
  assert.equal(res.body.test_mode,true);
  const call=calls.find(call=>call.url.endsWith('/v1/account_links'));
  const form=new URLSearchParams(call.options.body);
  for(const key of ['return_url','refresh_url']) assert.equal(new URL(form.get(key)).searchParams.get('mosque_id'),DEMO);
  const membership=calls.find(call=>call.url.includes('/mosque_admin_members'));
  assert.equal(new URL(membership.url).searchParams.get('user_id'),'eq.verified-user');
});
