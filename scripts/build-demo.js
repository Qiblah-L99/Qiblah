const fs = require('node:fs');
const path = require('node:path');
const repo = path.resolve(__dirname, '..');
const output = path.join(repo, 'demo/index.html');
const demo = require('../test/fixtures/demo-mosque.json');
const content = demo.demo_content;
function dateFromToday(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return [date.getFullYear(), String(date.getMonth()+1).padStart(2,'0'), String(date.getDate()).padStart(2,'0')].join('-');
}
const todayRow = {...content.timetable, mosque_id:demo.id, date:dateFromToday(0)};
const tomorrowRow = {...content.tomorrow_timetable, mosque_id:demo.id, date:dateFromToday(1)};
const serviceRows = content.services.map(s=>({...s,mosque_id:demo.id}));
const announcementRows = content.announcements.map((a,i)=>({...a,id:'demo-announcement-'+i,mosque_id:demo.id,active:true,sort_order:i,start_date:a.days_from_today!==undefined?dateFromToday(a.days_from_today):null}));
let source = fs.readFileSync(path.join(repo, 'index.source.html'), 'utf8');
source = source.replace("track('page_view');", '').replace('  initHomeLocation();', '').replace('\nloadMosquesFromSupabase();', '\n// Local demo data is supplied below.');
const preview = `
<script>
track = function() {};
var demoMosque = ${JSON.stringify(demo)};
var demoServices = ${JSON.stringify(serviceRows)};
var demoAnnouncements = ${JSON.stringify(announcementRows)};
var demoTimetables = ${JSON.stringify([todayRow,tomorrowRow])};
var demoPublicGet = sbGet;
sbGet = function(route) {
 if(route.indexOf('mosques?')===0)return Promise.resolve([Object.assign({},demoMosque,{prayer_timetables:demoTimetables})]);
 if(route.indexOf('services?')===0)return Promise.resolve(demoServices);
 if(route.indexOf('announcements?')===0)return Promise.resolve(demoAnnouncements);
 return Promise.resolve([]);
};
fetchSunrise = function(lat,lon,address,callback) { callback('07:20'); };
loadMosquesFromSupabase = function() {};
var demoOriginalShowPage = showPage;
showPage = function(page) {
 if(['home','mosques','jumuah-times','prayer-rooms'].indexOf(page)!==-1){window.location.assign(page==='home'?'/':'/'+page+'/');return;}
 return demoOriginalShowPage(page);
};
isPublicMosqueVisible = function(m) { return m._slug === 'qiblah-demo-mosque'; };
var demoOriginalJummah = publicJummahTimes;
publicJummahTimes = function(m) { return m._slug === 'qiblah-demo-mosque' ? jummahTimeParts(m) : demoOriginalJummah(m); };
applyData({mosqueRows:[demoMosque],annRows:demoAnnouncements,svcRows:demoServices,timesRows:[demoTimetables[0]],tomorrowTimesRows:[demoTimetables[1]]});
var demoOriginalRender = renderDetailPage;
renderDetailPage = function(idx,m,img,prayers,cdPrayers) {
 demoOriginalRender(idx,m,img,prayers,cdPrayers);
 if(m._slug!=='qiblah-demo-mosque')return;
 var body = document.querySelector('#detail-content .detail-body');
 var info = demoMosque.demo_content;
 var extra = document.createElement('section');
 extra.className = 'detail-card';
 extra.innerHTML = '<h3>About the Mosque</h3><p style="font-size:14px;color:var(--muted);line-height:1.7;margin-bottom:18px">'+qText(demoMosque.about)+'</p><dl style="font-size:13px;line-height:1.6;display:grid;grid-template-columns:minmax(90px,1fr) minmax(0,2fr);gap:10px 16px">'+[
 ['Opening hours',info.opening_hours],['Office hours',info.office_hours],['Imam',info.imam],['Capacity',info.capacity],['Accessibility',info.accessibility],['Parking',info.parking]
 ].map(function(row){return '<dt style="color:var(--text)">'+qText(row[0])+'</dt><dd style="color:var(--muted);margin:0">'+qText(row[1])+'</dd>';}).join('')+'</dl>';
 body.insertBefore(extra,body.querySelector('.detail-card'));
 var support = document.createElement('section');
 support.className = 'detail-card';
 var method = window.QiblahDonationMethods.mode(m);
 var url = method === 'external' ? mosqueDonationUrl(m) : '';
 var action = method === 'stripe' ? '<button class="profile-action-btn profile-action-btn--donate" type="button" onclick="startDonationCheckout(0)">Donate</button>' : url ? '<a class="profile-action-btn profile-action-btn--donate" href="'+qText(url)+'" target="_blank" rel="noopener noreferrer">Donate</a>' : '';
 support.innerHTML = '<h3>Support the Mosque</h3><p style="font-size:14px;color:var(--muted);line-height:1.7;margin-bottom:12px">Sample appeals for mosque upkeep, community food support and youth education.</p>'+action+(method === 'stripe' ? '<p style="font-size:12px;color:var(--muted);margin-top:12px">Test donations only. No real money is collected.</p>' : '');
 body.appendChild(support);
 // Demo contacts and directions must not lead to real calls, emails or map searches.
 document.querySelectorAll('#detail-content a[href^="tel:"], #detail-content a[href^="mailto:"], #detail-content a[title="Get directions"]').forEach(function(a){a.removeAttribute('href');a.removeAttribute('onclick');a.setAttribute('aria-disabled','true');a.title='Fictional demo contact';});
};
var previewAttempts=0;
demoPublicGet('announcements?mosque_id=eq.'+encodeURIComponent(demoMosque.id)+'&category=eq.ProfileData&active=eq.true&select=*&order=created_at.desc&limit=1').then(function(rows){
 if(!rows || !rows.length)return;
 demoAnnouncements=demoAnnouncements.filter(function(row){return row.category!=='ProfileData';}).concat(rows);
 applyData({mosqueRows:[demoMosque],annRows:demoAnnouncements,svcRows:demoServices,timesRows:[demoTimetables[0]],tomorrowTimesRows:[demoTimetables[1]]});
 var idx=MOSQUES.findIndex(function(m){return m._slug==='qiblah-demo-mosque';});
 if(idx>=0)openDetail(idx);
}).catch(function(){});
var previewTimer=setInterval(function(){
 var idx=MOSQUES.findIndex(function(m){return m._slug==='qiblah-demo-mosque';});
 if(idx>=0){clearInterval(previewTimer);openDetail(idx);}
 else if(++previewAttempts>100){clearInterval(previewTimer);}
},250);
</script>`;
source = source.replace('<head>', '<head>\n<base href="/">').replace('</body>', preview + '\n</body>').replace(/[ \t]+$/gm, '');
fs.mkdirSync(path.dirname(output), {recursive:true});
fs.writeFileSync(output, source);
console.log('Created Qiblah Demo Mosque profile preview');
