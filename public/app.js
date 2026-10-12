// Loop L access map. Coordinates are approximate station/track positions.
const COLOR = {red:'#C60C30',blue:'#00A1DE',brown:'#62361B',green:'#009B3A',orange:'#F9461C',pink:'#E27EA6',purple:'#522398'};
const LINE_NAME = {red:'Red',blue:'Blue',brown:'Brown',green:'Green',orange:'Orange',pink:'Pink',purple:'Purple'};

// k: y = elevator, n = stairs only, c = closed. id = CTA station (map) ID used by the alerts feed.
// match = station name as the alerts feed spells it, only where the name is unique systemwide.
// alt = nearest stations with elevators as [name, detail]; bus = accessible bus options as [route, detail].
// Shown always for stairs-only stations, and for elevator stations while an elevator alert is active.
const STATIONS = [
  {id:40380,name:'Clark/Lake',match:'Clark/Lake',ll:[41.8857,-87.6309],k:'y',lines:['blue','brown','green','orange','pink','purple'],side:'right',note:'Elevated platforms and Blue Line subway both have elevators.',alt:[['Washington/Wabash', 'all elevated lines here'], ['Clinton (Green/Pink)', 'Green, Pink'], ['Washington/Wells', 'Orange'], ['Merchandise Mart', 'Brown, Purple'], ['Jackson (Blue)', '3 stops toward Forest Park'], ['Western (Blue)', '5 stops toward O’Hare']]},
  {id:40260,name:'State/Lake',match:'State/Lake',ll:[41.8858,-87.6278],k:'c',lines:['brown','green','orange','pink','purple'],side:'right',note:'Closed since Jan. 5, 2026 for full rebuild; reopening expected 2029. Trains bypass it. Use Washington/Wabash or Clark/Lake.'},
  {id:41660,name:'Lake (Red)',match:'Lake',ll:[41.8846,-87.6278],k:'y',lines:['red'],side:'right',note:'To transfer to the elevated lines while State/Lake is closed, CTA says to use Washington/Wabash.',alt:[['Grand (Red)', 'next stop north'], ['Jackson (Red)', '2 stops south']]},
  {id:41700,name:'Washington/Wabash',match:'Washington/Wabash',ll:[41.8831,-87.6261],k:'y',lines:['brown','green','orange','pink','purple'],side:'right',alt:[['Clark/Lake', 'all lines here'], ['Harold Washington Library', 'Brown, Pink, Purple'], ['Roosevelt', 'Green, Orange']]},
  {id:40680,name:'Adams/Wabash',match:'Adams/Wabash',ll:[41.8794,-87.6261],k:'n',lines:['brown','green','orange','pink','purple'],side:'right',alt:[['Washington/Wabash', '2 blocks north, same lines'], ['Harold Washington Library', 'Brown, Pink, Purple'], ['Roosevelt', 'Green, Orange']]},
  {id:40850,name:'Harold Washington Library',match:'Harold Washington Library-State/Van Buren',ll:[41.8768,-87.6281],k:'y',lines:['brown','orange','pink','purple'],side:'bottom',alt:[['Quincy', 'same lines'], ['Washington/Wabash', 'Brown, Pink, Purple'], ['Roosevelt', 'Orange']]},
  {id:40160,name:'LaSalle/Van Buren',match:'LaSalle/Van Buren',ll:[41.8768,-87.6318],k:'n',lines:['brown','orange','pink','purple'],side:'top',alt:[['Quincy', 'same lines'], ['Harold Washington Library', 'same lines']]},
  {id:40040,name:'Quincy',match:'Quincy/Wells',ll:[41.8786,-87.6338],k:'y',lines:['brown','orange','pink','purple'],side:'left',alt:[['Washington/Wells', 'next stop, same lines'], ['Harold Washington Library', 'same lines']]},
  {id:40730,name:'Washington/Wells',match:'Washington/Wells',ll:[41.8829,-87.6338],k:'y',lines:['brown','orange','pink','purple'],side:'left',alt:[['Quincy', 'next stop, same lines'], ['Clark/Lake', 'Orange'], ['Merchandise Mart', 'Brown, Purple'], ['Clinton (Green/Pink)', 'Pink']]},
  {id:40560,name:'Jackson (Red)',ll:[41.8783,-87.6277],k:'y',lines:['red'],side:'right',alt:[['Lake (Red)', '2 stops north'], ['Roosevelt', '2 stops south']]},
  {id:41090,name:'Monroe (Red)',ll:[41.8807,-87.6277],k:'n',lines:['red'],side:'right',alt:[['Jackson (Red)', '2 blocks south']]},
  {id:40370,name:'Washington (Blue)',ll:[41.8833,-87.6294],k:'n',lines:['blue'],side:'left',alt:[['Clark/Lake', '2 blocks north']]},
  {id:40790,name:'Monroe (Blue)',ll:[41.8806,-87.6294],k:'n',lines:['blue'],side:'left',alt:[['Jackson (Blue)', '2 blocks south']]},
  {id:40070,name:'Jackson (Blue)',ll:[41.8782,-87.6294],k:'y',lines:['blue'],side:'left',alt:[['Clark/Lake', '3 stops toward O’Hare'], ['UIC-Halsted', '3 stops toward Forest Park']]},
  {id:41340,name:'LaSalle (Blue)',ll:[41.8757,-87.6317],k:'n',lines:['blue'],side:'bottom',alt:[['Jackson (Blue)', 'next stop toward O’Hare']]},
  {id:40430,name:'Clinton (Blue)',ll:[41.8756,-87.6407],k:'n',lines:['blue'],side:'bottom',note:'Steep stairs. For step-free access to Union Station, use Clinton (Green/Pink).',alt:[['UIC-Halsted', 'next stop toward Forest Park'], ['Jackson (Blue)', '2 stops toward O’Hare']]},
  {id:41160,name:'Clinton (Green/Pink)',ll:[41.8856,-87.6416],k:'y',lines:['green','pink'],side:'top',alt:[['Clark/Lake', 'next stop east'], ['Washington/Wells', 'Pink, from the Loop'], ['Morgan', 'next stop west']]},
  {id:41510,name:'Morgan',match:'Morgan',ll:[41.8856,-87.6524],k:'y',lines:['green','pink'],side:'top',alt:[['Clinton (Green/Pink)', 'next stop east'], ['Ashland (Green/Pink)', 'next stop west']]},
  {id:40170,name:'Ashland (Green/Pink)',ll:[41.8853,-87.6667],k:'y',lines:['green','pink'],side:'top',alt:[['Morgan', 'next stop east'], ['Damen (Green)', 'next stop west'], ['Polk (Pink)', 'next stop west']]},
  {id:40350,name:'UIC-Halsted',match:'UIC-Halsted',ll:[41.8757,-87.6492],k:'y',lines:['blue'],side:'bottom',alt:[['Jackson (Blue)', '3 stops toward O’Hare'], ['Illinois Medical District', '2 stops toward Forest Park']]},
  // North of the river. No match names: Grand and Chicago each exist on several lines.
  {id:40460,name:'Merchandise Mart',match:'Merchandise Mart',ll:[41.8890,-87.6339],k:'y',lines:['brown','purple'],side:'left',alt:[['Chicago (Brown/Purple)', 'next stop north'], ['Washington/Wells', 'first Loop stop, Brown'], ['Clark/Lake', 'first Loop stop, Purple']]},
  {id:40710,name:'Chicago (Brown/Purple)',ll:[41.8968,-87.6359],k:'y',lines:['brown','purple'],side:'left',alt:[['Merchandise Mart', 'next stop south'], ['Sedgwick', 'next stop north, Brown Line']],bus:[['#66 Chicago', 'east to Chicago (Red)']]},
  {id:40330,name:'Grand (Red)',ll:[41.8917,-87.6280],k:'y',lines:['red'],side:'right',alt:[['Chicago (Red)', 'next stop north'], ['Lake (Red)', 'next stop south']]},
  {id:41450,name:'Chicago (Red)',ll:[41.8967,-87.6281],k:'y',lines:['red'],side:'right',alt:[['Grand (Red)', 'next stop south'], ['Clark/Division', 'next stop north']],bus:[['#66 Chicago', 'west to Chicago (Brown/Purple)']]},
  {id:40490,name:'Grand (Blue)',ll:[41.8912,-87.6476],k:'n',lines:['blue'],side:'right',alt:[['Clark/Lake', 'next stop toward Forest Park'], ['Western', '4 stops toward O’Hare']],bus:[['#56 Milwaukee', 'along Milwaukee Ave. to the Loop'], ['#65 Grand', 'east to Grand (Red)']]},
  {id:41410,name:'Chicago (Blue)',ll:[41.8961,-87.6552],k:'n',lines:['blue'],side:'right',alt:[['Clark/Lake', '2 stops toward Forest Park'], ['Western', '3 stops toward O’Hare']],bus:[['#56 Milwaukee', 'along Milwaukee Ave. to the Loop'], ['#66 Chicago', 'east to Chicago (Brown/Purple) and Chicago (Red)']]},
];

