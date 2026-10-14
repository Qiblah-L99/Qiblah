(function () {
  var dialog, mosque, submit, amount, status, ready = false, requestNumber = 0, checkoutKey, opener;
  function init() {
    if (dialog) return;
    dialog = document.createElement('dialog');
    dialog.className = 'qiblah-donation';
    dialog.setAttribute('aria-labelledby', 'qiblah-donation-title');
    dialog.innerHTML = '<button class="qiblah-donation-close" type="button" aria-label="Close donation">&times;</button>' +
      '<h2 id="qiblah-donation-title"></h2><p>Sandbox test donation. No real money is collected.</p>' +
      '<form><div class="qiblah-donation-presets" role="group" aria-label="Donation amount">' +
      '<button type="button" data-amount="5" aria-pressed="false">&pound;5</button><button type="button" data-amount="10" aria-pressed="true">&pound;10</button><button type="button" data-amount="20" aria-pressed="false">&pound;20</button></div>' +
      '<label for="qiblah-donation-amount">Amount</label><div class="qiblah-donation-money"><span>&pound;</span><input id="qiblah-donation-amount" type="number" min="1" max="10000" step="0.01" value="10" inputmode="decimal" required><span>GBP</span></div>' +
      '<button class="qiblah-donation-submit" disabled>Continue to Stripe</button></form>' +
      '<p class="qiblah-donation-status" role="status" aria-live="polite"></p><p class="qiblah-donation-note">Secure checkout &middot; No platform fee</p>';
    document.body.appendChild(dialog);
    submit = dialog.querySelector('.qiblah-donation-submit');
    amount = dialog.querySelector('input');
    status = dialog.querySelector('[role=status]');
    dialog.querySelector('.qiblah-donation-close').onclick = function () { dialog.close(); };
    dialog.addEventListener('close', function () { requestNumber++; if (opener) opener.focus(); });
    dialog.addEventListener('click', function (event) { if (event.target === dialog) { var r=dialog.getBoundingClientRect(); if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close(); } });
    function syncAmount() {
      checkoutKey = null;
      dialog.querySelectorAll('[data-amount]').forEach(function (button) { button.setAttribute('aria-pressed', String(Number(button.dataset.amount) === Number(amount.value))); });
      submit.disabled = !ready || !amount.checkValidity();
    }
    amount.oninput = syncAmount;
    dialog.querySelectorAll('[data-amount]').forEach(function (button) { button.onclick=function(){amount.value=button.dataset.amount;syncAmount();}; });
    dialog.querySelector('form').onsubmit = async function (event) {
      event.preventDefault();
      if (!ready || !amount.reportValidity()) return;
      var current = requestNumber;
      submit.disabled = true;status.textContent = 'Opening Stripe test checkout...';
      checkoutKey = checkoutKey || 'qiblah-demo-' + crypto.randomUUID();
      try {
        var data = await api('/api/stripe/checkout', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mosque_id:mosque._id,amount:Number(amount.value),idempotency_key:checkoutKey})});
        if (current !== requestNumber) return;
        var url = new URL(data.url);
        if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com') throw new Error('Stripe returned an invalid checkout link.');
        window.location.assign(url.href);
      } catch (error) { if(current===requestNumber){status.textContent=error.message;submit.disabled=false;} }
    };
  }
  async function api(url, options) {
    var response = await fetch(url, options);
    var data;
    try { data=await response.json(); } catch (_) { throw new Error('The Stripe server is unavailable. No payment has been taken.'); }
    if (!response.ok) throw new Error(data.error || 'Stripe test checkout is unavailable.');
    return data;
  }
  window.QiblahDonations = {open: async function (value) {
    if (!value || value._slug !== 'qiblah-demo-mosque') return;
    init();mosque=value;ready=false;checkoutKey=null;amount.value='10';opener=document.activeElement;
    dialog.querySelector('#qiblah-donation-title').textContent='Support '+value.name;
    dialog.querySelectorAll('[data-amount]').forEach(function(button){button.setAttribute('aria-pressed',String(button.dataset.amount==='10'));});
    submit.disabled=true;status.textContent='Checking Stripe test setup...';
    var current=++requestNumber;dialog.showModal();
    try {
      var data=await api('/api/stripe/status?mosque_id='+encodeURIComponent(value._id));
      if(current!==requestNumber)return;
      ready=data.ready===true && data.test_mode===true;
      status.textContent=ready?'Stripe sandbox ready. Test cards only.':data.reason||'Stripe test setup is incomplete.';
      submit.disabled=!ready || !amount.checkValidity();
    } catch(error){if(current===requestNumber)status.textContent=error.message;}
  }};
})();
