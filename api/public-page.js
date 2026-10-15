const fs=require('node:fs');
const path=require('node:path');
const pages=require('../lib/public-pages');
const config=require('../assets/public-data-config.json');
async function get(route){
  const response=await fetch(config.url+'/rest/v1/'+route,{headers:{apikey:config.anonKey,Authorization:'Bearer '+config.anonKey},signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw new Error('Public data unavailable.');
  const rows=await response.json();if(!Array.isArray(rows))throw new Error('Public data unavailable.');return rows;
}
module.exports=async function(req,res){
  const query=new URL(req.url,'https://londonprayertimes.co.uk').searchParams;
  if(req.method!=='GET'&&req.method!=='HEAD'){res.setHeader('Allow','GET, HEAD');res.statusCode=405;return res.end();}
  res.setHeader('X-Content-Type-Options','nosniff');
  try{
    const xml=query.get('format')==='sitemap';
    const directory=query.get('page')==='mosques';
    const slug=query.get('slug');
    if(!xml&&!directory&&!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug||'')) {res.statusCode=404;res.setHeader('X-Robots-Tag','noindex');return res.end('Page not found.');}
    const rows=await get('mosques?is_hidden=eq.false&select=id,slug,name,address,area,borough,is_hidden,phone,website,email,about,facilities,jummah'+(xml||directory?'&order=name':'&slug=eq.'+encodeURIComponent(slug)+'&limit=1'));
    const publicRows=rows.filter(pages.publicMosque);
    let output;
    if(xml||directory){
      const date=pages.londonDate();
      const timetables=await get('prayer_timetables?date=eq.'+date+'&select=mosque_id,fajr_begins,fajr_jamaah,zuhr_begins,zuhr_jamaah,asr_begins,asr_jamaah,maghrib_begins,maghrib_jamaah,isha_begins,isha_jamaah');
      const published=new Set(timetables.filter(pages.validTimes).map(t=>t.mosque_id));
      const selected=publicRows.filter(m=>published.has(m.id));
      if(xml){output=pages.sitemap(selected);res.setHeader('Content-Type','application/xml; charset=utf-8');}
      else{
        const html=fs.readFileSync(path.join(__dirname,'../seo/mosques.html'),'utf8');
        const links=selected.map(m=>'<a class="mosque-card" style="display:block;padding:14px 16px;color:var(--text);text-decoration:none" href="/mosques/'+m.slug+'/"><span class="mosque-card-name">'+pages.escape(m.name)+'</span><span class="mosque-card-row">'+pages.escape(m.address)+'</span></a>').join('');
        output=html.replace(/(<div class="mosques-results mosque-grid" id="mosque-results">)<\/div>/,(_,open)=>open+links+'</div>');
        res.setHeader('Content-Type','text/html; charset=utf-8');
      }
    }
    else{
      const mosque=publicRows[0];
      if(!mosque){res.statusCode=404;res.setHeader('X-Robots-Tag','noindex');return res.end('Mosque profile not found.');}
      const date=pages.londonDate();
      const times=await get('prayer_timetables?mosque_id=eq.'+encodeURIComponent(mosque.id)+'&date=eq.'+date+'&select=*&limit=1');
      const announcements=await get('announcements?mosque_id=eq.'+encodeURIComponent(mosque.id)+'&active=eq.true&select=mosque_id,category,tag,description,active,start_date&order=created_at.desc');
      const m=pages.applyProfile(mosque,announcements);
      let timetable=times[0]||null;
      for(const a of announcements){if(a.category==='PrayerTime'||a.tag==='PrayerTime'){try{const p=JSON.parse(a.description);if((p.date||a.start_date)===date){timetable={...timetable,...p};break;}}catch(_){}}}
      const asr=announcements.find(a=>a.category==='AsrOpinion'||a.tag==='AsrOpinion');
      if(asr&&timetable){let opinion;try{opinion=JSON.parse(asr.description)?.opinion;}catch(_){opinion=asr.description;}if(opinion==='second'&&timetable.asr_begins_secondary)timetable={...timetable,asr_begins:timetable.asr_begins_secondary};}
      const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
      output=pages.renderProfile(html,m,timetable,date);res.setHeader('Content-Type','text/html; charset=utf-8');
    }
    res.setHeader('Cache-Control','public, max-age=0, s-maxage=60');
    return res.end(req.method==='HEAD'?'':output);
  }catch(_){res.statusCode=503;res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex');return res.end('Public information is temporarily unavailable. Please try again.');}
};
