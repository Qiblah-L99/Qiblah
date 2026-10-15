(function () {
  var dialog, mosque, submit, amount, status, ready=false, version=0, key, opener, checkout, loading;
  function destroy(){if(checkout){checkout.destroy();checkout=null;}}
  async function api(url,options){
    var response=await fetch(url,options),data;
    try{data=await response.json();}catch(_){throw new Error('The payment server is unavailable. Please try again.');}
    if(!response.ok)throw new Error(data.error||'Test checkout is unavailable.');
    return data;
  }
  function loadStripe(){
    if(window.Stripe)return Promise.resolve();
    if(!loading)loading=new Promise(function(resolve,reject){
      var script=document.createElement('script');script.src='https://js.stripe.com/v3/';
      script.onload=resolve;script.onerror=function(){script.remove();loading=null;reject(new Error('Stripe could not load. Please try again.'));};
      document.head.appendChild(script);
    });
    return loading;
  }
  async function confirm(data,current){
    if(current!==version)return;
    status.textContent='Confirming your test donation...';
    try{
      for(var i=0;i<6;i++){
        var result=await api('/api/stripe/checkout-result',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mosque_id:mosque._id,session_id:data.id,client_secret:data.client_secret})});
        if(current!==version)return;
        if(result.test_mode!==true)throw new Error('Invalid test confirmation.');
        if(result.payment_status==='paid'){
          destroy();dialog.querySelector('.qiblah-embedded-checkout').hidden=true;
          status.textContent=result.recorded?'Thank you. Your test donation is confirmed. No real money was collected.':'Stripe confirmed your test payment. Qiblah is still recording it; no real money was collected.';
          if(result.recorded||i===5)return;
        }else{status.textContent=result.checkout_status==='complete'?'Your test payment is processing. It is not confirmed yet.':'Your test donation is not complete.';return;}
        await new Promise(function(resolve){setTimeout(resolve,1000);});if(current!==version)return;
      }
    }catch(_){if(current===version)status.textContent='We could not confirm payment status. Please do not pay again.';}
  }
  function fields(disabled){dialog.querySelectorAll('form input,form button').forEach(function(el){el.disabled=disabled;});}
  function init(){
    if(dialog)return;
    dialog=document.createElement('dialog');dialog.className='qiblah-donation';dialog.setAttribute('aria-labelledby','qiblah-donation-title');
    dialog.innerHTML='<button class="qiblah-donation-close" type="button" aria-label="Close donation">&times;</button><h2 id="qiblah-donation-title"></h2><p>Sandbox test donation. No real money is collected.</p><form><div class="qiblah-donation-presets" role="group" aria-label="Donation amount"><button type="button" data-amount="5" aria-pressed="false">&pound;5</button><button type="button" data-amount="10" aria-pressed="true">&pound;10</button><button type="button" data-amount="20" aria-pressed="false">&pound;20</button></div><label for="qiblah-donation-amount">Amount</label><div class="qiblah-donation-money"><span>&pound;</span><input id="qiblah-donation-amount" type="number" min="1" max="10000" step="0.01" value="10" inputmode="decimal" required><span>GBP</span></div><button class="qiblah-donation-submit" disabled>Continue</button></form><div class="qiblah-embedded-checkout" hidden></div><p class="qiblah-donation-status" role="status" aria-live="polite"></p><p class="qiblah-donation-note">Secure checkout &middot; No platform fee</p>';
    document.body.appendChild(dialog);submit=dialog.querySelector('.qiblah-donation-submit');amount=dialog.querySelector('input');status=dialog.querySelector('[role=status]');
    dialog.querySelector('.qiblah-donation-close').onclick=function(){dialog.close();};
    dialog.addEventListener('close',function(){version++;destroy();if(opener)opener.focus();});
    dialog.addEventListener('click',function(event){if(event.target===dialog){var r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
    function sync(){key=null;dialog.querySelectorAll('[data-amount]').forEach(function(button){button.setAttribute('aria-pressed',String(Number(button.dataset.amount)===Number(amount.value)));});submit.disabled=!ready||!amount.checkValidity();}
    amount.oninput=sync;
    dialog.querySelectorAll('[data-amount]').forEach(function(button){button.onclick=function(){amount.value=button.dataset.amount;sync();};});
    dialog.querySelector('form').onsubmit=async function(event){
      event.preventDefault();if(!ready||submit.disabled||!amount.reportValidity())return;
      var current=version;fields(true);status.textContent='Loading secure test checkout...';key=key||'qiblah-demo-'+crypto.randomUUID();
      try{
        await loadStripe();if(current!==version)return;
        var data=await api('/api/stripe/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mosque_id:mosque._id,amount:Number(amount.value),idempotency_key:key,ui_mode:'embedded'})});
        if(current!==version)return;
        if(data.test_mode!==true||!/^pk_test_/.test(data.publishable_key||'')||!/^acct_/.test(data.stripe_account_id||'')||!data.client_secret)throw new Error('Embedded test checkout is not ready.');
        var instance=await window.Stripe(data.publishable_key,{stripeAccount:data.stripe_account_id}).initEmbeddedCheckout({clientSecret:data.client_secret,onComplete:function(){confirm(data,current);}});
        if(current!==version){instance.destroy();return;}
        checkout=instance;dialog.classList.add('is-checkout');dialog.querySelector('form').hidden=true;
        var container=dialog.querySelector('.qiblah-embedded-checkout');container.hidden=false;checkout.mount(container);status.textContent='';
      }catch(error){if(current===version){destroy();dialog.querySelector('form').hidden=false;dialog.querySelector('.qiblah-embedded-checkout').hidden=true;dialog.classList.remove('is-checkout');status.textContent=error.message;fields(false);}}
    };
  }
  window.QiblahDonations={open:async function(value){
    if(!value||value._slug!=='qiblah-demo-mosque')return;
    init();destroy();mosque=value;ready=false;key=null;amount.value='10';opener=document.activeElement;
    dialog.classList.remove('is-checkout');dialog.querySelector('form').hidden=false;dialog.querySelector('.qiblah-embedded-checkout').hidden=true;fields(false);
    dialog.querySelector('#qiblah-donation-title').textContent='Support '+value.name;
    dialog.querySelectorAll('[data-amount]').forEach(function(button){button.setAttribute('aria-pressed',String(button.dataset.amount==='10'));});
    submit.disabled=true;status.textContent='Checking Stripe test setup...';var current=++version;if(!dialog.open)dialog.showModal();
    try{var data=await api('/api/stripe/status?mosque_id='+encodeURIComponent(value._id));if(current!==version)return;ready=data.ready===true&&data.test_mode===true;status.textContent=ready?'Stripe sandbox ready. Test cards only.':data.reason||'Stripe test setup is incomplete.';submit.disabled=!ready||!amount.checkValidity();}
    catch(error){if(current===version)status.textContent=error.message;}
  }};
})();
