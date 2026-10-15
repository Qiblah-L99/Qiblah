const {test,beforeEach}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const pages=require('../lib/public-pages');
const seo=require('../assets/seo');
const handler=require('../api/public-page');
const mosque={id:'public-fixture',slug:'fixture-mosque',name:'Fixture Mosque',address:'Demo Road',borough:'Tower Hamlets',is_hidden:false,facilities:['Wudu'],jummah:'1:15 PM'};
let requests, hidden, outage;
beforeEach(()=>{
 requests=[];hidden=false;outage=false;
 global.fetch=async(url,opts)=>{
  requests.push({url,opts});
  if(outage)throw new Error('Database unavailable');
  const pathname=new URL(url).pathname;
  const data=pathname.endsWith('/mosques')?[{...mosque,is_hidden:hidden}]:pathname.endsWith('/prayer_timetables')?[{mosque_id:mosque.id,fajr_begins:'05:49',fajr_jamaah:'06:00'}]:[];
  return {ok:true,json:async()=>data};
 };
});
async function invoke(url,method='GET'){
 const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},end(body){this.body=body;}};
 await handler({url,method},res);return res;
}
test('profile route and slug validation are strict',()=>{
 assert.equal(seo.slugFromPath('/mosques/east-london-mosque/'),'east-london-mosque');
 for(const value of ['../private','bad?query','qiblah/secret','<script>'])assert.equal(seo.mosquePath(value),null);
});
test('London dates handle BST around UTC midnight',()=>{
 assert.equal(pages.londonDate(new Date('2026-10-14T23:30:00Z')),'2026-10-15');
 assert.equal(pages.londonDate(new Date('2026-12-14T23:30:00Z')),'2026-12-14');
});
test('sitemap uses preferred domain and excludes hidden/demo and noindex pages',()=>{
 const xml=pages.sitemap([mosque,{...mosque,is_hidden:true},{...mosque,slug:'qiblah-demo-mosque'}]);
 assert.ok(xml.includes('https://londonprayertimes.co.uk/mosques/fixture-mosque/'));
 for(const excluded of ['qiblah.co.uk','qiblah-demo','register/','ramadan-times/'])assert.ok(!xml.includes(excluded));
});
test('mosque profile contains useful HTML before JavaScript runs',async()=>{
 const res=await invoke('/api/public-page?slug=fixture-mosque');
 assert.equal(res.statusCode,200);assert.match(res.body,/<h1[^>]*>Fixture Mosque<\/h1>/);
 assert.match(res.body,/05:49/);assert.match(res.body,/06:00/);
 assert.match(res.body,/canonical" href="https:\/\/londonprayertimes.co.uk\/mosques\/fixture-mosque\//);
 assert.match(res.body,/class="page active" id="page-detail"/);
 assert.ok(!res.body.includes('SUPABASE_SERVICE_ROLE_KEY'));
});
test('hidden and out-of-scope records are never public profile pages',async()=>{
 hidden=true;assert.equal((await invoke('/api/public-page?slug=fixture-mosque')).statusCode,404);
 assert.equal(pages.publicMosque({...mosque,borough:'Unpublished area'}),false);
});
test('bad slugs and unsupported methods do not query the database',async()=>{
 assert.equal((await invoke('/api/public-page?slug=../private')).statusCode,404);
 assert.equal((await invoke('/api/public-page?slug=fixture-mosque','POST')).statusCode,405);
 assert.equal(requests.length,0);
});
test('public data failure gives a non-indexable 503, not an empty successful page',async()=>{
 outage=true;const res=await invoke('/api/public-page?slug=fixture-mosque');
 assert.equal(res.statusCode,503);assert.equal(res.headers['X-Robots-Tag'],'noindex');
});
test('dynamic sitemap includes public profiles with published prayer times',async()=>{
 const res=await invoke('/api/public-page?format=sitemap');
 assert.equal(res.statusCode,200);assert.equal(res.headers['Content-Type'],'application/xml; charset=utf-8');
 assert.ok(res.body.includes('/mosques/fixture-mosque/'));
 assert.ok(requests.every(r=>!r.opts.headers.Authorization.includes('service_role')));
});
test('directory provides crawlable profile links without JavaScript',async()=>{
 const res=await invoke('/api/public-page?page=mosques');
 assert.equal(res.statusCode,200);assert.match(res.body,/href="\/mosques\/fixture-mosque\/"/);
 assert.match(res.body,/class="page active" id="page-mosques"/);
});
test('a root static sitemap cannot shadow the live sitemap route',()=>{
 const path=require('node:path');
 const root=path.join(__dirname,'..');
 assert.equal(fs.existsSync(path.join(root,'sitemap.xml')),false);
 const config=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));
 assert.ok(config.rewrites.some(route=>route.source==='/sitemap.xml'&&route.destination==='/api/public-page?format=sitemap'));
 const build=fs.readFileSync(path.join(root,'scripts/build-seo.js'),'utf8');
 assert.doesNotMatch(build,/root,\s*['"]sitemap\.xml['"]/);
});
test('profile data is escaped and clear fields stay cleared',()=>{
 const m=pages.applyProfile(mosque,[{mosque_id:mosque.id,category:'ProfileData',description:JSON.stringify({name:'<script>alert(1)</script>',about:'',facilities:[]})}]);
 const html=pages.renderProfile(fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8'),m,null,'2026-10-15');
 assert.match(html,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);assert.match(html,/Not listed/);
 assert.deepEqual(m.facilities,[]);
});
