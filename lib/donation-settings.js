const {supabaseRequest} = require('./stripe-connect');
const methods = require('../assets/donation-methods');
module.exports = async function donationSettings(mosqueId) {
  const rows = await supabaseRequest(`announcements?mosque_id=eq.${encodeURIComponent(mosqueId)}&category=eq.ProfileData&active=eq.true&select=description&order=created_at.desc&limit=1`);
  const profile = rows && rows[0] ? JSON.parse(rows[0].description) : {};
  return {mode:methods.mode(Object.assign({_slug:'qiblah-demo-mosque'},profile))};
};