// Metra downtown stations, shown for transfers only (no accessibility data yet).
// id = GTFS stop_id; ll and lines from Metra static GTFS (published 2026-10-03), except LaSalle Street:
// its GTFS point sits on top of the CTA LaSalle stations, so it's moved south onto the platforms.
const METRA_COLOR = {BNSF:['#29C233','#000'],HC:['#550E0C','#fff'],'MD-N':['#CC5500','#fff'],'MD-W':['#F1AD0E','#000'],
  ME:['#EB5C00','#fff'],NCS:['#9785BC','#fff'],RI:['#E02400','#fff'],SWS:['#0042A8','#fff'],
  'UP-N':['#008000','#fff'],'UP-NW':['#FFE600','#000'],'UP-W':['#FE8D81','#000']};
const METRA = [
  {id:'OTC',name:'Ogilvie (OTC)',ll:[41.8822,-87.6406],lines:['UP-N','UP-NW','UP-W'],side:'left'},
  {id:'CUS',name:'Union Station',ll:[41.8789,-87.6389],lines:['BNSF','HC','MD-N','MD-W','NCS','SWS'],side:'left'},
  {id:'LSS',name:'LaSalle Street',ll:[41.8745,-87.6322],lines:['RI'],side:'left'},
  {id:'MILLENNIUM',name:'Millennium',ll:[41.8842,-87.6231],lines:['ME'],side:'right'},
  {id:'VANBUREN',name:'Van Buren Street',ll:[41.8769,-87.6231],lines:['ME'],side:'right'},
  {id:'MUSEUM',name:'Museum Campus/11th St.',ll:[41.8686,-87.6214],lines:['ME'],side:'right'},
];

