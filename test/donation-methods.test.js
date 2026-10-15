const {test}=require('node:test');
const assert=require('node:assert/strict');
const methods=require('../assets/donation-methods');
test('explicit dashboard choice overrides demo and saved external links',()=>{
  assert.equal(methods.mode({_slug:'qiblah-demo-mosque'}),'stripe');
  assert.equal(methods.mode({_slug:'qiblah-demo-mosque',donation_method:'external'}),'external');
  assert.equal(methods.mode({donation_url:'https://example.org',donation_method:'stripe'}),'stripe');
  assert.equal(methods.mode({donation_url:'https://example.org'}),'external');
  assert.equal(methods.mode({}),'external');
});
test('donation links accept HTTPS, support blank values and reject unsafe URLs',()=>{
  assert.equal(methods.url('example.org/donate',true),'https://example.org/donate');
  assert.equal(methods.url('',true),'');
  for(const value of ['javascript:alert(1)','http://example.org','https://user:password@example.org','data:text/html,test'])assert.throws(()=>methods.url(value,true));
});
