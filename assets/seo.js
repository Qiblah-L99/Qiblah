(function(root) {
  var base = 'https://londonprayertimes.co.uk';
  var pages = {
    home:{title:"London Prayer Times Today | Mosque & Jumu'ah Times",description:"Find today's London prayer times, mosque jama'ah times and Friday Jumu'ah schedules. Browse local mosques, prayer spaces and facilities.",path:'/'},
    mosques:{title:"London Mosques | Prayer Times & Facilities",description:"Browse London's mosques, prayer times, Jumu'ah schedules, facilities and directions on London Prayer Times by Qiblah.",path:'/mosques/'},
    services:{title:'London Mosque Classes & Events | London Prayer Times',description:'Find mosque classes, community events and Islamic services from London mosques and institutions.',path:'/services/'},
    'prayer-rooms':{title:'London Prayer Spaces & Multi-Faith Rooms',description:'Find public prayer spaces and multi-faith rooms in London, including shopping centres, transport hubs and community venues.',path:'/prayer-rooms/'},
    'jumuah-times':{title:"London Jumu'ah Times | Friday Prayer Schedules",description:"Find Friday Jumu'ah times, mosque locations and congregation schedules across London.",path:'/jumuah-times/'},
    'ramadan-times':{title:'London Ramadan Timetables | London Prayer Times',description:'Find published mosque Ramadan timetables, suhoor and iftar information for London.',path:'/ramadan-times/'},
    register:{title:'Add or Manage Your Mosque | London Prayer Times',description:'Add or claim your mosque on London Prayer Times by Qiblah and keep prayer times, facilities and notices up to date.',path:'/register/'}
  };
  function slugFromPath(path) {
    var match=String(path||'').match(/^\/mosques\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/);
    return match ? match[1] : null;
  }
  function mosquePath(slug) {
    return slugFromPath('/mosques/'+slug+'/') ? '/mosques/'+slug+'/' : null;
  }
  function profile(m) {
    return {title:m.name+" Prayer Times & Jumu'ah | London Prayer Times",description:'Prayer times, congregation times, facilities and directions for '+m.name+(m.area?' in '+m.area:'')+'. Check published times with the mosque.',path:mosquePath(m._slug||m.slug)};
  }
  var seo={base:base,pages:pages,slugFromPath:slugFromPath,mosquePath:mosquePath,profile:profile};
  if(typeof module!=='undefined'&&module.exports)module.exports=seo;
  else root.QiblahSeo=seo;
})(typeof window!=='undefined'?window:this);
