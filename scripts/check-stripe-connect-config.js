const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const files = [
  'api/stripe/connect-account.js',
  'api/stripe/checkout.js',
  'api/stripe/webhook.js',
  'api/stripe/status.js',
  'assets/stripe-donations.js',
  'lib/stripe-connect.js',
  'mosque/admin.js',
  'index.source.html'
];

let failed = false;

for (const file of files) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  if (/payment_method_types/.test(source)) {
    console.error(`${file}: do not hardcode payment_method_types`);
    failed = true;
  }
  if (/application_fee_amount/.test(source)) {
    console.error(`${file}: zero platform fees means no application_fee_amount`);
    failed = true;
  }
  if (/[sr]k_(test|live)_[A-Za-z0-9]/.test(source)) {
    console.error(`${file}: possible Stripe secret or restricted key in source`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log('Stripe Connect config checks passed');
