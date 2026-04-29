var SB = 'https://bfevwoykvnogmgxdkxdj.supabase.co';
var KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJmZXZ3b3lrdm5vZ21neGRreGRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNDgwNjEsImV4cCI6MjA5MTcyNDA2MX0.8I--P9h_jYsSlvkthF76O1m0mcFkgI8mcRmKVgXOHAk';

var PNAMES = ['fajr', 'zuhr', 'asr', 'maghrib', 'isha'];
var PLABELS = { fajr: 'Fajr', zuhr: 'Zuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha' };
var currentMosque = null;
var currentAdminId = null;
var currentData = { services: [], announcements: [], tickers: [], displayTheme: null, displayBlackout: null, asrOpinion: null, times: {} };
var csvRows = [];
var editingAnnouncementId = null;
var editingAnnouncementIndex = -1;
var editingServiceId = null;
var editingServiceIndex = -1;
var embedType = 'small';
var ADMIN_SESSION_KEY = 'qiblah_mosque_admin_session_v1';
var pendingProfileLogo = undefined;

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
function clearPublicAppCache() {
  try {
    localStorage.removeItem('qiblah_static_v1');
    localStorage.removeItem('qiblah_prayers_v1');
  } catch (e) {}
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
function normaliseSlugInput(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/^\/?(mosque|mosques|display|admin)\//, '')
    .replace(/[?#].*$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
function saveAdminSession(mosque, adminId) {
  try {
    localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify({
      slug: mosque && mosque.slug ? mosque.slug : '',
      adminId: adminId || null,
      savedAt: Date.now()
    }));
  } catch (e) {}
}
function clearAdminSession() {
  try {
    localStorage.removeItem(ADMIN_SESSION_KEY);
  } catch (e) {}
}
function readAdminSession() {
  try {
    return JSON.parse(localStorage.getItem(ADMIN_SESSION_KEY) || 'null');
  } catch (e) {
    return null;
  }
}
function restoreAdminSession() {
  var session = readAdminSession();
  if (!session || !session.slug) return;
  showLoginError('Restoring session...');
  sbFetch('mosques?slug=eq.' + encodeURIComponent(session.slug) + '&select=id,slug,name,address,area,borough,jummah,jummah2,jummah3,phone,website,email,about,facilities,logo')
    .then(function(rows) {
      if (!rows || !rows.length) throw new Error('Saved mosque not found.');
      currentAdminId = session.adminId || null;
      currentMosque = rows[0];
      byId('login-error').style.display = 'none';
      loadDashboard();
    })
    .catch(function() {
      clearAdminSession();
      byId('login-error').style.display = 'none';
    });
}

function doLogin() {
  var slug = normaliseSlugInput(byId('mosque-id-input').value);
  var pin = byId('pin-input').value.trim();
  byId('login-error').style.display = 'none';
  if (!slug || !pin) { showLoginError('Please enter your Mosque ID and PIN.'); return; }
  showLoginError('Checking...');

  sbFetch('mosques?slug=eq.' + encodeURIComponent(slug) + '&select=id,slug,name,address,area,borough,jummah,jummah2,jummah3,phone,website,email,about,facilities,logo,mosque_admins(id,pin_hash)')
    .then(function(rows) {
      if (!rows || !rows.length) throw new Error('Mosque ID not found.');
      var mosque = rows[0];
      var admins = mosque.mosque_admins || [];
      var admin = admins.find(function(a) { return a.pin_hash === pin; });
      if (!admin) throw new Error('Incorrect PIN.');
      currentAdminId = admin.id;
      currentMosque = mosque;
      delete currentMosque.mosque_admins;
      saveAdminSession(currentMosque, currentAdminId);
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
  renderDisplayPreview();
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
    var announcementRows = results[1] || [];
    currentData.tickers = announcementRows
      .filter(function(row) { return isTickerRow(row); })
      .sort(function(a, b) { return (a.sort_order || 0) - (b.sort_order || 0); })
      .slice(0, 5);
    currentData.displayTheme = announcementRows.find(isDisplayThemeRow) || null;
    currentData.displayBlackout = announcementRows.find(isDisplayBlackoutRow) || null;
    currentData.asrOpinion = announcementRows.find(isAsrOpinionRow) || null;
    currentData.announcements = announcementRows.filter(function(row) { return !isSystemDisplayRow(row); });
    currentData.times = {};
    (results[2] || []).forEach(function(row) { currentData.times[row.date] = row; });
    renderPrayerRows();
    renderMonthTable();
    renderYearlyOverview();
    renderServices();
    renderAnnouncements();
    renderTickers();
    renderDisplayTheme();
    renderDisplayBlackout();
    renderAsrOpinion();
    showSaveStatus('Loaded', true);
  }).catch(function(err) {
    showSaveStatus('Could not load data: ' + err.message.slice(0, 80), false);
  });
}

function switchTab(tab) {
  var tabs = ['times', 'profile', 'services', 'announce', 'display', 'embed'];
  tabs.forEach(function(t) {
    byId('tab-' + t).style.display = t === tab ? 'block' : 'none';
  });
  document.querySelectorAll('.tab').forEach(function(btn, i) {
    btn.classList.toggle('active', tabs[i] === tab);
  });
  if (tab === 'display') renderDisplayPreview();
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
  renderJummahFields();
}

function renderJummahFields() {
  byId('jummah-time-1').value = currentMosque.jummah || '';
  byId('jummah-time-2').value = currentMosque.jummah2 || '';
  byId('jummah-time-3').value = currentMosque.jummah3 || '';
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
    function firstCol(names) {
      for (var i = 0; i < names.length; i++) {
        var idx = col(names[i]);
        if (idx !== -1) return idx;
      }
      return -1;
    }
    function cell(row, idx) { return idx === -1 ? '' : row[idx]; }
    var required = ['Date', 'Fajr Begins', 'Fajr Jamaah', 'Zuhr Begins', 'Zuhr Jamaah', 'Asr Begins', 'Asr Jamaah', 'Maghrib Begins', 'Maghrib Jamaah', 'Isha Begins', 'Isha Jamaah'];
    var missing = required.filter(function(h) { return col(h) === -1; });
    if (missing.length) { byId('csv-error').textContent = 'Missing columns: ' + missing.join(', '); byId('csv-error').style.display = 'block'; return; }
    byId('csv-error').style.display = 'none';
    var asrSecondCol = firstCol(['Asr Begins 2', 'Asr Hanafi Begins', 'Asr Secondary Begins', 'Asr Second Begins']);
    csvRows = rows.map(function(r) {
      return {
        mosque_id: currentMosque.id,
        date: parseUkDate(r[col('Date')]),
        fajr_begins: normaliseTime(r[col('Fajr Begins')]),
        fajr_jamaah: normaliseTime(r[col('Fajr Jamaah')]),
        zuhr_begins: normaliseTime(r[col('Zuhr Begins')]),
        zuhr_jamaah: normaliseTime(r[col('Zuhr Jamaah')]),
        asr_begins: normaliseTime(r[col('Asr Begins')]),
        asr_begins_secondary: normaliseTime(cell(r, asrSecondCol)),
        asr_jamaah: normaliseTime(r[col('Asr Jamaah')]),
        maghrib_begins: normaliseTime(r[col('Maghrib Begins')]),
        maghrib_jamaah: normaliseTime(r[col('Maghrib Jamaah')]),
        isha_begins: normaliseTime(r[col('Isha Begins')]),
        isha_jamaah: normaliseTime(r[col('Isha Jamaah')])
      };
    }).filter(function(r) { return r.date; });
    byId('csv-preview').style.display = 'block';
    byId('csv-preview-label').textContent = csvRows.length + ' rows ready';
    var previewHeaders = ['Date', 'Fajr Begins', 'Fajr Jamaah', 'Zuhr Begins', 'Zuhr Jamaah', 'Asr Begins', 'Asr Begins 2', 'Asr Jamaah', 'Maghrib Begins', 'Maghrib Jamaah', 'Isha Begins', 'Isha Jamaah'];
    byId('csv-preview-table').innerHTML = '<tr>' + previewHeaders.map(function(h) { return '<th class="csv-head">' + h + '</th>'; }).join('') + '</tr>' +
      csvRows.slice(0, 8).map(function(r) {
        return '<tr><td class="csv-cell">' + r.date + '</td><td class="csv-cell">' + r.fajr_begins + '</td><td class="csv-cell">' + r.fajr_jamaah + '</td><td class="csv-cell">' + r.zuhr_begins + '</td><td class="csv-cell">' + r.zuhr_jamaah + '</td><td class="csv-cell">' + r.asr_begins + '</td><td class="csv-cell">' + (r.asr_begins_secondary || '') + '</td><td class="csv-cell">' + r.asr_jamaah + '</td><td class="csv-cell">' + r.maghrib_begins + '</td><td class="csv-cell">' + r.maghrib_jamaah + '</td><td class="csv-cell">' + r.isha_begins + '</td><td class="csv-cell">' + r.isha_jamaah + '</td></tr>';
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
  var headers = 'Date,Fajr Begins,Fajr Jamaah,Zuhr Begins,Zuhr Jamaah,Asr Begins,Asr Begins 2,Asr Jamaah,Maghrib Begins,Maghrib Jamaah,Isha Begins,Isha Jamaah\n';
  var blob = new Blob([headers + '01/01/2026,06:15,06:45,12:10,13:15,14:30,15:15,15:30,16:05,16:10,18:15,19:30\n'], { type: 'text/csv' });
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
  pendingProfileLogo = undefined;
  byId('profile-name').value = currentMosque.name || '';
  byId('profile-address').value = currentMosque.address || '';
  byId('profile-phone').value = currentMosque.phone || '';
  byId('profile-website').value = currentMosque.website || '';
  byId('profile-email').value = currentMosque.email || '';
  byId('profile-facilities').value = Array.isArray(currentMosque.facilities) ? currentMosque.facilities.join(', ') : (currentMosque.facilities || '');
  renderProfileLogo(currentMosque.logo || '');
  renderJummahFields();
}
function renderProfileLogo(src) {
  var img = byId('profile-logo-preview');
  var placeholder = byId('profile-logo-placeholder');
  if (!img || !placeholder) return;
  if (src) {
    img.src = src;
    img.style.display = 'block';
    placeholder.style.display = 'none';
  } else {
    img.removeAttribute('src');
    img.style.display = 'none';
    placeholder.style.display = 'block';
  }
}
function resizeLogoFile(file) {
  return new Promise(function(resolve, reject) {
    if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type)) {
      reject(new Error('Please choose a PNG, JPG or WebP logo.'));
      return;
    }
    var reader = new FileReader();
    reader.onload = function() {
      var originalDataUrl = reader.result;
      var img = new Image();
      img.onload = function() {
        var maxBytes = 2 * 1024 * 1024;
        var maxSide = 512;
        var sourceMax = Math.max(img.width, img.height);
        var scale = Math.min(1, maxSide / sourceMax);
        var w = Math.max(1, Math.round(img.width * scale));
        var h = Math.max(1, Math.round(img.height * scale));
        var canvas = document.createElement('canvas');
        var ctx = canvas.getContext('2d');
        var mime = 'image/png';
        var dataUrl = '';
        function removePlainBackground() {
          var imageData = ctx.getImageData(0, 0, w, h);
          var data = imageData.data;
          var samples = [
            [0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1],
            [Math.floor(w / 2), 0], [Math.floor(w / 2), h - 1],
            [0, Math.floor(h / 2)], [w - 1, Math.floor(h / 2)]
          ];
          var total = [0, 0, 0], count = 0;
          samples.forEach(function(p) {
            var idx = (p[1] * w + p[0]) * 4;
            if (data[idx + 3] < 245) return;
            total[0] += data[idx];
            total[1] += data[idx + 1];
            total[2] += data[idx + 2];
            count++;
          });
          if (!count) return;
          var bg = [total[0] / count, total[1] / count, total[2] / count];
          var cornerSpread = 0;
          samples.forEach(function(p) {
            var idx = (p[1] * w + p[0]) * 4;
            var d = Math.abs(data[idx] - bg[0]) + Math.abs(data[idx + 1] - bg[1]) + Math.abs(data[idx + 2] - bg[2]);
            cornerSpread = Math.max(cornerSpread, d);
          });
          if (cornerSpread > 85) return;
          for (var i = 0; i < data.length; i += 4) {
            var dist = Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]);
            if (dist < 48) {
              data[i + 3] = 0;
            } else if (dist < 92) {
              data[i + 3] = Math.min(data[i + 3], Math.round((dist - 48) / 44 * 255));
            }
          }
          ctx.putImageData(imageData, 0, 0);
        }
        function draw() {
          canvas.width = w;
          canvas.height = h;
          ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, w, h);
          if (mime === 'image/jpeg') {
            ctx.fillStyle = '#101e2f';
            ctx.fillRect(0, 0, w, h);
          }
          ctx.drawImage(img, 0, 0, w, h);
          removePlainBackground();
        }
        function dataUrlBytes(value) {
          var base64 = String(value || '').split(',')[1] || '';
          return Math.ceil(base64.length * 3 / 4);
        }
        for (var attempt = 0; attempt < 8; attempt++) {
          draw();
          var quality = Math.max(0.62, 0.9 - attempt * 0.06);
          dataUrl = canvas.toDataURL(mime, quality);
          if (dataUrlBytes(dataUrl) <= maxBytes) break;
          w = Math.max(96, Math.round(w * 0.82));
          h = Math.max(96, Math.round(h * 0.82));
        }
        if (dataUrlBytes(dataUrl) > maxBytes && mime !== 'image/jpeg') {
          mime = 'image/jpeg';
          w = Math.max(96, Math.round(img.width * Math.min(1, 384 / sourceMax)));
          h = Math.max(96, Math.round(img.height * Math.min(1, 384 / sourceMax)));
          for (var jpegAttempt = 0; jpegAttempt < 8; jpegAttempt++) {
            draw();
            dataUrl = canvas.toDataURL('image/jpeg', Math.max(0.5, 0.82 - jpegAttempt * 0.06));
            if (dataUrlBytes(dataUrl) <= maxBytes) break;
            w = Math.max(80, Math.round(w * 0.8));
            h = Math.max(80, Math.round(h * 0.8));
          }
        }
        if (dataUrlBytes(dataUrl) > maxBytes) {
          reject(new Error('Logo could not be compressed under 2MB. Please try a smaller image.'));
          return;
        }
        resolve(dataUrl);
      };
      img.onerror = function() { reject(new Error('Could not read that image.')); };
      img.src = originalDataUrl;
    };
    reader.onerror = function() { reject(new Error('Could not read that image.')); };
    reader.readAsDataURL(file);
  });
}
function handleProfileLogoUpload(event) {
  var file = event && event.target && event.target.files ? event.target.files[0] : null;
  if (!file) return;
  showSaveStatus('Preparing logo...', false);
  resizeLogoFile(file)
    .then(function(dataUrl) {
      pendingProfileLogo = dataUrl;
      renderProfileLogo(dataUrl);
      showSaveStatus('Logo ready. Save profile to publish.', true);
    })
    .catch(function(err) {
      showSaveStatus(err.message || 'Logo upload failed', false);
    })
    .finally(function() {
      if (event && event.target) event.target.value = '';
    });
}
function removeProfileLogo() {
  pendingProfileLogo = '';
  renderProfileLogo('');
  showSaveStatus('Logo removed. Save profile to publish.', true);
}
function saveProfile() {
  function optionalText(id) {
    var value = byId(id).value.trim();
    return value || null;
  }
  var payload = {
    name: byId('profile-name').value.trim(),
    address: byId('profile-address').value.trim(),
    phone: optionalText('profile-phone'),
    website: optionalText('profile-website'),
    email: optionalText('profile-email'),
    facilities: byId('profile-facilities').value.split(',').map(function(s) { return s.trim(); }).filter(Boolean)
  };
  if (pendingProfileLogo !== undefined) payload.logo = pendingProfileLogo;
  showSaveStatus('Saving profile...', false);
  sbFetch('mosques?id=eq.' + currentMosque.id, { method: 'PATCH', body: JSON.stringify(payload) })
    .then(function(rows) {
      Object.assign(currentMosque, rows && rows[0] ? rows[0] : payload);
      pendingProfileLogo = undefined;
      byId('header-mosque-name').textContent = currentMosque.name || '';
      byId('dash-mosque-title').textContent = currentMosque.name || '';
      byId('dash-mosque-address').textContent = currentMosque.address || '';
      renderProfileLogo(currentMosque.logo || '');
      renderEmbed();
      clearPublicAppCache();
      showSaveStatus('Profile saved', true);
    }).catch(function(err) { showSaveStatus('Profile save failed: ' + err.message.slice(0, 80), false); });
}
function saveJummah() {
  var payload = {
    jummah: byId('jummah-time-1').value.trim(),
    jummah2: byId('jummah-time-2').value.trim(),
    jummah3: byId('jummah-time-3').value.trim()
  };
  showSaveStatus('Saving Jummah...', false);
  sbFetch('mosques?id=eq.' + currentMosque.id, { method: 'PATCH', body: JSON.stringify(payload) })
    .then(function(rows) {
      Object.assign(currentMosque, rows && rows[0] ? rows[0] : payload);
      renderJummahFields();
      showSaveStatus('Jummah saved', true);
    })
    .catch(function(err) { showSaveStatus('Jummah save failed: ' + err.message.slice(0, 80), false); });
}

