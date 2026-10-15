const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const DEMO = '49a8bf95-1f45-4c99-9af7-030f00214d0d';

function dashboard(response, options = {}) {
  const nodes = Object.fromEntries(['stripe-status', 'stripe-connect-btn', 'stripe-refresh-btn', 'stripe-dashboard-link','donation-method-stripe','donation-method-external','donation-stripe-settings','donation-external-settings','external-donation-preview','profile-donation-link','save-donation-settings-btn','donation-settings-status'].map(id => [id, {disabled:false, hidden:true,style:{},value:'',removeAttribute(name){delete this[name];}}]));
  const calls = [];
  const context = {
    document: {getElementById:id=>nodes[id], addEventListener(){}},
    window: {location:{href:''},QiblahDonationMethods:require('../assets/donation-methods')}, location:{search:''}, URL, URLSearchParams,
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
test('saving donation choice preserves other profile information and stored external link',async()=>{
  const {context,nodes}=dashboard(ready);const writes=[];
  context.donationSettingsLoaded=true;
  context.currentData={profileData:{id:'profile-fixture',description:JSON.stringify({name:'Demo',about:'Keep me',custom_field:'preserved'})}};
  context.sbFetch=async(route,config)=>{writes.push({route,payload:JSON.parse(config.body)});return [{id:'profile-fixture',...JSON.parse(config.body)}];};
  context.clearPublicAppCache=()=>{};
  nodes['donation-method-stripe'].checked=true;nodes['profile-donation-link'].value='example.org/donate';
  await context.saveDonationSettings();
  const profile=JSON.parse(writes[0].payload.description);
  assert.equal(profile.custom_field,'preserved');assert.equal(profile.about,'Keep me');
  assert.equal(profile.donation_method,'stripe');assert.equal(profile.donation_url,'https://example.org/donate');
  assert.equal(context.currentMosque.donation_method,'stripe');
});
test('unsafe external links and real-mosque Stripe choices cannot be saved',async()=>{
  const {context,nodes}=dashboard(ready);let writes=0;
  context.donationSettingsLoaded=true;context.currentData={};context.sbFetch=async()=>{writes++;};
  nodes['profile-donation-link'].value='javascript:alert(1)';
  await context.saveDonationSettings();assert.equal(writes,0);
  nodes['profile-donation-link'].value='https://example.org';nodes['donation-method-stripe'].checked=true;
  context.currentMosque.id='real-mosque';await context.saveDonationSettings();assert.equal(writes,0);
});
test('failed donation saves leave published settings unchanged',async()=>{
  const {context,nodes}=dashboard(ready);context.donationSettingsLoaded=true;
  context.currentData={};context.currentMosque.donation_method='stripe';
  context.sbFetch=async()=>{throw new Error('Unavailable');};
  nodes['profile-donation-link'].value='https://example.org';nodes['donation-method-stripe'].checked=false;
  await context.saveDonationSettings();assert.equal(context.currentMosque.donation_method,'stripe');
  assert.match(nodes['donation-settings-status'].textContent,/Could not save/);
});
test('a permission-denied empty update is not reported as saved',async()=>{
  const {context,nodes}=dashboard(ready);context.donationSettingsLoaded=true;
  context.currentData={};context.currentMosque.donation_method='stripe';
  context.sbFetch=async()=>[];
  nodes['profile-donation-link'].value='https://example.org';nodes['donation-method-stripe'].checked=false;
  await context.saveDonationSettings();assert.equal(context.currentMosque.donation_method,'stripe');
  assert.match(nodes['donation-settings-status'].textContent,/Could not save/);
});

test('browser Back restores sandbox controls after Stripe navigation',async()=>{
  const {context,nodes,calls}=dashboard(ready);
  context.stripeOnboardingPending=true;
  nodes['stripe-connect-btn'].disabled=true;
  nodes['stripe-refresh-btn'].disabled=true;
  await context.window.onpageshow({persisted:true});
  assert.equal(context.stripeOnboardingPending,false);
  assert.equal(calls.length,1);
  assert.equal(nodes['stripe-connect-btn'].disabled,false);
  assert.equal(nodes['stripe-refresh-btn'].disabled,false);
  assert.match(nodes['stripe-status'].innerHTML,/Ready for test donations/);
});
test('normal page load does not duplicate the initial status request',async()=>{
  const {context,calls}=dashboard(ready);
  await context.window.onpageshow({persisted:false});
  assert.equal(calls.length,0);
});

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