// Track geometry. d = pixel offset to the right of the direction of travel (a number, or one per point);
// a = draw direction arrows.
const NW=[41.8857,-87.6338], NE=[41.8857,-87.6261], SE=[41.8768,-87.6261], SW=[41.8768,-87.6338];
const ROOSEVELT=[41.8674,-87.6262], WEST=[41.8857,-87.6720], TOWER18W=[41.8857,-87.6356];
// Brown/Purple north branch, south to the NW corner: Franklin from past Chicago Ave to Hubbard, then Wells across the river.
const N_BRANCH=[[41.9005,-87.6359],[41.8968,-87.6359],[41.8913,-87.6357],[41.8903,-87.6339],NW];
const CW=[NW,NE,SE,SW,NW], CCW=[NW,SW,SE,NE,NW];
const TRACKS = [
  {c:'red', p:[[41.9005,-87.6281],[41.8917,-87.6280],[41.8673,-87.6278]], dash:true},
  {c:'blue', p:[[41.8756,-87.6720],[41.8756,-87.6440]]},
  {c:'blue', p:[[41.8756,-87.6440],[41.8757,-87.6294],[41.8857,-87.6294],[41.8857,-87.6390],[41.8890,-87.6440],[41.8912,-87.6476],[41.8961,-87.6552],[41.9000,-87.6613]], dash:true},
  {c:'brown', p:N_BRANCH, d:4},
  {c:'purple', p:N_BRANCH, d:-14},
  {c:'pink', p:[WEST,NW], d:4},
  {c:'orange', p:[SE,ROOSEVELT], d:9},
  // West of Tower 18, Green and Pink share the Lake St. tracks, so Green sits beside Pink (where Brown sits
  // in the Loop) and jogs out to its Loop position just west of Wells.
  {c:'green', p:[WEST,TOWER18W,NW,NE,SE,ROOSEVELT], d:[-4,-4,-12,-12,-12,-12]},
  {c:'brown', p:CCW, d:4, a:true},
  {c:'pink', p:CW, d:4, a:true},
  {c:'orange', p:CW, d:9, a:true},
  {c:'purple', p:CW, d:14, a:true},
];

