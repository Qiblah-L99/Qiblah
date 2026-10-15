const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function resetPage(response = {id:'fixture-user'}, status = 200) {
  const nodes = Object.fromEntries(['new-password-input','new-password-confirm-input','password-reset-error','save-new-password-btn'].map(id => [id,{value:'fixture-password-123',style:{},disabled:false}]));
  const calls = [], timers = [], replacements = [];
  const context = {
    document:{getElementById:id=>nodes[id],addEventListener(){},title:'Qiblah'},
    window:{}, location:{search:'?reset_password=1',pathname:'/mosque/',hash:'#access_token=recovery-fixture&type=recovery&expires_in=3600'},
    history:{replaceState(...args){replacements.push(args);}}, URL, URLSearchParams,
    setTimeout(fn){timers.push(fn);},
    fetch:async(url,options)=>{
      calls.push({url,options});
      const data = typeof response === 'function' ? await response() : response;
      return {ok:status===200,status,text:async()=>JSON.stringify(data)};
    }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../mosque/admin.js'),'utf8'),context);
  return {context,nodes,calls,timers,replacements};
}

test('recovery link session saves password without an SDK session',async()=>{
  const {context,nodes,calls,timers,replacements}=resetPage();
  context.captureAuthSessionFromUrl();
  await context.saveNewPassword();
  assert.equal(calls.length,1);
  assert.match(calls[0].url,/\/auth\/v1\/user$/);
  assert.equal(calls[0].options.method,'PUT');
  assert.equal(calls[0].options.headers.Authorization,'Bearer recovery-fixture');
  assert.deepEqual(JSON.parse(calls[0].options.body),{password:'fixture-password-123'});
  assert.equal(replacements[0][2],'/mosque/?reset_password=1');
  assert.equal(nodes['new-password-input'].value,'');
  assert.equal(nodes['new-password-confirm-input'].value,'');
  assert.match(nodes['password-reset-error'].textContent,/Password updated/);
  assert.equal(timers.length,1);
  assert.equal(nodes['save-new-password-btn'].disabled,false);
});
test('missing or expired reset session never sends a password',async()=>{
  for(const session of [null,{access_token:'expired-fixture',expires_at:1}]) {
    const {context,nodes,calls}=resetPage();
    context.currentAuthSession=session;
    await context.saveNewPassword();
    assert.equal(calls.length,0);
    assert.match(nodes['password-reset-error'].textContent,/reset session has expired/);
  }
});
test('password validation happens before any request',async()=>{
  for(const [password,confirm] of [['short','short'],['long-password','different-password']]) {
    const {context,nodes,calls}=resetPage();
    context.captureAuthSessionFromUrl();
    nodes['new-password-input'].value=password;
    nodes['new-password-confirm-input'].value=confirm;
    await context.saveNewPassword();
    assert.equal(calls.length,0);
  }
});
test('repeated save clicks make only one authenticated request',async()=>{
  let finish;
  const pending=new Promise(resolve=>{finish=resolve;});
  const {context,nodes,calls}=resetPage(()=>pending);
  context.captureAuthSessionFromUrl();
  const first=context.saveNewPassword();
  await context.saveNewPassword();
  assert.equal(calls.length,1);
  assert.equal(nodes['save-new-password-btn'].disabled,true);
  finish({id:'fixture-user'});
  await first;
});
test('failed password update allows retry without reporting success',async()=>{
  const {context,nodes,timers}=resetPage({msg:'Invalid recovery token'},401);
  context.captureAuthSessionFromUrl();
  await context.saveNewPassword();
  assert.match(nodes['password-reset-error'].textContent,/Invalid recovery token/);
  assert.equal(timers.length,0);
  assert.equal(nodes['save-new-password-btn'].disabled,false);
  assert.equal(context.passwordResetPending,false);
});