function showAddService() {
  resetServiceForm();
  byId('add-service-form').style.display = 'block';
}
function renderServices() {
  var el = byId('services-list');
  if (!currentData.services.length) { el.innerHTML = '<p style="color:var(--text2);font-size:13px">No services yet.</p>'; return; }
  el.innerHTML = currentData.services.map(function(s, i) {
    var typeCls = 't-' + (s.type || 'Community').replace(/\s+/g, '');
    return '<div class="service-item"><div style="flex:1;min-width:0"><div class="sname">' + esc(s.name) +
      '<span class="type-badge ' + typeCls + '">' + esc(s.type || 'Community') + '</span></div><div class="smeta">' +
      esc([s.days, s.time].filter(Boolean).join(' · ')) + '</div></div><div style="display:flex;gap:6px;flex-shrink:0">' +
      '<button class="icon-btn text-btn" onclick="editService(' + i + ')">Edit</button>' +
      '<button class="del-btn" onclick="deleteService(' + i + ')">x</button></div></div>';
  }).join('');
}
function resetServiceForm() {
  editingServiceId = null;
  editingServiceIndex = -1;
  ['new-svc-name', 'new-svc-days', 'new-svc-time'].forEach(function(id) { byId(id).value = ''; });
  byId('new-svc-type').value = 'Education';
  if (byId('service-submit-btn')) byId('service-submit-btn').textContent = 'Add';
  byId('add-service-form').style.display = 'none';
}
function editService(idx) {
  var s = currentData.services[idx];
  if (!s) return;
  editingServiceId = s.id || null;
  editingServiceIndex = idx;
  byId('new-svc-name').value = s.name || '';
  byId('new-svc-type').value = s.type || 'Community';
  byId('new-svc-days').value = s.days || '';
  byId('new-svc-time').value = s.time || '';
  if (byId('service-submit-btn')) byId('service-submit-btn').textContent = 'Save';
  byId('add-service-form').style.display = 'block';
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
  var isEditing = editingServiceId && editingServiceIndex > -1;
  var request = isEditing
    ? sbFetch('services?id=eq.' + editingServiceId, { method: 'PATCH', body: JSON.stringify(payload) })
    : sbFetch('services', { method: 'POST', body: JSON.stringify(payload) });
  showSaveStatus(isEditing ? 'Saving service...' : 'Adding service...', false);
  request.then(function(rows) {
    var saved = rows && rows[0] ? rows[0] : Object.assign({}, currentData.services[editingServiceIndex] || {}, payload);
    if (isEditing) currentData.services[editingServiceIndex] = saved;
    else currentData.services.push(saved);
    resetServiceForm();
    renderServices();
    showSaveStatus(isEditing ? 'Service saved' : 'Service added', true);
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
  ['new-ann-title', 'new-ann-desc', 'new-ann-time', 'new-ann-date', 'new-ann-weeks'].forEach(function(id) { byId(id).value = ''; });
  byId('new-ann-day').value = '';
  byId('new-ann-tag').value = 'Class';
  byId('new-ann-active').value = 'true';
  byId('ann-submit-btn').textContent = 'Post';
  byId('add-ann-form').style.display = 'none';
}
function announcementTimeMins(value) {
  var time = normaliseTime(value);
  var m = String(time || '').match(/^(\d{1,2}):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 9999;
}
function announcementDate(value) {
  var parsed = parseAdminDate(value);
  if (!parsed || !/^\d{4}-\d{2}-\d{2}$/.test(parsed)) return null;
  var parts = parsed.split('-').map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2]);
}
function announcementDayDate(day) {
  var days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var idx = days.indexOf(day);
  if (idx === -1) return null;
  var now = new Date();
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var diff = (idx - today.getDay() + 7) % 7;
  var date = new Date(today);
  date.setDate(date.getDate() + diff);
  return date;
}
function announcementSortDate(row) {
  if (row.day === 'Daily') return new Date(0);
  return announcementDate(row.start_date || row.date) || announcementDayDate(row.day) || new Date(8640000000000000);
}
function sortAnnouncements() {
  currentData.announcements.sort(function(a, b) {
    var activeDiff = (isAnnouncementActive(b) ? 1 : 0) - (isAnnouncementActive(a) ? 1 : 0);
    if (activeDiff) return activeDiff;
    var dailyDiff = (a.day === 'Daily' ? 0 : 1) - (b.day === 'Daily' ? 0 : 1);
    if (dailyDiff) return dailyDiff;
    var dateDiff = announcementSortDate(a) - announcementSortDate(b);
    if (dateDiff) return dateDiff;
    var timeDiff = announcementTimeMins(a.time) - announcementTimeMins(b.time);
    if (timeDiff) return timeDiff;
    return String(a.title || '').localeCompare(String(b.title || ''));
  });
}
function renderAnnouncements() {
  var el = byId('announcements-list');
  sortAnnouncements();
  if (!currentData.announcements.length) { el.innerHTML = '<p style="color:var(--text2);font-size:13px">No classes or events yet.</p>'; return; }
  el.innerHTML = currentData.announcements.map(function(a, i) {
    var duration = a.weeks ? (a.weeks + ' week' + (Number(a.weeks) === 1 ? '' : 's')) : '';
    return '<div class="ann-item"><div class="ann-body"><div class="ann-title">' + esc(a.title) +
      '<span class="badge badge-' + String(a.tag || a.category || 'event').toLowerCase() + '">' + esc(a.tag || a.category || 'Event') + '</span>' +
      '<span class="badge ' + (isAnnouncementActive(a) ? 'badge-active' : 'badge-hidden') + '">' + (isAnnouncementActive(a) ? 'Active' : 'Hidden') + '</span></div>' +
      '<div class="ann-meta">' + esc([a.day, a.time, a.start_date || a.date, duration].filter(Boolean).join(' · ')) + '</div>' +
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
  var tag = byId('new-ann-tag').value;
  return {
    title: title,
    tag: tag,
    category: tag.toLowerCase(),
    description: byId('new-ann-desc').value.trim(),
    day: byId('new-ann-day').value || null,
    time: byId('new-ann-time').value || null,
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

function isTickerRow(row) {
  var tag = String((row && (row.tag || row.category)) || '').toLowerCase();
  return tag === 'ticker';
}
function isDisplayThemeRow(row) {
  var tag = String((row && (row.tag || row.category)) || '').toLowerCase();
  return tag === 'displaytheme';
}
function isDisplayBlackoutRow(row) {
  var tag = String((row && (row.tag || row.category)) || '').toLowerCase();
  return tag === 'displayblackout';
}
function isAsrOpinionRow(row) {
  var tag = String((row && (row.tag || row.category)) || '').toLowerCase();
  return tag === 'asropinion';
}
function isSystemDisplayRow(row) {
  return isTickerRow(row) || isDisplayThemeRow(row) || isDisplayBlackoutRow(row) || isAsrOpinionRow(row);
}
function parseAsrOpinion(row) {
  if (!row || !row.description) return 'first';
  try {
    var parsed = JSON.parse(row.description);
    return parsed && parsed.opinion === 'second' ? 'second' : 'first';
  } catch (e) {
    return String(row.description).toLowerCase() === 'second' ? 'second' : 'first';
  }
}
function renderAsrOpinion() {
  var select = byId('asr-opinion-select');
  if (select) select.value = parseAsrOpinion(currentData.asrOpinion);
}
function saveAsrOpinion() {
  var select = byId('asr-opinion-select');
  var opinion = select && select.value === 'second' ? 'second' : 'first';
  var payload = {
    title: 'Asr Opinion',
    tag: 'AsrOpinion',
    category: 'AsrOpinion',
    description: JSON.stringify({ opinion: opinion }),
    active: true,
    sort_order: 0
  };
  var request = currentData.asrOpinion && currentData.asrOpinion.id
    ? sbFetch('announcements?id=eq.' + currentData.asrOpinion.id, { method: 'PATCH', body: JSON.stringify(payload) })
    : sbFetch('announcements', { method: 'POST', body: JSON.stringify(Object.assign({ mosque_id: currentMosque.id }, payload)) });
  showSaveStatus('Saving Asr setting...', false);
  request.then(function(rows) {
    currentData.asrOpinion = rows && rows[0] ? rows[0] : Object.assign({}, currentData.asrOpinion || {}, payload);
    renderAsrOpinion();
    showSaveStatus('Asr setting saved', true);
  }).catch(function(err) {
    showSaveStatus('Asr setting failed: ' + err.message.slice(0, 80), false);
  });
}
function defaultDisplayTheme() {
  return {
    bg: '#101e2f',
    panel: '#101e2f',
    accent: '#c8a46e',
    text: '#eeebe5'
  };
}
function normaliseColourCode(value) {
  var s = String(value || '').trim();
  var hex3 = s.match(/^#?([a-f0-9])([a-f0-9])([a-f0-9])$/i);
  if (hex3) return '#' + hex3.slice(1).map(function(ch) { return ch + ch; }).join('').toLowerCase();
  var hex6 = s.match(/^#?([a-f0-9]{6})$/i);
  if (hex6) return '#' + hex6[1].toLowerCase();
  var rgb = s.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i) || s.match(/^(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})$/);
  if (rgb) {
    var parts = [rgb[1], rgb[2], rgb[3]].map(function(n) { return Math.max(0, Math.min(255, Number(n) || 0)); });
    return '#' + parts.map(function(n) { return n.toString(16).padStart(2, '0'); }).join('');
  }
  return '';
}
function displayThemeIds(part) {
  return {
    bg: ['display-bg-color', 'display-bg-code'],
    panel: ['display-panel-color', 'display-panel-code'],
    accent: ['display-accent-color', 'display-accent-code'],
    text: ['display-text-color', 'display-text-code']
  }[part];
}
function displayThemeFromInputs() {
  return {
    bg: byId('display-bg-color').value,
    panel: byId('display-panel-color').value,
    accent: byId('display-accent-color').value,
    text: byId('display-text-color').value
  };
}
function updateDisplayThemePreview() {
  var theme = displayThemeFromInputs();
  var wrap = byId('display-colour-preview');
  var panel = byId('display-colour-preview-panel');
  var tag = byId('display-colour-preview-tag');
  if (!wrap || !panel || !tag) return;
  wrap.style.background = theme.bg;
  wrap.style.color = theme.text;
  wrap.style.borderColor = theme.accent;
  panel.style.background = theme.panel;
  panel.style.color = theme.text;
  panel.style.borderColor = theme.accent;
  tag.style.background = theme.accent;
  tag.style.color = theme.bg;
}
function setDisplayThemeInputs(theme) {
  ['bg', 'panel', 'accent', 'text'].forEach(function(part) {
    var ids = displayThemeIds(part);
    byId(ids[0]).value = theme[part];
    byId(ids[1]).value = theme[part];
  });
  updateDisplayThemePreview();
}
function syncDisplayThemeInput(part, source) {
  var ids = displayThemeIds(part);
  if (!ids) return;
  var picker = byId(ids[0]);
  var code = byId(ids[1]);
  if (source === 'picker') {
    code.value = picker.value;
  } else {
    var parsed = normaliseColourCode(code.value);
    if (parsed) {
      picker.value = parsed;
      code.value = parsed;
    }
  }
  updateDisplayThemePreview();
}
window.syncDisplayThemeInput = syncDisplayThemeInput;
function parseDisplayTheme(row) {
  var defaults = defaultDisplayTheme();
  if (!row || !row.description) return defaults;
  try {
    return Object.assign(defaults, JSON.parse(row.description));
  } catch (e) {
    return defaults;
  }
}
function renderDisplayTheme() {
  var theme = parseDisplayTheme(currentData.displayTheme);
  setDisplayThemeInputs(theme);
}
function saveDisplayTheme(themeOverride) {
  var theme = themeOverride || displayThemeFromInputs();
  var payload = {
    title: 'Display Theme',
    tag: 'DisplayTheme',
    category: 'DisplayTheme',
    description: JSON.stringify(theme),
    active: true,
    sort_order: 0
  };
  var request = currentData.displayTheme && currentData.displayTheme.id
    ? sbFetch('announcements?id=eq.' + currentData.displayTheme.id, { method: 'PATCH', body: JSON.stringify(payload) })
    : sbFetch('announcements', { method: 'POST', body: JSON.stringify(Object.assign({ mosque_id: currentMosque.id }, payload)) });
  showSaveStatus('Saving colours...', false);
  request.then(function(rows) {
    currentData.displayTheme = rows && rows[0] ? rows[0] : Object.assign({}, currentData.displayTheme || {}, payload);
    renderDisplayTheme();
    showSaveStatus('Display colours saved', true);
  }).catch(function(err) {
    showSaveStatus('Colour save failed: ' + err.message.slice(0, 80), false);
  });
}
function resetDisplayTheme() {
  var theme = defaultDisplayTheme();
  setDisplayThemeInputs(theme);
  saveDisplayTheme(theme);
}
function defaultDisplayBlackout() {
  return { fajr: 12, zuhr: 12, asr: 12, maghrib: 12, isha: 12 };
}
function parseDisplayBlackout(row) {
  var defaults = defaultDisplayBlackout();
  if (!row || !row.description) return defaults;
  try {
    var parsed = JSON.parse(row.description);
    PNAMES.forEach(function(p) {
      var value = Number(parsed[p]);
      if (!isNaN(value) && value >= 0) defaults[p] = Math.min(60, Math.round(value));
    });
  } catch (e) {}
  return defaults;
}
function renderDisplayBlackout() {
  var blackout = parseDisplayBlackout(currentData.displayBlackout);
  PNAMES.forEach(function(p) {
    var input = byId('blackout-' + p);
    if (input) input.value = blackout[p];
  });
}
function displayBlackoutFromInputs() {
  var blackout = {};
  PNAMES.forEach(function(p) {
    var input = byId('blackout-' + p);
    var value = input ? Number(input.value) : 12;
    blackout[p] = Math.max(0, Math.min(60, isNaN(value) ? 12 : Math.round(value)));
  });
  return blackout;
}
function saveDisplayBlackout() {
  var blackout = displayBlackoutFromInputs();
  var payload = {
    title: 'Display Blackout',
    tag: 'DisplayBlackout',
    category: 'DisplayBlackout',
    description: JSON.stringify(blackout),
    active: true,
    sort_order: 0
  };
  var request = currentData.displayBlackout && currentData.displayBlackout.id
    ? sbFetch('announcements?id=eq.' + currentData.displayBlackout.id, { method: 'PATCH', body: JSON.stringify(payload) })
    : sbFetch('announcements', { method: 'POST', body: JSON.stringify(Object.assign({ mosque_id: currentMosque.id }, payload)) });
  showSaveStatus('Saving blackout minutes...', false);
  request.then(function(rows) {
    currentData.displayBlackout = rows && rows[0] ? rows[0] : Object.assign({}, currentData.displayBlackout || {}, payload);
    renderDisplayBlackout();
    showSaveStatus('Blackout minutes saved', true);
  }).catch(function(err) {
    showSaveStatus('Blackout save failed: ' + err.message.slice(0, 80), false);
  });
}
function renderTickers() {
  for (var i = 0; i < 5; i++) {
    var input = byId('ticker-entry-' + (i + 1));
    var row = currentData.tickers.find(function(t) { return Number(t.sort_order || 0) === i + 1; });
    if (input) input.value = row ? (row.title || '') : '';
  }
}
function saveTickers() {
  var values = [];
  for (var i = 1; i <= 5; i++) {
    var val = byId('ticker-entry-' + i).value.trim();
    values.push(val);
  }
  showSaveStatus('Saving ticker...', false);
  var tasks = values.map(function(text, i) {
    var existing = currentData.tickers.find(function(t) { return Number(t.sort_order || 0) === i + 1; });
    if (text && existing && existing.id) {
      return sbFetch('announcements?id=eq.' + existing.id, {
        method: 'PATCH',
        body: JSON.stringify({
          title: text,
          tag: 'Ticker',
          category: 'Ticker',
          description: '',
          active: true,
          sort_order: i + 1
        })
      });
    }
    if (text) {
      return sbFetch('announcements', {
        method: 'POST',
        body: JSON.stringify({
          mosque_id: currentMosque.id,
          title: text,
          tag: 'Ticker',
          category: 'Ticker',
          description: '',
          active: true,
          sort_order: i + 1
        })
      });
    }
    if (existing && existing.id) return sbFetch('announcements?id=eq.' + existing.id, { method: 'DELETE' });
    return Promise.resolve(null);
  });
  Promise.all(tasks).then(function() {
    return sbFetch('announcements?mosque_id=eq.' + currentMosque.id + '&select=*&order=created_at.desc');
  }).then(function(rows) {
    var allRows = rows || [];
    currentData.tickers = allRows.filter(isTickerRow).sort(function(a, b) { return (a.sort_order || 0) - (b.sort_order || 0); }).slice(0, 5);
    currentData.displayTheme = allRows.find(isDisplayThemeRow) || null;
    currentData.displayBlackout = allRows.find(isDisplayBlackoutRow) || null;
    currentData.asrOpinion = allRows.find(isAsrOpinionRow) || null;
    currentData.announcements = allRows.filter(function(row) { return !isSystemDisplayRow(row); });
    renderTickers();
    renderAnnouncements();
    showSaveStatus('Ticker saved', true);
  }).catch(function(err) {
    showSaveStatus('Ticker save failed: ' + err.message.slice(0, 80), false);
  });
}

function renderEmbed() {
  var slug = currentMosque && currentMosque.slug ? currentMosque.slug : '';
  var embedUrl = new URL('../embed.html', location.href);
  embedUrl.searchParams.set('mosque', slug);
  embedUrl.searchParams.set('type', embedType);
  var url = embedUrl.href;
  var today = currentData.times[todayISO()] || {};
  var tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  var tomorrow = currentData.times[dateISO(tomorrowDate)] || {};
  var preview = byId('embed-preview');
  if (byId('embed-small-btn')) byId('embed-small-btn').classList.toggle('active', embedType === 'small');
  if (byId('embed-large-btn')) byId('embed-large-btn').classList.toggle('active', embedType === 'large');

  if (embedType === 'large') {
    preview.style.maxWidth = '620px';
    preview.innerHTML =
      '<div style="padding:16px;border-bottom:1px solid rgba(255,255,255,0.08)">' +
        '<div style="font-size:18px;font-weight:700;color:#eeebe5">' + esc(currentMosque.name || 'Mosque') + '</div>' +
        '<div style="font-size:12px;color:rgba(238,235,229,0.55);margin-top:3px">' + esc(currentMosque.area || currentMosque.address || '') + '</div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1.1fr 1fr 1fr 1fr;gap:0">' +
        '<div style="padding:10px 12px;font-size:10px;font-weight:800;color:rgba(238,235,229,0.55);letter-spacing:.12em;text-transform:uppercase">Prayer</div>' +
        '<div style="padding:10px 12px;font-size:10px;font-weight:800;color:rgba(238,235,229,0.55);letter-spacing:.12em;text-transform:uppercase;text-align:center">Begins</div>' +
        '<div style="padding:10px 12px;font-size:10px;font-weight:800;color:rgba(238,235,229,0.55);letter-spacing:.12em;text-transform:uppercase;text-align:center">Jama\'ah</div>' +
        '<div style="padding:10px 12px;font-size:10px;font-weight:800;color:rgba(238,235,229,0.55);letter-spacing:.12em;text-transform:uppercase;text-align:center">Tomorrow</div>' +
        PNAMES.map(function(p) {
          return '<div style="padding:12px;border-top:1px solid rgba(255,255,255,0.07);font-weight:700;color:#eeebe5">' + PLABELS[p] + '</div>' +
            '<div style="padding:12px;border-top:1px solid rgba(255,255,255,0.07);text-align:center;color:rgba(238,235,229,0.72)">' + esc(today[p + '_begins'] || '--') + '</div>' +
            '<div style="padding:12px;border-top:1px solid rgba(255,255,255,0.07);text-align:center;font-weight:700;color:#c8a46e">' + esc(today[p + '_jamaah'] || '--') + '</div>' +
            '<div style="padding:12px;border-top:1px solid rgba(255,255,255,0.07);text-align:center;color:rgba(238,235,229,0.72)">' + esc(tomorrow[p + '_jamaah'] || '--') + '</div>';
        }).join('') +
      '</div>' +
      '<div style="display:flex;justify-content:space-between;border-top:1px solid rgba(255,255,255,0.08);padding:12px 16px;color:#c8a46e;font-weight:700;font-size:13px">' +
        '<span>Jummah</span><span>' + esc([currentMosque.jummah, currentMosque.jummah2, currentMosque.jummah3].filter(Boolean).join(' · ') || '--') + '</span>' +
      '</div>';
  } else {
    preview.style.maxWidth = '440px';
    preview.innerHTML =
      '<div style="background:rgba(200,164,110,0.06);padding:13px 16px 11px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,0.07)">' +
        '<div><div style="font-size:14px;font-weight:700;color:#eeebe5">' + esc(currentMosque.name || 'Mosque') + '</div>' +
        '<div style="font-size:11px;color:rgba(238,235,229,0.5);margin-top:1px">' + esc(currentMosque.area || '') + '</div></div>' +
        '<div style="text-align:right"><div style="font-size:9px;font-weight:700;letter-spacing:1px;color:rgba(238,235,229,0.5);text-transform:uppercase;margin-bottom:1px">Next Jama\'ah</div>' +
        '<div style="font-size:16px;font-weight:700;color:#c8a46e;font-variant-numeric:tabular-nums">--:--</div></div>' +
      '</div>' +
      '<div style="height:2px;background:rgba(255,255,255,0.06)"><div style="height:2px;background:linear-gradient(90deg,#c8a46e,#e0be78);width:35%"></div></div>' +
      '<div style="display:grid;grid-template-columns:repeat(5,1fr)">' +
        PNAMES.map(function(p, i) {
          return '<div style="padding:11px 4px;text-align:center' + (i < PNAMES.length - 1 ? ';border-right:1px solid rgba(255,255,255,0.06)' : '') + '"><div style="font-size:9px;font-weight:700;text-transform:uppercase;color:rgba(238,235,229,0.5);margin-bottom:4px">' + PLABELS[p] + '</div><div style="font-size:12px;font-weight:500;color:#eeebe5">' + esc(today[p + '_jamaah'] || '--') + '</div></div>';
        }).join('') +
      '</div>';
  }
  var minHeight = embedType === 'large' ? '540px' : '190px';
  byId('embed-code-block').textContent = '<iframe src="' + url + '" style="width:100%;min-height:' + minHeight + ';border:0" loading="lazy"></iframe>';
}

function setEmbedType(type) {
  embedType = type === 'large' ? 'large' : 'small';
  renderEmbed();
}
window.setEmbedType = setEmbedType;

function displaySlug() {
  return currentMosque && currentMosque.slug ? String(currentMosque.slug) : '';
}
function displayPublicUrl() {
  var slug = displaySlug();
  if (!slug) return '';
  if (location.protocol === 'file:') return 'https://qiblah.co.uk/display/' + encodeURIComponent(slug);
  return location.origin + '/display/' + encodeURIComponent(slug);
}
function displayPreviewSrc() {
  var slug = displaySlug();
  if (!slug) return '';
  if (location.protocol === 'file:') {
    var localUrl = new URL('../display.html', location.href);
    localUrl.searchParams.set('mosque', slug);
    return localUrl.href;
  }
  return displayPublicUrl();
}
function renderDisplayPreview() {
  var linkEl = byId('display-link-text');
  var frame = byId('display-preview-frame');
  if (!linkEl || !frame) return;
  var publicUrl = displayPublicUrl();
  linkEl.textContent = publicUrl || 'No display link available yet.';
  var src = displayPreviewSrc();
  if (src && frame.src !== src) frame.src = src;
}
function openDisplayPreview() {
  var url = displayPublicUrl();
  if (!url) return;
  window.open(url, '_blank', 'noopener');
}
function copyDisplayPreviewLink() {
  var url = displayPublicUrl();
  if (!url) return;
  navigator.clipboard.writeText(url).then(function() {
    showSaveStatus('Display link copied', true);
  }).catch(function() {
    showSaveStatus('Copy failed. Link: ' + url, false);
  });
}
window.openDisplayPreview = openDisplayPreview;
window.copyDisplayPreviewLink = copyDisplayPreviewLink;

function doLogout() {
  clearAdminSession();
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
  restoreAdminSession();
});
