var SB = 'https://bfevwoykvnogmgxdkxdj.supabase.co';
var KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJmZXZ3b3lrdm5vZ21neGRreGRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNDgwNjEsImV4cCI6MjA5MTcyNDA2MX0.8I--P9h_jYsSlvkthF76O1m0mcFkgI8mcRmKVgXOHAk';

var PNAMES = ['fajr', 'zuhr', 'asr', 'maghrib', 'isha'];
var PLABELS = { fajr: 'Fajr', zuhr: 'Zuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha' };
var currentMosque = null;
var currentAdminId = null;
var currentData = { services: [], announcements: [], times: {} };
var csvRows = [];
var editingAnnouncementId = null;
var editingAnnouncementIndex = -1;

function sbFetch(path, opts) {
  opts = opts || {};
  var method = opts.method || 'GET';
  var headers = {
    apikey: KEY,
    Authorization: 'Bearer ' + KEY,
    'Content-Type': 'application/json'
  };
  if (method !== 'GET') headers.Prefer = 'return=representation';
  return fetch(SB + '/rest/v1/' + path, Object.assign({}, opts, {
    headers: Object.assign(headers, opts.headers || {})
  })).then(function(r) {
    if (!r.ok) {
      return r.text().then(function(t) {
        throw new Error(t || r.statusText);
      });
    }
    if (r.status === 204) return null;
    return r.text().then(function(t) { return t ? JSON.parse(t) : null; });
  });
}

