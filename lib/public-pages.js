const seo=require('../assets/seo');
function escape(value){return String(value==null?'':value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function londonDate(now=new Date()) {
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const field=type=>parts.find(p=>p.type===type).value;
  return `${field('year')}-${field('month')}-${field('day')}`;
}
function publicMosque(row){
  return row && row.is_hidden===false && row.slug!=='qiblah-demo-mosque' && seo.mosquePath(row.slug) &&
    (row.id==='b2a2cf76-a4e8-4810-8d21-451e3ec51f8a'||String(row.borough||'').trim().toLowerCase()==='tower hamlets');
}
function validTimes(row){return row && ['fajr','zuhr','asr','maghrib','isha'].some(p=>['begins','jamaah'].some(t=>row[p+'_'+t]&&row[p+'_'+t]!=='--'));}
function applyProfile(m,announcements){
  const result={...m};
  for(const row of announcements){
    if(row.active===false||row.mosque_id!==m.id)continue;
    if(row.category==='ProfileData'||row.tag==='ProfileData'){
      try{const profile=JSON.parse(row.description);for(const key of ['name','address','phone','website','email','about','facilities'])if(Object.hasOwn(profile,key))result[key]=profile[key];}catch(_){}
      break;
    }
  }
  const friday=announcements.find(row=>row.active!==false&&row.mosque_id===m.id&&(row.category==='JummahTimes'||row.tag==='JummahTimes'));
  if(friday){try{const value=JSON.parse(friday.description);result.jummah=value.jummah||'';}catch(_){result.jummah=String(friday.description||'').split(',')[0];}}
  return result;
}
function metadata(html,meta){
  const url=seo.base+meta.path;
  html=html.replace(/<title>[\s\S]*?<\/title>/i,'<title>'+escape(meta.title)+'</title>');
  for(const [kind,name,value] of [['name','description',meta.description],['property','og:title',meta.title],['property','og:description',meta.description],['property','og:url',url],['name','twitter:title',meta.title],['name','twitter:description',meta.description]]){
    const tag=new RegExp('<meta '+kind+'="'+name+'"[^>]*>','i');
    html=html.replace(tag,'<meta '+kind+'="'+name+'" content="'+escape(value)+'">');
  }
  return html.replace(/<link rel="canonical"[^>]*>/i,'<link rel="canonical" href="'+escape(url)+'">');
}
function profileMarkup(m,times,date){
  const prayers=[['Fajr','fajr'],['Zuhr','zuhr'],['Asr','asr'],['Maghrib','maghrib'],['Isha','isha']];
  const table='<table style="width:100%;border-collapse:collapse;text-align:left"><caption style="text-align:left;margin:12px 0">Published timetable for '+escape(date)+'</caption><thead><tr><th>Prayer</th><th>Begins</th><th>Jama\'ah</th></tr></thead><tbody>'+prayers.map(([name,key])=>'<tr><th style="padding:10px 0">'+name+'</th><td>'+escape(times&&times[key+'_begins']||'Not listed')+'</td><td>'+escape(times&&times[key+'_jamaah']||'Not listed')+'</td></tr>').join('')+'</tbody></table>';
  const jummah=m.jummah ? '<p>Jumu\'ah: '+escape(String(m.jummah).split(',')[0])+'</p>' : '';
  const facilities=Array.isArray(m.facilities)?m.facilities.map(f=>'<li>'+escape(f)+'</li>').join(''):'';
  let website='';try{const url=new URL(m.website);if(url.protocol==='https:'&&!url.username&&!url.password)website='<a href="'+escape(url.href)+'" rel="noopener noreferrer">Listed mosque website</a>';}catch(_){}
  return '<div class="detail-body"><a href="/mosques/">All London mosques</a><h1 style="font-size:24px;margin:16px 0 8px">'+escape(m.name)+'</h1><p>'+escape(m.address)+'</p><section class="pt-section" style="padding:16px;margin-top:20px"><h2 style="font-size:18px">Prayer Times</h2>'+table+jummah+'<p style="font-size:12px;color:var(--muted);margin-top:12px">Published on London Prayer Times. Confirm times and facilities with the mosque.</p></section>'+(m.about?'<section class="detail-card"><h2 style="font-size:18px">About</h2><p>'+escape(m.about)+'</p></section>':'')+(facilities?'<section class="detail-card"><h2 style="font-size:18px">Facilities</h2><ul style="padding-left:20px">'+facilities+'</ul></section>':'')+'<section class="detail-card"><h2 style="font-size:18px">Contact</h2>'+website+'<p>'+escape(m.phone||'')+'</p><a href="https://maps.google.com/?q='+encodeURIComponent(m.name+' '+(m.address||''))+'" rel="noopener noreferrer">Directions</a></section></div>';
}
function renderProfile(html,m,times,date){
  html=metadata(html,seo.profile(m)).replace('<head>','<head><base href="/">');
  const schema={'@context':'https://schema.org','@type':'Place',name:m.name,address:m.address,url:seo.base+seo.mosquePath(m.slug)};
  html=html.replace('</head>','<script type="application/ld+json" id="mosque-page-schema">'+JSON.stringify(schema).replace(/</g,'\\u003c')+'</script></head>');
  html=html.replace(/class="page active" id="page-home"/,'class="page" id="page-home"').replace(/class="page" id="page-detail"/,'class="page active" id="page-detail"');
  return html.replace('<div id="detail-content"></div>','<div id="detail-content">'+profileMarkup(m,times,date)+'</div>');
}
function sitemap(mosques){
  const paths=['home','mosques','services','prayer-rooms','jumuah-times'].map(id=>seo.pages[id].path).concat(['/privacy/'],mosques.filter(publicMosque).map(m=>seo.mosquePath(m.slug)));
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+Array.from(new Set(paths)).map(p=>'<url><loc>'+escape(seo.base+p)+'</loc></url>').join('')+'</urlset>';
}
module.exports={escape,londonDate,publicMosque,validTimes,applyProfile,metadata,renderProfile,sitemap};
