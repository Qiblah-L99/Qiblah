const crypto = require('node:crypto');
const {requiredEnv} = require('./stripe-connect');
function signature(sessionId, mosqueId, accountId, expires) {
  return crypto.createHmac('sha256',requiredEnv('STRIPE_WEBHOOK_SECRET'))
    .update(JSON.stringify(['qiblah-checkout-confirmation-v1',sessionId,mosqueId,accountId,expires]))
    .digest('hex');
}
function issue(session, mosqueId, accountId) {
  const expires = Number(session.expires_at) || Math.floor(Date.now()/1000)+86400;
  return `${expires}.${signature(session.id,mosqueId,accountId,expires)}`;
}
function verify(token, sessionId, mosqueId, accountId) {
  const match = typeof token === 'string' && token.match(/^(\d{10})\.([a-f0-9]{64})$/);
  if (!match || Number(match[1]) <= Math.floor(Date.now()/1000)) return false;
  const expected = Buffer.from(signature(sessionId,mosqueId,accountId,Number(match[1])),'hex');
  return crypto.timingSafeEqual(expected,Buffer.from(match[2],'hex'));
}
module.exports = {issue,verify};