function byId(id) { return document.getElementById(id); }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
    return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
  });
}
function todayISO() { return dateISO(new Date()); }
function dateISO(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function showLoginError(msg) {
  var el = byId('login-error');
  el.textContent = msg;
  el.style.display = 'block';
}
function showSaveStatus(msg, ok) {
  var el = byId('save-status');
  el.style.display = 'flex';
  el.textContent = msg;
  el.style.color = ok ? '#6ee7b7' : 'var(--gold)';
  if (ok) setTimeout(function() { el.style.display = 'none'; }, 2500);
}
function normaliseTime(s) {
  if (!s) return '';
  s = String(s).trim();
  var ap = s.match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (ap) {
    var h = Number(ap[1]);
    if (ap[3].toUpperCase() === 'PM' && h !== 12) h += 12;
    if (ap[3].toUpperCase() === 'AM' && h === 12) h = 0;
    return String(h).padStart(2, '0') + ':' + ap[2];
  }
  var m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  return m ? String(Number(m[1])).padStart(2, '0') + ':' + m[2] : s;
}

function doLogin() {
  var slug = byId('mosque-id-input').value.trim().toLowerCase();
  var pin = byId('pin-input').value.trim();
  byId('login-error').style.display = 'none';
  if (!slug || !pin) { showLoginError('Please enter your Mosque ID and PIN.'); return; }
  showLoginError('Checking...');

  sbFetch('mosques?slug=eq.' + encodeURIComponent(slug) + '&select=id,slug,name,address,area,borough,jummah,phone,website,email,about,facilities,mosque_admins(id,pin_hash)')
    .then(function(rows) {
      if (!rows || !rows.length) throw new Error('Mosque ID not found.');
      var mosque = rows[0];
      var admins = mosque.mosque_admins || [];
      var admin = admins.find(function(a) { return a.pin_hash === pin; });
      if (!admin) throw new Error('Incorrect PIN.');
      currentAdminId = admin.id;
      currentMosque = mosque;
      delete currentMosque.mosque_admins;
      loadDashboard();
    })
    .catch(function(err) {
      showLoginError((err.message || 'Login failed') + ' Contact admin@qiblah.app if you need access.');
    });
}

function loadDashboard() {
  byId('login-screen').style.display = 'none';
  byId('header').style.display = 'block';
  byId('dashboard').style.display = 'block';
  byId('header-mosque-name').textContent = currentMosque.name || '';
  byId('dash-mosque-title').textContent = currentMosque.name || '';
  byId('dash-mosque-address').textContent = currentMosque.address || '';
  byId('today-date-label').textContent = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  renderProfile();
  renderPrayerRows();
  loadFromSupabase();
  renderEmbed();
}

function loadFromSupabase() {
  showSaveStatus('Loading...', false);
  var mid = currentMosque.id;
  Promise.all([
    sbFetch('services?mosque_id=eq.' + mid + '&select=*&order=name'),
    sbFetch('announcements?mosque_id=eq.' + mid + '&select=*&order=created_at.desc'),
    sbFetch('prayer_timetables?mosque_id=eq.' + mid + '&select=*&order=date')
  ]).then(function(results) {
    currentData.services = results[0] || [];
    currentData.announcements = results[1] || [];
    currentData.times = {};
    (results[2] || []).forEach(function(row) { currentData.times[row.date] = row; });
    renderPrayerRows();
    renderMonthTable();
    renderYearlyOverview();
    renderServices();
    renderAnnouncements();
    showSaveStatus('Loaded', true);
  }).catch(function(err) {
    showSaveStatus('Could not load data: ' + err.message.slice(0, 80), false);
  });
}

function switchTab(tab) {
  ['times', 'profile', 'services', 'announce', 'embed'].forEach(function(t) {
    byId('tab-' + t).style.display = t === tab ? 'block' : 'none';
  });
  document.querySelectorAll('.tab').forEach(function(btn, i) {
    btn.classList.toggle('active', ['times', 'profile', 'services', 'announce', 'embed'][i] === tab);
  });
}
function switchSubTab(tab) {
  ['today', 'monthly', 'upload', 'jummah'].forEach(function(t) {
    byId('subt-' + t).style.display = t === tab ? 'block' : 'none';
    byId('st-' + t).classList.toggle('active', t === tab);
  });
}

function renderPrayerRows() {
  var row = currentData.times[todayISO()] || {};
  byId('pt-rows').innerHTML = PNAMES.map(function(p) {
    return '<div class="pt-row">' +
      '<div class="pt-name">' + PLABELS[p] + '</div>' +
      '<input class="pt-cell" id="today-' + p + '-begins" value="' + esc(row[p + '_begins'] || '') + '" placeholder="HH:MM">' +
      '<input class="pt-cell" id="today-' + p + '-jamaah" value="' + esc(row[p + '_jamaah'] || '') + '" placeholder="HH:MM">' +
    '</div>';
  }).join('');
  byId('jummah-times-input').value = currentMosque.jummah || '';
}

function buildTimePayload(date) {
  var payload = { mosque_id: currentMosque.id, date: date };
  PNAMES.forEach(function(p) {
    payload[p + '_begins'] = normaliseTime(byId('today-' + p + '-begins').value);
    payload[p + '_jamaah'] = normaliseTime(byId('today-' + p + '-jamaah').value);
  });
  return payload;
}
function replaceTimetableRows(rows) {
  if (!rows.length) return Promise.resolve();
  var dates = rows.map(function(r) { return r.date; });
  return sbFetch('prayer_timetables?mosque_id=eq.' + currentMosque.id + '&date=in.(' + dates.join(',') + ')', { method: 'DELETE' })
    .then(function() { return sbFetch('prayer_timetables', { method: 'POST', body: JSON.stringify(rows) }); });
}
function saveTodayTimes() {
  var row = buildTimePayload(todayISO());
  showSaveStatus('Saving today...', false);
  replaceTimetableRows([row]).then(function(saved) {
    currentData.times[row.date] = saved && saved[0] ? saved[0] : row;
    showSaveStatus('Today saved', true);
  }).catch(function(err) { showSaveStatus('Save failed: ' + err.message.slice(0, 80), false); });
}

function renderMonthTable() {
  var month = Number(byId('month-select').value);
  var year = Number(byId('year-select').value);
  var days = new Date(year, month + 1, 0).getDate();
  byId('month-thead').innerHTML = '<tr><th class="mt-head">Date</th>' + PNAMES.map(function(p) {
    return '<th class="mt-head">' + PLABELS[p] + ' Begins</th><th class="mt-head">' + PLABELS[p] + ' Jamaah</th>';
  }).join('') + '</tr>';
  var html = '';
  for (var d = 1; d <= days; d++) {
    var date = dateISO(new Date(year, month, d));
    var row = currentData.times[date] || {};
    html += '<tr class="mt-row"><td class="mt-date">' + d + '</td>' + PNAMES.map(function(p) {
      return '<td><input class="mt-cell" data-date="' + date + '" data-field="' + p + '_begins" value="' + esc(row[p + '_begins'] || '') + '"></td>' +
        '<td><input class="mt-cell" data-date="' + date + '" data-field="' + p + '_jamaah" value="' + esc(row[p + '_jamaah'] || '') + '"></td>';
    }).join('') + '</tr>';
  }
  byId('month-tbody').innerHTML = html;
}
function saveMonthTable() {
  var byDate = {};
  document.querySelectorAll('#month-tbody .mt-cell').forEach(function(input) {
    var date = input.dataset.date;
    if (!byDate[date]) byDate[date] = { mosque_id: currentMosque.id, date: date };
    byDate[date][input.dataset.field] = normaliseTime(input.value);
  });
  var rows = Object.keys(byDate).map(function(k) { return byDate[k]; });
  showSaveStatus('Saving month...', false);
  replaceTimetableRows(rows).then(function(saved) {
    rows.forEach(function(r, i) { currentData.times[r.date] = saved && saved[i] ? saved[i] : r; });
    renderYearlyOverview();
    showSaveStatus('Month saved', true);
  }).catch(function(err) { showSaveStatus('Save failed: ' + err.message.slice(0, 80), false); });
}
function copyFromPrevMonth() {
  var month = Number(byId('month-select').value);
  var year = Number(byId('year-select').value);
  var prev = new Date(year, month - 1, 1);
  document.querySelectorAll('#month-tbody .mt-cell').forEach(function(input) {
    var date = new Date(input.dataset.date + 'T00:00:00');
    var srcDate = dateISO(new Date(prev.getFullYear(), prev.getMonth(), date.getDate()));
    var src = currentData.times[srcDate];
    if (src && src[input.dataset.field]) input.value = src[input.dataset.field];
  });
}
function renderYearlyOverview() {
  var counts = {};
  Object.keys(currentData.times).forEach(function(date) {
    var y = date.slice(0, 4), m = date.slice(5, 7);
    var key = y + '-' + m;
    counts[key] = (counts[key] || 0) + 1;
  });
  var year = Number(byId('year-select').value);
  byId('yearly-overview').innerHTML = Array.from({ length: 12 }, function(_, i) {
    var key = year + '-' + String(i + 1).padStart(2, '0');
    var total = new Date(year, i + 1, 0).getDate();
    var count = counts[key] || 0;
    return '<div class="yr-month ' + (count >= total ? 'complete' : 'empty') + '"><span>' +
      new Date(year, i, 1).toLocaleDateString('en-GB', { month: 'long' }) + '</span><span>' + count + '/' + total + ' days</span></div>';
  }).join('');
}

function parseCSV(text) {
  var rows = [];
  var row = [], cell = '', q = false;
  for (var i = 0; i < text.length; i++) {
    var ch = text[i], next = text[i + 1];
    if (ch === '"' && q && next === '"') { cell += '"'; i++; }
    else if (ch === '"') q = !q;
    else if (ch === ',' && !q) { row.push(cell); cell = ''; }
    else if ((ch === '\n' || ch === '\r') && !q) {
      if (ch === '\r' && next === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(function(r) { return r.some(function(c) { return c.trim(); }); });
}
function parseUkDate(s) {
  var m = String(s || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return '';
  return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
}
function handleCSVUpload(e) {
  var file = e.target.files[0];
  if (!file) return;
  file.text().then(function(text) {
    var rows = parseCSV(text);
    var head = rows.shift().map(function(h) { return h.trim().toLowerCase(); });
    function col(name) { return head.indexOf(name.toLowerCase()); }
    var required = ['Date', 'Fajr Begins', 'Fajr Jamaah', 'Zuhr Begins', 'Zuhr Jamaah', 'Asr Begins', 'Asr Jamaah', 'Maghrib Begins', 'Maghrib Jamaah', 'Isha Begins', 'Isha Jamaah'];
    var missing = required.filter(function(h) { return col(h) === -1; });
    if (missing.length) { byId('csv-error').textContent = 'Missing columns: ' + missing.join(', '); byId('csv-error').style.display = 'block'; return; }
    byId('csv-error').style.display = 'none';
    csvRows = rows.map(function(r) {
      return {
        mosque_id: currentMosque.id,
        date: parseUkDate(r[col('Date')]),
        fajr_begins: normaliseTime(r[col('Fajr Begins')]),
        fajr_jamaah: normaliseTime(r[col('Fajr Jamaah')]),
        zuhr_begins: normaliseTime(r[col('Zuhr Begins')]),
        zuhr_jamaah: normaliseTime(r[col('Zuhr Jamaah')]),
        asr_begins: normaliseTime(r[col('Asr Begins')]),
        asr_jamaah: normaliseTime(r[col('Asr Jamaah')]),
        maghrib_begins: normaliseTime(r[col('Maghrib Begins')]),
        maghrib_jamaah: normaliseTime(r[col('Maghrib Jamaah')]),
        isha_begins: normaliseTime(r[col('Isha Begins')]),
        isha_jamaah: normaliseTime(r[col('Isha Jamaah')])
      };
    }).filter(function(r) { return r.date; });
    byId('csv-preview').style.display = 'block';
    byId('csv-preview-label').textContent = csvRows.length + ' rows ready';
    byId('csv-preview-table').innerHTML = '<tr>' + required.map(function(h) { return '<th class="csv-head">' + h + '</th>'; }).join('') + '</tr>' +
      csvRows.slice(0, 8).map(function(r) {
        return '<tr><td class="csv-cell">' + r.date + '</td><td class="csv-cell">' + r.fajr_begins + '</td><td class="csv-cell">' + r.fajr_jamaah + '</td><td class="csv-cell">' + r.zuhr_begins + '</td><td class="csv-cell">' + r.zuhr_jamaah + '</td><td class="csv-cell">' + r.asr_begins + '</td><td class="csv-cell">' + r.asr_jamaah + '</td><td class="csv-cell">' + r.maghrib_begins + '</td><td class="csv-cell">' + r.maghrib_jamaah + '</td><td class="csv-cell">' + r.isha_begins + '</td><td class="csv-cell">' + r.isha_jamaah + '</td></tr>';
      }).join('');
  });
}
function saveCSVData() {
  if (!csvRows.length) return;
  showSaveStatus('Saving CSV...', false);
  replaceTimetableRows(csvRows).then(function(saved) {
    csvRows.forEach(function(r, i) { currentData.times[r.date] = saved && saved[i] ? saved[i] : r; });
    renderMonthTable();
    renderYearlyOverview();
    showSaveStatus('CSV timetable saved', true);
  }).catch(function(err) { showSaveStatus('CSV save failed: ' + err.message.slice(0, 80), false); });
}
function downloadTemplate() {
  var headers = 'Date,Fajr Begins,Fajr Jamaah,Zuhr Begins,Zuhr Jamaah,Asr Begins,Asr Jamaah,Maghrib Begins,Maghrib Jamaah,Isha Begins,Isha Jamaah\n';
  var blob = new Blob([headers + '01/01/2026,06:15,06:45,12:10,13:15,14:30,15:00,16:05,16:10,18:15,19:30\n'], { type: 'text/csv' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'qiblah-timetable-template.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}
function clearAllPrayerTimes() {
  if (!confirm('Delete all prayer times for this mosque?')) return;
  showSaveStatus('Deleting prayer times...', false);
  sbFetch('prayer_timetables?mosque_id=eq.' + currentMosque.id, { method: 'DELETE' })
    .then(function() { currentData.times = {}; renderPrayerRows(); renderMonthTable(); renderYearlyOverview(); showSaveStatus('Prayer times deleted', true); })
    .catch(function(err) { showSaveStatus('Delete failed: ' + err.message.slice(0, 80), false); });
}

function renderProfile() {
  byId('profile-name').value = currentMosque.name || '';
  byId('profile-address').value = currentMosque.address || '';
  byId('profile-phone').value = currentMosque.phone || '';
  byId('profile-website').value = currentMosque.website || '';
  byId('profile-email').value = currentMosque.email || '';
  byId('profile-about').value = currentMosque.about || '';
  byId('profile-facilities').value = Array.isArray(currentMosque.facilities) ? currentMosque.facilities.join(', ') : (currentMosque.facilities || '');
  byId('jummah-times-input').value = currentMosque.jummah || '';
}
function saveProfile() {
  var payload = {
    name: byId('profile-name').value.trim(),
    address: byId('profile-address').value.trim(),
    phone: byId('profile-phone').value.trim(),
    website: byId('profile-website').value.trim(),
    email: byId('profile-email').value.trim(),
    about: byId('profile-about').value.trim(),
    facilities: byId('profile-facilities').value.split(',').map(function(s) { return s.trim(); }).filter(Boolean)
  };
  showSaveStatus('Saving profile...', false);
  sbFetch('mosques?id=eq.' + currentMosque.id, { method: 'PATCH', body: JSON.stringify(payload) })
    .then(function(rows) {
      Object.assign(currentMosque, rows && rows[0] ? rows[0] : payload);
      byId('header-mosque-name').textContent = currentMosque.name || '';
      byId('dash-mosque-title').textContent = currentMosque.name || '';
      byId('dash-mosque-address').textContent = currentMosque.address || '';
      renderEmbed();
      showSaveStatus('Profile saved', true);
    }).catch(function(err) { showSaveStatus('Profile save failed: ' + err.message.slice(0, 80), false); });
}
function saveJummah() {
  var payload = { jummah: byId('jummah-times-input').value.trim() };
  showSaveStatus('Saving Jummah...', false);
  sbFetch('mosques?id=eq.' + currentMosque.id, { method: 'PATCH', body: JSON.stringify(payload) })
    .then(function(rows) { currentMosque.jummah = rows && rows[0] ? rows[0].jummah : payload.jummah; showSaveStatus('Jummah saved', true); })
    .catch(function(err) { showSaveStatus('Jummah save failed: ' + err.message.slice(0, 80), false); });
}

function showAddService() { byId('add-service-form').style.display = 'block'; }
function renderServices() {
  var el = byId('services-list');
  if (!currentData.services.length) { el.innerHTML = '<p style="color:var(--text2);font-size:13px">No services yet.</p>'; return; }
  el.innerHTML = currentData.services.map(function(s, i) {
    var typeCls = 't-' + (s.type || 'Community').replace(/\s+/g, '');
    return '<div class="service-item"><div style="flex:1;min-width:0"><div class="sname">' + esc(s.name) +
      '<span class="type-badge ' + typeCls + '">' + esc(s.type || 'Community') + '</span></div><div class="smeta">' +
      esc([s.days, s.time].filter(Boolean).join(' · ')) + '</div></div><button class="del-btn" onclick="deleteService(' + i + ')">x</button></div>';
  }).join('');
}
function addService() {
  var name = byId('new-svc-name').value.trim();
  if (!name) { alert('Service name required'); return; }
  var payload = {
    mosque_id: currentMosque.id,
    name: name,
    type: byId('new-svc-type').value,
    days: byId('new-svc-days').value.trim(),
    time: byId('new-svc-time').value.trim()
  };
  sbFetch('services', { method: 'POST', body: JSON.stringify(payload) }).then(function(rows) {
    currentData.services.push(rows && rows[0] ? rows[0] : payload);
    ['new-svc-name', 'new-svc-days', 'new-svc-time'].forEach(function(id) { byId(id).value = ''; });
    byId('add-service-form').style.display = 'none';
    renderServices();
    showSaveStatus('Service added', true);
  }).catch(function(err) { showSaveStatus('Service save failed: ' + err.message.slice(0, 80), false); });
}
function deleteService(idx) {
  var s = currentData.services[idx];
  if (!s || !confirm('Delete "' + s.name + '"?')) return;
  sbFetch('services?id=eq.' + s.id, { method: 'DELETE' }).then(function() {
    currentData.services.splice(idx, 1);
    renderServices();
    showSaveStatus('Service deleted', true);
  }).catch(function(err) { showSaveStatus('Delete failed: ' + err.message.slice(0, 80), false); });
}

function showAddAnnouncement() {
  editingAnnouncementId = null;
  editingAnnouncementIndex = -1;
  byId('ann-submit-btn').textContent = 'Post';
  byId('add-ann-form').style.display = 'block';
  byId('add-ann-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function resetAnnForm() {
  editingAnnouncementId = null;
  editingAnnouncementIndex = -1;
  ['new-ann-title', 'new-ann-desc', 'new-ann-time', 'new-ann-order', 'new-ann-date', 'new-ann-weeks'].forEach(function(id) { byId(id).value = ''; });
  byId('new-ann-day').value = '';
  byId('new-ann-tag').value = 'Class';
  byId('new-ann-active').value = 'true';
  byId('ann-submit-btn').textContent = 'Post';
  byId('add-ann-form').style.display = 'none';
}
function renderAnnouncements() {
  var el = byId('announcements-list');
  if (!currentData.announcements.length) { el.innerHTML = '<p style="color:var(--text2);font-size:13px">No classes or events yet.</p>'; return; }
  el.innerHTML = currentData.announcements.map(function(a, i) {
    return '<div class="ann-item"><div class="ann-body"><div class="ann-title">' + esc(a.title) +
      '<span class="badge badge-' + String(a.tag || a.category || 'event').toLowerCase() + '">' + esc(a.tag || a.category || 'Event') + '</span>' +
      '<span class="badge ' + (isAnnouncementActive(a) ? 'badge-active' : 'badge-hidden') + '">' + (isAnnouncementActive(a) ? 'Active' : 'Hidden') + '</span></div>' +
      '<div class="ann-meta">' + esc([a.day, a.time, a.start_date || a.date].filter(Boolean).join(' · ')) + '</div>' +
      '<div class="ann-desc">' + esc(a.description || '') + '</div></div>' +
      '<button class="icon-btn text-btn" onclick="editAnnouncement(' + i + ')">Edit</button><button class="del-btn" onclick="deleteAnnouncement(' + i + ')">x</button></div>';
  }).join('');
}
function parseAdminDate(value) {
  var s = String(value || '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return s;
  return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
}
function formatAdminDate(value) {
  var s = String(value || '').trim();
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return s;
  return m[3] + '/' + m[2] + '/' + m[1];
}
function readAnnouncementPayload() {
  var title = byId('new-ann-title').value.trim();
  if (!title) { alert('Title required'); return null; }
  return {
    title: title,
    tag: byId('new-ann-tag').value,
    category: byId('new-ann-tag').value,
    description: byId('new-ann-desc').value.trim(),
    day: byId('new-ann-day').value || null,
    time: byId('new-ann-time').value || null,
    sort_order: byId('new-ann-order').value ? Number(byId('new-ann-order').value) : null,
    start_date: parseAdminDate(byId('new-ann-date').value),
    weeks: byId('new-ann-weeks').value ? Number(byId('new-ann-weeks').value) : null,
    active: byId('new-ann-active').value === 'true'
  };
}
function addAnnouncement() {
  var payload = readAnnouncementPayload();
  if (!payload) return;
  var dbPayload = Object.assign({}, payload);
  if (!editingAnnouncementId) dbPayload.mosque_id = currentMosque.id;
  var request = editingAnnouncementId
    ? sbFetch('announcements?id=eq.' + editingAnnouncementId, { method: 'PATCH', body: JSON.stringify(dbPayload) })
    : sbFetch('announcements', { method: 'POST', body: JSON.stringify(dbPayload) });
  request.then(function(rows) {
    var saved = rows && rows[0] ? rows[0] : Object.assign({ id: editingAnnouncementId }, dbPayload);
    if (editingAnnouncementId) {
      var idx = currentData.announcements.findIndex(function(a) { return a.id === editingAnnouncementId; });
      if (idx < 0) idx = editingAnnouncementIndex;
      if (idx >= 0) currentData.announcements[idx] = saved;
    } else currentData.announcements.unshift(saved);
    resetAnnForm();
    renderAnnouncements();
    showSaveStatus('Announcement saved', true);
  }).catch(function(err) { showSaveStatus('Announcement save failed: ' + err.message.slice(0, 80), false); });
}
function editAnnouncement(idx) {
  var a = currentData.announcements[idx];
  if (!a) return;
  editingAnnouncementId = a.id;
  editingAnnouncementIndex = idx;
  byId('new-ann-title').value = a.title || '';
  byId('new-ann-tag').value = a.tag || a.category || 'Event';
  byId('new-ann-desc').value = a.description || '';
  byId('new-ann-day').value = a.day || '';
  byId('new-ann-time').value = a.time || '';
  byId('new-ann-order').value = a.sort_order || '';
  byId('new-ann-date').value = formatAdminDate(a.start_date || a.date || '');
  byId('new-ann-weeks').value = a.weeks || '';
  byId('new-ann-active').value = isAnnouncementActive(a) ? 'true' : 'false';
  byId('ann-submit-btn').textContent = 'Save';
  byId('add-ann-form').style.display = 'block';
  byId('add-ann-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function isAnnouncementActive(a) {
  if (a && a.active === false) return false;
  if (a && a.is_active === false) return false;
  return true;
}
function deleteAnnouncement(idx) {
  var a = currentData.announcements[idx];
  if (!a || !confirm('Delete this item?')) return;
  sbFetch('announcements?id=eq.' + a.id, { method: 'DELETE' }).then(function() {
    currentData.announcements.splice(idx, 1);
    renderAnnouncements();
    showSaveStatus('Announcement deleted', true);
  }).catch(function(err) { showSaveStatus('Delete failed: ' + err.message.slice(0, 80), false); });
}

function renderEmbed() {
  var slug = currentMosque && currentMosque.slug ? currentMosque.slug : '';
  var displayUrl = new URL('../display.html', location.href);
  displayUrl.searchParams.set('mosque', slug);
  var url = displayUrl.href;
  byId('ep-name').textContent = currentMosque.name || 'Mosque';
  byId('ep-area').textContent = currentMosque.area || '';
  var today = currentData.times[todayISO()] || {};
  byId('ep-grid').innerHTML = PNAMES.map(function(p, i) {
    return '<div style="padding:11px 4px;text-align:center' + (i < PNAMES.length - 1 ? ';border-right:1px solid rgba(255,255,255,0.06)' : '') + '"><div style="font-size:9px;font-weight:700;text-transform:uppercase;color:rgba(238,235,229,0.5);margin-bottom:4px">' + PLABELS[p] + '</div><div style="font-size:12px;font-weight:500;color:#eeebe5">' + esc(today[p + '_jamaah'] || '--') + '</div></div>';
  }).join('');
  byId('embed-code-block').textContent = '<iframe src="' + url + '" style="width:100%;min-height:620px;border:0" loading="lazy"></iframe>';
}
function doLogout() {
  currentMosque = null;
  currentAdminId = null;
  byId('login-screen').style.display = 'flex';
  byId('header').style.display = 'none';
  byId('dashboard').style.display = 'none';
  byId('mosque-id-input').value = '';
  byId('pin-input').value = '';
  byId('login-error').style.display = 'none';
}

document.addEventListener('DOMContentLoaded', function() {
  byId('pin-input').addEventListener('keydown', function(e) { if (e.key === 'Enter') doLogin(); });
  byId('mosque-id-input').addEventListener('keydown', function(e) { if (e.key === 'Enter') doLogin(); });
  byId('month-select').value = String(new Date().getMonth());
  byId('year-select').value = String(new Date().getFullYear());
  byId('embed-copy-btn').addEventListener('click', function() {
    navigator.clipboard.writeText(byId('embed-code-block').textContent);
    showSaveStatus('Embed code copied', true);
  });
});
