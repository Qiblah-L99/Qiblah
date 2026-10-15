const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const DEMO = '49a8bf95-1f45-4c99-9af7-030f00214d0d';

function dashboard(response, options = {}) {
  const nodes = Object.fromEntries(['stripe-status', 'stripe-connect-btn', 'stripe-refresh-btn', 'stripe-dashboard-link'].map(id => [id, {disabled:false, hidden:true}]));
  const calls = [];
  const context = {
    document: {getElementById:id=>nodes[id], addEventListener(){}},
    window: {location:{href:''}}, location:{search:''}, URL, URLSearchParams,
    fetch: async (url, config)=>{
      calls.push({url, config});
      const data = typeof response === 'function' ? await response() : response;
      return {ok:!options.status || options.status === 200, status:options.status || 200, json:async()=>data};
    }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../mosque/admin.js'), 'utf8'), context);
  context.currentMosque = {id:DEMO, name:'Qiblah Demo Mosque'};
  context.currentAuthSession = {access_token:'verified-fixture'};
  return {context, nodes, calls};
}
const ready = {test_mode:true, connected:true, account:{livemode:false, card_payments_status:'active'}};

test('legacy PIN access cannot request Stripe onboarding', async()=>{
  const {context,nodes,calls}=dashboard(ready);
  context.currentAuthSession=null;
  await context.startStripeOnboarding();
  assert.equal(calls.length,0);
  assert.equal(nodes['stripe-connect-btn'].disabled,true);
  assert.match(nodes['stripe-status'].innerHTML,/Verified sign-in required/);
});
test('real mosque controls remain disabled without contacting Stripe', async()=>{
  const {context,nodes,calls}=dashboard(ready);
  context.currentMosque.id='real-mosque';
  await context.loadStripeStatus();
  assert.equal(calls.length,0);
  assert.equal(nodes['stripe-refresh-btn'].disabled,true);
  assert.match(nodes['stripe-status'].innerHTML,/Donations not enabled/);
});
test('ready sandbox account has review and Dashboard controls', async()=>{
  const {context,nodes,calls}=dashboard(ready);
  await context.loadStripeStatus();
  assert.equal(calls[0].config.headers.Authorization,'Bearer verified-fixture');
  assert.equal(nodes['stripe-connect-btn'].textContent,'Review Stripe details');
  assert.equal(nodes['stripe-dashboard-link'].hidden,false);
  assert.match(nodes['stripe-status'].innerHTML,/Ready for test donations/);
});
test('not connected and incomplete onboarding have distinct actions', async()=>{
  const missing=dashboard({test_mode:true,connected:false});
  await missing.context.loadStripeStatus();
  assert.equal(missing.nodes['stripe-connect-btn'].textContent,'Connect Stripe');
  assert.equal(missing.nodes['stripe-connect-btn'].disabled,false);
  const incomplete=dashboard({...ready,account:{livemode:false,card_payments_status:'inactive'}});
  await incomplete.context.loadStripeStatus();
  assert.equal(incomplete.nodes['stripe-connect-btn'].textContent,'Continue setup');
});
test('expired and unapproved sessions cannot start onboarding', async()=>{
  for (const status of [401,403]) {
    const {context,nodes}=dashboard({error:'Not approved'},{status});
    await context.loadStripeStatus();
    assert.equal(nodes['stripe-connect-btn'].disabled,true);
    assert.equal(nodes['stripe-dashboard-link'].hidden,true);
  }
});
test('live account responses are never shown as ready', async()=>{
  const {context,nodes}=dashboard({...ready,account:{livemode:true,card_payments_status:'active'}});
  await context.loadStripeStatus();
  assert.equal(nodes['stripe-connect-btn'].disabled,true);
  assert.match(nodes['stripe-status'].innerHTML,/Live accounts are disabled/);
});
test('stale status cannot update another mosque dashboard', async()=>{
  let resolve;
  const response=new Promise(done=>{resolve=done;});
  const {context,nodes}=dashboard(()=>response);
  const request=context.loadStripeStatus();
  context.currentMosque={id:'different-mosque'};
  resolve(ready);
  await request;
  assert.equal(nodes['stripe-dashboard-link'].hidden,true);
  assert.doesNotMatch(nodes['stripe-status'].innerHTML,/Ready for test donations/);
});
test('onboarding redirects only to HTTPS connect.stripe.com', async()=>{
  for (const url of ['https://evil.example/setup','http://connect.stripe.com/setup','https://connect.stripe.com.evil.example/setup','https://user@connect.stripe.com/setup']) {
    const {context,nodes}=dashboard({test_mode:true,onboarding_url:url});
    await context.startStripeOnboarding();
    assert.equal(context.window.location.href,'');
    assert.match(nodes['stripe-status'].innerHTML,/invalid onboarding link/);
  }
  const {context}=dashboard({test_mode:true,onboarding_url:'https://connect.stripe.com/setup/test'});
  await context.startStripeOnboarding();
  assert.equal(context.window.location.href,'https://connect.stripe.com/setup/test');
});
test('repeated onboarding clicks create only one request', async()=>{
  let resolve;
  const response=new Promise(done=>{resolve=done;});
  const {context,calls}=dashboard(()=>response);
  const first=context.startStripeOnboarding();
  await context.startStripeOnboarding();
  assert.equal(calls.length,1);
  resolve({test_mode:true,onboarding_url:'https://connect.stripe.com/setup/test'});
  await first;
});