const dark = matchMedia('(prefers-color-scheme: dark)').matches;
// Zoom control top-right so the key panel doesn't cover it.
const map = L.map('map',{zoomControl:false});
L.control.zoom({position:'topright'}).addTo(map);
// Leave room for the key panel (expanded on desktop, collapsed under 600px).
// On phones, fit the Loop plus the stations just west of the river; all of them would put it at zoom 13.
const wide = innerWidth >= 600;
// CTA stations only: the Metra Electric stations east of Wabash would drop a 1400px desktop from zoom 15 to 14.
map.fitBounds(L.latLngBounds(STATIONS.filter(s=>wide || s.ll[1] > -87.645).map(s=>s.ll)),
  wide ? {paddingTopLeft:[400,40], paddingBottomRight:[40,40]} : {paddingTopLeft:[20,80], paddingBottomRight:[20,20]});
// Stadia Maps: works on localhost without a key; production needs the domain registered in the Stadia dashboard.
L.tileLayer(`https://tiles.stadiamaps.com/tiles/${dark?'alidade_smooth_dark':'alidade_smooth'}/{z}/{x}/{y}{r}.png`,{
  maxZoom:20,
  attribution:'&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// Offset a path by d screen pixels (miter joins), at the current zoom.
function offsetPath(latlngs, d){
  if(!d) return latlngs.map(p=>L.latLng(p));
  const dAt = Array.isArray(d) ? i=>d[i] : ()=>d;
  const pts = latlngs.map(p=>map.latLngToLayerPoint(L.latLng(p)));
  const n = pts.length, closed = pts[0].equals(pts[n-1]);
  const nrm = (a,b)=>{const dx=b.x-a.x, dy=b.y-a.y, L2=Math.hypot(dx,dy)||1; return [-dy/L2, dx/L2];};
  return pts.map((pt,i)=>{
    let pr = pts[i-1], nx = pts[i+1];
    if(closed){ if(i===0) pr = pts[n-2]; if(i===n-1) nx = pts[1]; }
    let a = pr ? nrm(pr,pt) : null, b = nx ? nrm(pt,nx) : null;
    a = a || b; b = b || a;
    let mx = a[0]+b[0], my = a[1]+b[1]; const ml = Math.hypot(mx,my)||1; mx/=ml; my/=ml;
    const k = dAt(i) / ((mx*a[0]+my*a[1]) || 1);
    return map.layerPointToLatLng(L.point(pt.x+mx*k, pt.y+my*k));
  });
}

// Brown and Purple are too dark to read on the dark basemap, so they get a light casing there.
const CASED = new Set(dark ? ['brown','purple'] : []);
const trackLayer = L.layerGroup().addTo(map);
function drawTracks(){
  trackLayer.clearLayers();
  // Subways first so the elevated lines draw on top; casings before all lines so they never cover a neighbor.
  const order = [...TRACKS].sort((x,y)=>(y.dash?1:0)-(x.dash?1:0)).map(t=>({t, ll:offsetPath(t.p, t.d||0)}));
  order.filter(({t})=>CASED.has(t.c)).forEach(({t,ll})=>
    trackLayer.addLayer(L.polyline(ll,{color:'#d8d8d8', weight:7, opacity:0.85, lineJoin:'round', interactive:false})));
  order.forEach(({t,ll})=>{
    const line = L.polyline(ll,{color:COLOR[t.c], weight:4, opacity:t.dash?0.8:0.95, dashArray:t.dash?'8 6':null, lineJoin:'round', interactive:false});
    trackLayer.addLayer(line);
    if(t.a && L.polylineDecorator){
      trackLayer.addLayer(L.polylineDecorator(line,{patterns:[{offset:30, repeat:70,
        symbol:L.Symbol.arrowHead({pixelSize:8, polygon:true, pathOptions:{color:COLOR[t.c], fillColor:COLOR[t.c], fillOpacity:1, weight:1, stroke:true}})}]}));
    }
  });
}
map.on('zoomend', drawTracks);
drawTracks();

const ICON = {y:'ti-elevator', n:'ti-stairs', c:'ti-barrier-block'};
const STATUS = {y:'Elevator access', n:'No elevator: stairs only', c:'Closed for reconstruction', out:'Elevator out of service'};
// Alerts like "The Howard-bound platform elevator..." cover one direction only.
const ONE_PLATFORM = /-bound\b[^.]*platform elevator/i;
let ALERTS = [];
const markers = [];

function alertsFor(s){
  const norm = x => String(x||'').toLowerCase().replace(/\s+/g,'');
  return ALERTS.filter(a => a.stations.some(x => String(x.id)===String(s.id) || (s.match && norm(x.name)===norm(s.match))));
}

function iconFor(s){
  const out = s.k==='y' && alertsFor(s).length > 0;
  return L.divIcon({className:'stn', iconSize:[24,24], iconAnchor:[12,12],
    html:`<span class="dot ${s.k}${out?' alert':''}"><i class="ti ${ICON[s.k]}"></i></span>`});
}

function popupFor(s){
  const chips = s.lines.map(l=>`<span class="chip${l==='pink'?' lt':''}" style="--c:${COLOR[l]}">${LINE_NAME[l]}</span>`).join('');
  const alerts = alertsFor(s), out = s.k==='y' && alerts.length > 0, st = out ? 'out' : s.k;
  const oneSide = out && alerts.some(a=>ONE_PLATFORM.test(`${a.headline} ${a.short}`));
  // The alert description already names the station and the elevator; the headline only repeats it.
  const al = alerts.map(a=>`<div class="al">${esc(a.short || a.headline)}</div>`).join('');
  const tip = oneSide ? `<div class="tip">Affects one platform only. You can use the other platform and change direction at a station below.</div>` : '';
  const list = (title, rows) => rows && rows.length ? `<div class="sec">${title}</div><ul>${rows.map(([n,d])=>`<li><b>${esc(n)}</b> <span class="d">${esc(d)}</span></li>`).join('')}</ul>` : '';
  const show = s.k==='n' || out;
  return `<div class="pop"><h3>${esc(s.name)}</h3><div class="chips">${chips}</div>
    <div class="st ${st}">${STATUS[st]}</div>${al}${tip}
    ${s.note?`<div class="note-p">${esc(s.note)}</div>`:''}
    ${show ? list('Nearest stations with elevators', s.alt) + list('Accessible buses', s.bus) : ''}</div>`;
}
function esc(t){return String(t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}

function metraPopup(s){
  const chips = s.lines.map(l=>`<span class="chip" style="--c:${METRA_COLOR[l][0]};color:${METRA_COLOR[l][1]}">${l}</span>`).join('');
  return `<div class="pop"><h3>${esc(s.name)}</h3><div class="chips">${chips}</div>
    <div>Metra station. Accessibility isn't shown here yet; check metra.com before you travel.</div></div>`;
}

// Station markers with name labels (labels shown at zoom 16+).
const labeled = [];
function addStation(s, icon, popup, z){
  const m = L.marker(s.ll,{icon, title:s.name, zIndexOffset:z}).addTo(map);
  m.bindPopup(popup);
  const dir = s.side||'right';
  m.bindTooltip(s.name,{permanent:true, direction:dir, className:'lbl', offset: dir==='left'?[-12,0]:dir==='right'?[12,0]:dir==='top'?[0,-12]:[0,12]});
  labeled.push(m);
  return m;
}
STATIONS.forEach(s=> markers.push({s, m:addStation(s, iconFor(s), ()=>popupFor(s), 1000)}));
const METRA_ICON = L.divIcon({className:'stn', iconSize:[24,24], iconAnchor:[12,12], html:'<span class="dot m"><i class="ti ti-train"></i></span>'});
METRA.forEach(s=> addStation(s, METRA_ICON, ()=>metraPopup(s), 900));

function updateLabels(){
  const show = map.getZoom() >= 16;
  labeled.forEach(m=> show ? m.openTooltip() : m.closeTooltip());
}
map.on('zoomend', updateLabels);
updateLabels();

// Alerts poll every 5 minutes. They count as stale after 15 minutes without a successful load (failed polls,
// or a phone that slept with the tab open); the last good alerts stay on the map, flagged in the panel header.
const POLL_MS = 5*60*1000, STALE_MS = 15*60*1000;
let lastOk = 0, checked = false;
const fmtTime = t => new Date(t).toLocaleTimeString([], {hour:'numeric', minute:'2-digit'});
function showStatus(){
  if(!checked) return;
  const el = document.getElementById('status'), badge = document.getElementById('stale');
  const stale = Date.now() - lastOk > STALE_MS;
  const hits = markers.filter(({s})=>s.k==='y' && alertsFor(s).length).map(({s})=>s.name);
  el.textContent = !lastOk ? 'Live elevator alerts unavailable. Check transitchicago.com before you travel.'
    : stale ? `Elevator alerts haven't updated since ${fmtTime(lastOk)} and may be out of date. Check transitchicago.com before you travel.`
    : hits.length ? `Elevator alerts at ${fmtTime(lastOk)}: ${hits.join(', ')}.` : `No elevator alerts on this map as of ${fmtTime(lastOk)}.`;
  el.classList.toggle('warn', stale);
  badge.hidden = !stale;
}
async function loadAlerts(){
  try{
    const r = await fetch('/api/elevators',{cache:'no-store'});
    if(!r.ok) throw new Error(r.status);
    const j = await r.json();
    ALERTS = j.alerts || [];
    lastOk = Date.now();
    markers.forEach(({s,m})=> m.setIcon(iconFor(s)));
  }catch(e){ /* keep the last good alerts; showStatus flags them once stale */ }
  checked = true;
  showStatus();
}
loadAlerts();
setInterval(loadAlerts, POLL_MS);
setInterval(showStatus, 60*1000);
// Background tabs throttle timers; refresh as soon as the page is visible again if a poll is overdue.
document.addEventListener('visibilitychange', ()=>{ if(!document.hidden && Date.now() - lastOk > POLL_MS) loadAlerts(); });

// Locate me: browser geolocation (HTTPS or localhost only). The position never leaves the browser.
// Own pane above the tracks (overlayPane 400, redrawn on every zoom) and below station markers (600).
map.createPane('me').style.zIndex = 450;
const me = L.layerGroup().addTo(map);
let locating = false, centered = false, hasFix = false;
const Locate = L.Control.extend({
  options:{position:'topright'},
  onAdd(){
    const box = L.DomUtil.create('div','leaflet-bar leaflet-control');
    const a = L.DomUtil.create('a','locate',box);
    a.href = '#'; a.title = 'Show my location'; a.setAttribute('role','button'); a.setAttribute('aria-label','Show my location');
    a.setAttribute('aria-pressed','false');
    a.innerHTML = '<i class="ti ti-current-location"></i>';
    L.DomEvent.disableClickPropagation(box);
    L.DomEvent.on(a,'click',e=>{ L.DomEvent.preventDefault(e); setLocating(!locating); });
    this._a = a;
    return box;
  }
});
const locate = new Locate().addTo(map);
function setLocating(on){
  locating = on;
  locate._a.classList.toggle('on', on);
  locate._a.setAttribute('aria-pressed', String(on));
  if(on){ centered = false; hasFix = false; map.locate({watch:true, enableHighAccuracy:true, maximumAge:15000}); }
  else { map.stopLocate(); me.clearLayers(); }
}
map.on('locationfound', e=>{
  hasFix = true;
  me.clearLayers();
  me.addLayer(L.circle(e.latlng,{radius:e.accuracy, className:'me-acc', interactive:false, pane:'me'}));
  me.addLayer(L.circleMarker(e.latlng,{radius:7, className:'me-dot', interactive:false, pane:'me'}));
  // Center once per activation, then let the user pan freely while the dot follows.
  if(!centered){ map.setView(e.latlng, Math.max(map.getZoom(),16)); centered = true; }
});
map.on('locationerror', e=>{
  // GPS drops out briefly on phones; after a good fix, keep watching and mark the dot stale instead of giving up.
  if(hasFix && e.code !== 1){ me.eachLayer(l=>l.getElement()?.classList.add('stale')); return; }
  setLocating(false);
  const why = e.code===1 ? 'Location permission was denied.' : e.code===3 ? 'Timed out finding your location.' : 'Your location is unavailable.';
  L.popup({className:'loc-err'}).setLatLng(map.getCenter()).setContent(esc(why)).openOn(map);
});

const panel = document.getElementById('panel');
document.getElementById('toggle').addEventListener('click', e=>{
  const c = panel.classList.toggle('collapsed');
  e.currentTarget.setAttribute('aria-expanded', String(!c));
});
if(innerWidth < 600) panel.classList.add('collapsed');
