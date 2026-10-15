(function(root) {
  function url(value, secure) {
    value = String(value || '').trim();
    if (!value) return '';
    if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) value = 'https://' + value;
    var parsed = new URL(value);
    if ((parsed.protocol !== 'https:' && (secure || parsed.protocol !== 'http:')) || parsed.username || parsed.password) throw new Error('Enter an HTTPS donation link without a username or password.');
    return parsed.href;
  }
  function mode(mosque) {
    if (mosque.donation_method === 'stripe' || mosque.donation_method === 'external') return mosque.donation_method;
    if (mosque.donation_url || mosque.donationUrl || mosque.donation_link || mosque.donationLink) return 'external';
    return (mosque._slug || mosque.slug) === 'qiblah-demo-mosque' ? 'stripe' : 'external';
  }
  var methods = {url:url, mode:mode};
  if (typeof module !== 'undefined' && module.exports) module.exports = methods;
  else root.QiblahDonationMethods = methods;
})(typeof window !== 'undefined' ? window : this);
