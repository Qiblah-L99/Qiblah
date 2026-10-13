(function () {
  'use strict';
  var SB = 'https://bfevwoykvnogmgxdkxdj.supabase.co';
  var KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJmZXZ3b3lrdm5vZ21neGRreGRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNDgwNjEsImV4cCI6MjA5MTcyNDA2MX0.8I--P9h_jYsSlvkthF76O1m0mcFkgI8mcRmKVgXOHAk';
  var DRAFT_KEY = 'qiblah_onboarding_request_v1';
  var directory = null, directoryPromise = null, selected = null, mode = 'existing', busy = false, request = null, verifiedSession = null, authClient = null;
  var searchVersion = 0, searchTimer, resendAt = 0;
  function el(id) { return document.getElementById(id); }
  function path(name) {
    var paths = { home: '/', portal: '/mosque/', terms: '/mosque-admin-terms/', privacy: '/privacy/' };
    var files = { home: '../index.html', portal: '../mosque/index.html', terms: '../mosque-admin-terms/index.html', privacy: '../privacy/index.html' };
    return location.protocol === 'file:' ? files[name] : paths[name];
  }
  document.querySelectorAll('[data-path]').forEach(function (link) { link.href = path(link.dataset.path); });
  function status(message, info) {
    el('status').textContent = message || '';
    el('status').hidden = !message;
    el('status').className = info ? 'status info' : 'status';
  }
  function step(name) {
    ['find', 'details', 'confirm'].forEach(function (s, i) {
      el(s + '-step').hidden = s !== name;
      var item = document.querySelectorAll('.progress li')[i];
      if (s === name) item.setAttribute('aria-current', 'step'); else item.removeAttribute('aria-current');
    });
    status('');
    el(name === 'find' ? 'find-title' : name + '-title').focus();
  }
  function api(resource, options, session) {
    options = options || {};
    return fetch(SB + '/rest/v1/' + resource, Object.assign({}, options, { headers: {
      apikey: KEY, Authorization: 'Bearer ' + (session ? session.access_token : KEY),
      'Content-Type': 'application/json', Prefer: options.prefer || 'return=representation'
    } })).then(async function (response) {
      if (!response.ok) {
        var error = new Error('Your request could not be saved. Please try again or contact info@qiblah.co.uk.');
        error.status = response.status; throw error;
      }
      var text = await response.text();
      return text ? JSON.parse(text) : null;
    });
  }
  function loadDirectory() {
    if (directory) return Promise.resolve(directory);
    if (directoryPromise) return directoryPromise;
    var rows = [];
    function page(offset) {
      return api('mosques?select=id,name,slug,address,area&is_hidden=not.is.true&order=name,id&limit=1000&offset=' + offset).then(function (batch) {
        rows = rows.concat(batch || []);
        if (batch && batch.length === 1000) return page(offset + 1000);
        directory = rows; return directory;
      });
    }
    directoryPromise = page(0).finally(function () { directoryPromise = null; });
    return directoryPromise;
  }
  function normalise(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function resultButton(mosque) {
    var button = document.createElement('button'); button.type = 'button'; button.className = 'result';
    var name = document.createElement('strong'); name.textContent = mosque.name;
    var address = document.createElement('span'); address.textContent = [mosque.address, mosque.area].filter(Boolean).join(', ');
    button.append(name, address); button.addEventListener('click', function () { choose(mosque); }); return button;
  }
  function search(event) {
    if (event) event.preventDefault();
    var query = el('mosque-search').value.trim(), version = ++searchVersion;
    el('results').replaceChildren(); el('new-entry').hidden = true; el('retry-search').hidden = true;
    if (query.length < 2) { el('search-state').textContent = 'Enter a mosque name or postcode.'; return; }
    el('search-state').textContent = 'Searching mosques...';
    loadDirectory().then(function (rows) {
      if (version !== searchVersion) return;
      var tokens = query.toLowerCase().split(/\s+/).filter(Boolean), compact = normalise(query);
      var matches = rows.filter(function (m) {
        var text = [m.name, m.address, m.area, m.slug].filter(Boolean).join(' ').toLowerCase();
        return tokens.every(function (word) { return text.indexOf(word) !== -1; }) || normalise(text).indexOf(compact) !== -1;
      });
      matches.slice(0, 20).forEach(function (m) { el('results').appendChild(resultButton(m)); });
      el('search-state').textContent = matches.length ? (matches.length > 20 ? 'Showing 20 matches. Add a postcode to narrow your search.' : 'Select your mosque to request access.') : 'No matching mosque found.';
      el('new-entry').hidden = false;
    }).catch(function () {
      if (version !== searchVersion) return;
      el('search-state').textContent = 'We could not check existing listings. Please retry before adding a mosque.';
      el('retry-search').hidden = false;
    });
  }
  function choose(mosque) {
    selected = mosque; mode = mosque ? 'existing' : 'new';
    el('new-fields').hidden = mode !== 'new';
    ['new-name', 'new-address'].forEach(function (id) { el(id).required = mode === 'new'; el(id).disabled = mode !== 'new'; });
    el('selected-name').textContent = mosque ? mosque.name : 'New mosque listing';
    el('selected-address').textContent = mosque ? [mosque.address, mosque.area].filter(Boolean).join(', ') : 'Your mosque will be reviewed before appearing publicly.';
    el('submit-request').textContent = mosque ? 'Request access to this mosque' : 'Send mosque details for review';
    el('request-hint').textContent = mosque ? 'We will verify your email before reviewing access.' : 'Prayer times and other details can be added after approval.';
    if (!mosque && !el('new-name').value) {
      var query = el('mosque-search').value.trim();
      if (!/^[a-z]{1,2}\d/i.test(query)) el('new-name').value = query;
    }
    step('details');
  }
  function collect() {
    return { mode:mode, mosque_id:selected && selected.id, mosque_name: mode === 'existing' ? selected.name : el('new-name').value.trim(),
      address:mode === 'existing' ? selected.address : el('new-address').value.trim(),
      contact_name:el('contact-name').value.trim(), role_title:el('contact-role').value,
      email:el('contact-email').value.trim().toLowerCase(), phone:el('contact-phone').value.trim(), authorised:el('authorised').checked, at:Date.now() };
  }
  function validDraft(draft) {
    return draft && draft.mode === 'existing' && draft.mosque_id && draft.contact_name && draft.role_title && draft.authorised === true &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email || '') && Date.now() - draft.at >= 0 && Date.now() - draft.at < 86400000;
  }
  function saveDraft(draft) {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch (error) { throw new Error('Please allow browser storage to keep your request while verifying your email.'); }
  }
  function readDraft() { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (error) { return null; } }
  function client() {
    if (!authClient) {
      if (!window.supabase) throw new Error('Email verification is still loading. Please refresh and try again.');
      authClient = window.supabase.createClient(SB, KEY, { auth:{persistSession:false, autoRefreshToken:false, detectSessionInUrl:true} });
    }
    return authClient;
  }
  function confirmation(title, copy, next, pendingEmail) {
    el('confirm-title').textContent = title; el('confirm-copy').textContent = copy; el('confirm-next').textContent = next;
    el('confirm-mosque').textContent = request.mosque_name; el('confirm-email').textContent = request.email;
    el('resend-link').hidden = !pendingEmail; el('edit-request').hidden = !pendingEmail; el('open-portal').hidden = pendingEmail;
    step('confirm');
  }
  function sendVerification() {
    saveDraft(request);
    var origin = location.protocol === 'https:' ? location.origin : 'https://qiblah.co.uk';
    var callback = new URL('/mosque/claim.html', origin);
    callback.searchParams.set('onboarding', '1'); callback.searchParams.set('mosque_id', request.mosque_id);
    return client().auth.signInWithOtp({email:request.email, options:{emailRedirectTo:callback.href, data:{onboarding_request:request}}}).then(function (result) {
      if (result.error) throw new Error(result.error.status === 429 ? 'Please wait a minute before requesting another email.' : 'We could not send the verification email. Please retry or contact info@qiblah.co.uk.');
      resendAt = Date.now() + 60000;
      confirmation('Check your email', 'Open the verification link we sent to finish your access request.', 'Check your spam folder too. Keep this browser available until verification is complete.', true);
    });
  }
  function claimForSession(session) {
    if (!validDraft(request) || !session || !session.user || String(session.user.email).toLowerCase() !== request.email) throw new Error('Please enter your details again using the verified email address.');
    var resource = 'mosque_claims?select=*&mosque_id=eq.' + encodeURIComponent(request.mosque_id) + '&user_id=eq.' + encodeURIComponent(session.user.id);
    return api(resource, {}, session).then(function (rows) {
      if (rows && rows[0]) return rows[0];
      return api('mosque_claims', {method:'POST', body:JSON.stringify({mosque_id:request.mosque_id, user_id:session.user.id, email:session.user.email,
        claimant_name:request.contact_name, role_title:request.role_title, phone:request.phone || '', note:'Applicant confirmed they are authorised to represent this mosque.'})}, session).then(function (claims) { return claims && claims[0]; }).catch(function (error) {
        if (error.status !== 409) throw error;
        return api(resource, {}, session).then(function (rows) { if (!rows || !rows[0]) throw error; return rows[0]; });
      });
    }).then(function (claim) {
      if (!claim) throw new Error('We could not confirm your request. Please contact info@qiblah.co.uk.');
      if (claim.status === 'rejected') {
        confirmation('Please contact Qiblah', 'This access request was not approved.', 'Email info@qiblah.co.uk so we can help verify your role.', false); return;
      }
      if (claim.status !== 'pending' && claim.status !== 'approved') throw new Error('We could not confirm the request status.');
      try { localStorage.removeItem(DRAFT_KEY); } catch (error) {}
      var approved = claim.status === 'approved';
      confirmation(approved ? 'Your access is approved' : 'Your request is received', approved ? 'You can now manage this mosque in the portal.' : 'Your email is verified and your access request is waiting for review.',
        approved ? 'Open the portal to add prayer times and Jumu\u0027ah times.' : 'We will verify your role before granting access. You can check your access using the mosque portal.', false);
      if (approved) el('open-portal').onclick = function (event) {
        event.preventDefault();
        // The existing portal consumes the auth fragment and removes it from the address bar.
        location.href = path('portal') + '#access_token=' + encodeURIComponent(session.access_token) + '&token_type=bearer&expires_in=' + Math.max(0, (session.expires_at || Math.floor(Date.now()/1000) + 3600) - Math.floor(Date.now()/1000));
      };
    });
  }
  async function newSignup() {
    // Check known listings again before sending a new listing for review.
    var rows = await loadDirectory();
    var duplicate = rows.find(function (m) { return normalise(m.name) === normalise(request.mosque_name) && normalise(m.address).indexOf(normalise(request.address)) !== -1; });
    if (duplicate) { choose(duplicate); status('This mosque is already listed. Request access to it instead.', true); return; }
    await api('mosque_signups', {method:'POST', prefer:'return=minimal', body:JSON.stringify({mosque_name:request.mosque_name, contact_name:request.contact_name, email:request.email, phone:request.phone || null, address:request.address, borough:null, area:null})});
    confirmation('Your mosque details are received', 'Your new mosque listing has been sent for review.', 'We will contact you about verification and access. Prayer times and profile details can be added after approval.', false);
    try {
      var response = await fetch(SB + '/functions/v1/signup-notify', {method:'POST', headers:{apikey:KEY, Authorization:'Bearer ' + KEY, 'Content-Type':'application/json'},
        body:JSON.stringify({mosque_name:request.mosque_name, contact_name:request.contact_name, email:request.email, phone:request.phone || null, address:request.address,
          account_created:false, verification_note:'Authorised representative: ' + request.role_title, source:'london-prayer-times-onboarding'})});
      var data = await response.json();
      if (response.ok && !data.skipped) el('confirm-next').textContent = 'Check your inbox for the confirmation. We will contact you about verification and access.';
    } catch (error) { /* The saved request remains successful if the notification service is unavailable. */ }
  }
  async function submit(event) {
    event.preventDefault(); if (busy || !el('request-form').reportValidity()) return;
    request = collect();
    if (!request.contact_name || !request.role_title || !request.authorised || !request.mosque_name || (mode === 'new' && !request.address)) { status('Please complete the required details.'); return; }
    busy = true; el('submit-request').disabled = true; status('');
    try {
      if (mode === 'new') await newSignup();
      else if (verifiedSession && String(verifiedSession.user.email).toLowerCase() === request.email) await claimForSession(verifiedSession);
      else await sendVerification();
    } catch (error) { status(error.message || 'Connection error. Please try again.'); }
    finally { busy = false; el('submit-request').disabled = false; }
  }
  async function resume() {
    var query = new URLSearchParams(location.search);
    var isCallback = query.get('onboarding') === '1' || /access_token=|error=|code=/.test(location.hash + location.search);
    if (!isCallback) {
      var selectedId = query.get('mosque_id');
      if (selectedId) {
        try {
          var listings = await loadDirectory(); var listing = listings.find(function (m) { return m.id === selectedId; });
          if (listing) choose(listing); else status('We could not find that mosque. Please search by name or postcode.');
        } catch (error) { status('We could not load that mosque. Please retry the search.'); }
      }
      return;
    }
    try {
      var result = await client().auth.getSession();
      if (result.error) throw result.error;
      verifiedSession = result.data && result.data.session;
      if (!verifiedSession) { status('The verification link has expired or could not be verified. Please request a new link.'); return; }
      if (history.replaceState) history.replaceState({}, '', location.pathname + location.search);
      var saved = readDraft(), metadata = verifiedSession.user.user_metadata || {};
      request = validDraft(saved) ? saved : metadata.onboarding_request;
      if (validDraft(request) && request.email === String(verifiedSession.user.email).toLowerCase() && (!query.get('mosque_id') || query.get('mosque_id') === request.mosque_id)) {
        await claimForSession(verifiedSession); return;
      }
      el('contact-email').value = verifiedSession.user.email;
      var mosqueId = query.get('mosque_id');
      if (mosqueId) {
        var rows = await loadDirectory(); var mosque = rows.find(function (m) { return m.id === mosqueId; });
        if (mosque) choose(mosque);
      }
      status('Your email is verified. Enter your contact details to finish your request.', true);
    } catch (error) { status('We could not finish verification. Please retry your request or contact info@qiblah.co.uk.'); }
  }
  el('search-form').addEventListener('submit', search);
  el('mosque-search').addEventListener('input', function () { clearTimeout(searchTimer); ++searchVersion; searchTimer = setTimeout(search, 250); });
  el('retry-search').addEventListener('click', search);
  el('add-new').addEventListener('click', function () { choose(null); });
  el('change-mosque').addEventListener('click', function () { if (!busy) step('find'); });
  el('edit-request').addEventListener('click', function () { if (!busy) step('details'); });
  el('request-form').addEventListener('submit', submit);
  el('resend-link').addEventListener('click', async function () {
    if (busy) return;
    if (Date.now() < resendAt) { status('Please wait a minute before requesting another email.', true); return; }
    busy = true; el('resend-link').disabled = true;
    try { await sendVerification(); } catch (error) { status(error.message); } finally { busy = false; el('resend-link').disabled = false; }
  });
  resume();
})();
