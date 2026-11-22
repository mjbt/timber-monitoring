
(function(){
'use strict';
var SHEET='124hOv-oCvGGAl3BtGeaPh37d-Qf5kkHAspOYYAoWTrA';
var GV='https://docs.google.com/spreadsheets/d/'+SHEET+'/gviz/tq?tqx=out:csv&sheet=';
/* The sensor and weather tabs are fetched date-bounded rather than whole. At a
   five-minute reporting interval the sensor tab grows by about 2,300 rows a day,
   so an unbounded fetch would reach 20 MB by the end of October and 97 MB over a
   year, on every page load. Column A is stored as text, so the bound is a plain
   lexical comparison on the ISO-8601 timestamp, which orders correctly. WINDOW_DAYS
   must exceed the longest view the page draws from raw readings. */
var WINDOW_DAYS=75;
function since(days){
  var d=new Date(Date.now()-days*86400000);
  return d.toISOString().slice(0,10);
}
function GVQ(tab,days){
  if(!days) return GV+tab;
  return GV+tab+"&tq="+encodeURIComponent("select * where A >= '"+since(days)+"'");
}
var CH={}, DATA=null, VIEW='week', XMIN=null, XMAX=null;
/* Sensors at the 5 m ring, presented as one grouped series */
var RING=['MTS-74','MTS-75','MTS-78','MTS-79'];
/* Periods when a channel was disturbed by handling rather than by weather.
   Readings are retained in the record and suppressed from the charts only. */
/* Each sensor enters the record when it is installed in the building. Earlier
   readings exist (bench calibration, transit) and are excluded from the charts. */
var SERVICE_FROM={
  'MTS-74':Date.parse('2026-08-10T11:00:00Z'), 'MTS-75':Date.parse('2026-08-10T11:00:00Z'),
  'MTS-76':Date.parse('2026-08-10T11:00:00Z'), 'MTS-78':Date.parse('2026-08-10T11:00:00Z'),
  'MTS-79':Date.parse('2026-08-10T11:00:00Z'), 'MTS-80':Date.parse('2026-08-10T11:00:00Z'),
  /* MTS-81 was held at floor level beside MTS-77 until access to the king post was
     available, and duplicated that position. It enters the record at the king post. */
  'MTS-81':Date.parse('2026-09-22T12:50:00Z')
};
/* Days of king post record needed before its projection is drawn. */
var APEX_MIN_DAYS=3;
/* Probes that measure air rather than a surface: excluded from the
   condensation comparison, which compares surfaces against dew point. */
/* What each probe is against. Surfaces are dated, because probes are moved
   while the sensor body stays put, and a reading belongs to the surface the
   probe was on at that moment.
     sarking   timber beneath the lead: the roof timber line
     slab      floor slab
     platform  platform floor against a beam at the king post
     post      a post at the 5 m ring
     air       probe in free air: excluded from the condensation comparison
   Every surface except air counts towards the closest-to-condensation figure. */
var PROBE_BASE={
  'MTS-74':'sarking','MTS-75':'sarking','MTS-76':'sarking','MTS-78':'sarking',
  'MTS-79':'sarking','MTS-77':'slab','MTS-80':'air','MTS-81':'platform'
};
/* Probe moves. One line per move, in the order they happened. Time is local
   clock time with its offset: +01:00 in British Summer Time, +00:00 after
   25 October 2026. Remove the leading // to bring a line into effect.
   Example: {dev:'MTS-75', at:'2026-09-24T10:20:00+01:00', to:'post'}, */
var PROBE_MOVES=[
  // {dev:'MTS-7_', at:'2026-09-__T__:__:00+01:00', to:'post'},
  // {dev:'MTS-7_', at:'2026-09-__T__:__:00+01:00', to:'post'},
];
PROBE_MOVES.forEach(function(m){ m.x=Date.parse(m.at); });
function surfaceAt(dev,x){
  var s=PROBE_BASE[dev]||'sarking';
  PROBE_MOVES.forEach(function(m){ if(m.dev===dev && isFinite(m.x) && x>=m.x) s=m.to; });
  return s;
}
function onSarking(p){ return surfaceAt(p.dev,p.x)==='sarking'; }
function onSurface(p){ return surfaceAt(p.dev,p.x)!=='air'; }

function inService(p){
  var t=SERVICE_FROM[p.dev];
  return (t===undefined) || p.x>=t;
}

var RAIN_EXCLUDE=[[Date.parse('2026-08-10T07:30:00Z'), Date.parse('2026-08-10T09:30:00Z')]];
function rainMasked(x){
  for(var i=0;i<RAIN_EXCLUDE.length;i++){
    if(x>=RAIN_EXCLUDE[i][0] && x<=RAIN_EXCLUDE[i][1]) return true;
  }
  return false;
}
/* Review points dividing the day into twelve-hour windows. Conditions are
   assessed at these times for the window that follows; any action falls
   somewhere within that window. 24-hour clock, local time. */
var DECISION_HOURS=[6,18];

/* Rainfall is derived from the gauge's cumulative total, not from its reported
   rate. The gauge is an imperial tipping bucket of 0.254 mm (0.01 in) per tip on
   a lifetime accumulator whose origin predates the record, and the rate it
   reports is the tip increment divided by the interval since the previous tip:
   a single tip after a long dry spell reads near zero, and two tips seconds
   apart read hundreds of mm/h. Neither is a physical rate. Increments are taken
   from the accumulator instead, positive only, with any increment spanning an
   excluded window discarded rather than carried across it. p.rain is then the
   depth fallen in the hour ending at each sample, in mm, which is a true rate
   and is directly comparable with the forecast series. */
function deriveRain(list){
  var prev=null;
  list.forEach(function(p){
    p.inc=0;
    if(!isFinite(p.racc)){ return; }
    if(p.rmask){ prev=null; return; }
    if(prev!==null){
      var d=p.racc-prev;
      if(d>0.0001 && d<50) p.inc=d;   /* negative = counter reset; >50 mm = not a tip sequence */
    }
    prev=p.racc;
  });
  var i=0;
  list.forEach(function(p,j){
    while(list[i].x < p.x-3600000) i++;
    var s=0;
    for(var k=i;k<=j;k++) s+=list[k].inc;
    p.rain=+s.toFixed(3);
  });
  return list;
}
function rainDaily(list){
  var by={};
  list.forEach(function(p){
    var d=new Date(p.x); d.setHours(12,0,0,0); var k=d.getTime();
    if(!by[k]) by[k]={x:k,y:0};
    by[k].y+=p.inc;
  });
  return Object.keys(by).map(function(k){var o=by[k];o.y=+o.y.toFixed(2);return o;})
         .sort(function(a,b){return a.x-b.x;});
}

function note(msg){var el=document.getElementById('updated'); if(el) el.textContent=msg;}

function parseLine(line){
  var out=[],cur='',q=false;
  for(var i=0;i<line.length;i++){var ch=line[i];
    if(ch==='"'){q=!q;continue;}
    if(ch===','&&!q){out.push(cur);cur='';}else{cur+=ch;}}
  out.push(cur);return out;
}
function csv(text){
  var lines=text.replace(/\r/g,'').trim().split('\n');
  if(lines.length<2) return [];
  var head=parseLine(lines[0]);
  return lines.slice(1).map(function(l){
    var c=parseLine(l),o={}; head.forEach(function(hd,i){o[hd]=c[i];}); return o;});
}
function svd(t){var es=6.112*Math.exp(17.62*t/(243.12+t));return 216.7*es/(273.15+t);}
function dew(t,rh){var g=Math.log(rh/100)+17.62*t/(243.12+t);return 243.12*g/(17.62-g);}
function thin(arr,minGapMin){
  var out=[],last=-1e18;
  for(var i=0;i<arr.length;i++){ if(arr[i].x-last>=minGapMin*60000){out.push(arr[i]);last=arr[i].x;} }
  return out;
}
function cssvar(n){return getComputedStyle(document.documentElement).getPropertyValue(n).trim()||'#666';}

function opts(extra){
  var o = {responsive:true,maintainAspectRatio:false,animation:false,
    interaction:{mode:'nearest',intersect:false},
    plugins:{
      legend:{labels:{font:{family:"'Source Serif 4',serif"},boxWidth:14,color:cssvar('--ink'),
        filter:function(item){
          if(!item.text || item.text.charAt(0)==='_') return false;
          if(window.innerWidth<560 && /ahead/i.test(item.text)) return false;
          return true;
        }}},
      tooltip:{
        /* Constrained so it cannot sit over the plot it is describing: on a
           phone the default box covered a third of the chart. */
        position:'nearest',caretPadding:8,
        bodyFont:{size:12},titleFont:{size:12},
        padding:{top:7,bottom:7,left:9,right:9},
        boxWidth:9,boxHeight:9,
        filter:function(item){return item.dataset.label && item.dataset.label.charAt(0)!=='_';},
        callbacks:{
          title:function(items){
            if(!items.length) return '';
            var d=new Date(items[0].parsed.x);
            return (VIEW==='outlook'||VIEW==='now')
              ? d.toLocaleString('en-GB',{weekday:'short',hour:'2-digit',minute:'2-digit'})
              : d.toLocaleDateString('en-GB',{weekday:'short',day:'2-digit',month:'short'});
          }
        }
      }
    },
    scales:{
      x:{type:'linear',
         ticks:{color:cssvar('--ink'),font:{size:11},maxTicksLimit:(function(){
             var narrow=window.innerWidth<560;
             if(VIEW==='now')     return narrow?5:11;
             if(VIEW==='outlook') return narrow?4:7;
             if(VIEW==='week')    return narrow?4:8;
             return narrow?4:7;
           })(),
           callback:function(val){var d=new Date(val);
             if(VIEW==='outlook'){
               return d.toLocaleDateString('en-GB',{weekday:'short'})+' '+
                      String(d.getHours()).padStart(2,'0')+':00';
             }
             if(VIEW==='now'){
               /* Two days wide, so a bare hour is ambiguous: 20:00 appears twice.
                  Weekday at midnight and at noon, hour alone elsewhere. */
               var h=d.getHours();
               return (h===0||h===12)
                 ? d.toLocaleDateString('en-GB',{weekday:'short'})+' '+String(h).padStart(2,'0')+':00'
                 : String(h).padStart(2,'0')+':00';
             }
             if(VIEW==='week'){
               return d.toLocaleDateString('en-GB',{weekday:'short'});
             }
             return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short'});}},
         grid:{display:false}},
      y:{ticks:{color:cssvar('--ink'),font:{size:11}},grid:{color:'rgba(137,135,129,.18)'}}}};
  if(extra&&extra.zero){o.scales.y.suggestedMin=0;}
  if(XMIN!==null){ o.scales.x.min=XMIN; }
  if(XMAX!==null){ o.scales.x.max=XMAX; }
  return o;
}
function mk(id,sets,plugins,extra){
  var el=document.getElementById(id); if(!el) return;
  if(CH[id]){CH[id].destroy(); delete CH[id];}
  CH[id]=new Chart(el,{type:'line',plugins:plugins||[],data:{datasets:sets},options:opts(extra)});
}
function ds(points,key){
  return points.filter(function(p){return isFinite(p[key]);})
               .map(function(p){return {x:p.x,y:p[key]};});
}
/* Sunlight and wind are drivers rather than states, and at reporting resolution
   both are visual noise: a passing cloud or a gust says nothing about what the
   building is doing. Both are binned to a mean before plotting, at an interval
   set by the view, so the line carries the shape of the day rather than every
   flutter. The other charts are left alone; there the small movements are the
   subject. */
function binMean(points,key,minutes){
  var w=minutes*60000, by={};
  points.forEach(function(p){
    var v=(typeof key==='function')?key(p):p[key];
    if(!isFinite(v)||!isFinite(p.x)) return;
    var k=Math.floor(p.x/w)*w;
    if(!by[k]) by[k]={s:0,n:0};
    by[k].s+=v; by[k].n++;
  });
  return Object.keys(by).map(function(k){
    return {x:+k+w/2, y:+(by[k].s/by[k].n).toFixed(3)};
  }).sort(function(a,b){return a.x-b.x;});
}
function ah(p){return +(svd(p.t)*p.rh/100).toFixed(2);}
function pairAH(inn,out){
  if(!out.length) return [];
  var xs=out.map(function(p){return p.x;});
  return inn.map(function(p){
    var i=0,lo=0,hi=xs.length-1;
    while(lo<=hi){var mid=(lo+hi)>>1; if(xs[mid]<p.x){lo=mid+1;}else{hi=mid-1;}}
    i=lo;
    if(i===0||i>=xs.length) return null;
    var x0=xs[i-1],x1=xs[i];
    if(x1-x0>3*3600000) return null;
    var f=(p.x-x0)/(x1-x0);
    var o=out[i-1], o2=out[i];
    var ov=ah(o)+f*(ah(o2)-ah(o));
    return {x:p.x, inv:ah(p), outv:+ov.toFixed(2)};
  }).filter(function(v){return v&&isFinite(v.outv);});
}

function pairAHv(innAH,out){
  if(!out.length) return [];
  var os=out.map(function(p){return {x:p.x,v:svd(p.t)*p.rh/100};});
  var res=[];
  innAH.forEach(function(p){
    var o=interpAt(os,p.x);
    if(o!==null) res.push({x:p.x,inv:+p.ahv.toFixed(2),outv:+o.toFixed(2)});
  });
  return res;
}

function ahTargetPlugin(pairs){
  /* pairs: {x, inv, outv} - interior and exterior moisture content
     on a common time base. */
  return {id:'ahtarget', beforeDatasetsDraw:function(c){
    var ar=c.chartArea, xs=c.scales.x, ys=c.scales.y;
    if(!ar||!pairs.length) return;
    var ctx=c.ctx;

    /* Split the series into contiguous runs on one side of the crossing,
       interpolating the exact crossing point at each end, then fill the
       polygon between the two curves over that run. */
    function px(v){return xs.getPixelForValue(v);}
    function py(v){return ys.getPixelForValue(v);}
    function cross(a,b){                     /* a,b adjacent pairs that straddle */
      var d0=a.outv-a.inv, d1=b.outv-b.inv;
      var f=(d1-d0)===0?0:(-d0/(d1-d0));
      f=Math.max(0,Math.min(1,f));
      return {x:a.x+f*(b.x-a.x), v:a.inv+f*(b.inv-a.inv)};
    }
    function runs(above){
      var out=[],cur=null;
      for(var i=0;i<pairs.length;i++){
        var p=pairs[i], on = above ? (p.outv>p.inv) : (p.outv<p.inv);
        if(on){
          if(!cur){
            cur={pts:[]};
            if(i>0){var c=cross(pairs[i-1],p); cur.pts.push({x:c.x,inv:c.v,outv:c.v});}
          }
          cur.pts.push(p);
        } else if(cur){
          var c2=cross(pairs[i-1],p);
          cur.pts.push({x:c2.x,inv:c2.v,outv:c2.v});
          out.push(cur); cur=null;
        }
      }
      if(cur) out.push(cur);
      return out;
    }
    function fillRuns(above,colour){
      ctx.save(); ctx.fillStyle=colour;
      runs(above).forEach(function(r){
        if(r.pts.length<2) return;
        ctx.beginPath();
        r.pts.forEach(function(p,i){ i?ctx.lineTo(px(p.x),py(p.inv)):ctx.moveTo(px(p.x),py(p.inv)); });
        for(var k=r.pts.length-1;k>=0;k--){ ctx.lineTo(px(r.pts[k].x),py(r.pts[k].outv)); }
        ctx.closePath(); ctx.fill();
      });
      ctx.restore();
    }

    /* exterior wetter than interior: exchange would raise moisture */
    fillRuns(true,  'rgba(29,158,117,.26)');
    /* exterior drier than interior: exchange would lower it */
    fillRuns(false, 'rgba(176,83,47,.20)');

    /* labels */
    if((ar.right-ar.left)>430){
      ctx.save();
      ctx.font="italic 10.5px 'Source Serif 4', Georgia, serif";
      ctx.textAlign='left';
      ctx.fillStyle='rgba(29,158,117,.95)';
      ctx.fillText('outside air wetter: humidifying potential', ar.left+8, ar.bottom-30);
      ctx.fillStyle='rgba(176,83,47,.95)';
      ctx.fillText('outside air drier: drying potential', ar.left+8, ar.bottom-17);
      ctx.restore();
    }
  }};
}

/* Group readings from several sensors into mean, min and max per time bucket */
function group(arr,key,bucketMin){
  var b={}, w=bucketMin*60000;
  arr.forEach(function(p){
    var v=(typeof key==='function')?key(p):p[key];
    if(!isFinite(v)) return;
    var k=Math.round(p.x/w)*w;
    if(!b[k]) b[k]={x:k,sum:0,n:0,lo:v,hi:v};
    b[k].sum+=v; b[k].n++;
    if(v<b[k].lo) b[k].lo=v;
    if(v>b[k].hi) b[k].hi=v;
  });
  return Object.keys(b).map(function(k){var o=b[k]; o.mean=o.sum/o.n; return o;})
          .sort(function(a,b2){return a.x-b2.x;});
}
function gser(g,f){return g.map(function(o){return {x:o.x,y:+o[f].toFixed(2)};});}

/* Group several sensors onto a common grid by interpolating each one first,
   so every point averages the same set of instruments. Without this, sensors
   reporting at staggered times give a sawtooth as bucket membership changes. */
function groupDev(arr,key,bucketMin){
  var devs={}, w=bucketMin*60000;
  arr.forEach(function(p){
    var v=(typeof key==='function')?key(p):p[key];
    if(!isFinite(v)) return;
    (devs[p.dev]=devs[p.dev]||[]).push({x:p.x,v:v});
  });
  var names=Object.keys(devs);
  if(!names.length) return [];
  names.forEach(function(d){devs[d].sort(function(a,b){return a.x-b.x;});});
  var lo=Math.min.apply(null,names.map(function(d){return devs[d][0].x;}));
  var hi=Math.max.apply(null,names.map(function(d){return devs[d][devs[d].length-1].x;}));
  var out=[];
  for(var t=Math.ceil(lo/w)*w; t<=hi; t+=w){
    var vals=[];
    for(var i=0;i<names.length;i++){
      var v=interpAt(devs[names[i]],t);
      if(v!==null) vals.push(v);
    }
    if(!vals.length) continue;
    var sum=0,mn=vals[0],mx=vals[0];
    vals.forEach(function(v){sum+=v; if(v<mn)mn=v; if(v>mx)mx=v;});
    out.push({x:t,mean:sum/vals.length,lo:mn,hi:mx,n:vals.length});
  }
  return out;
}

/* Light centred rolling mean: takes the edge off sensor jitter without
   moving the curve. Window is in points, always odd. */
function smooth(series,win){
  if(!series.length||win<3) return series;
  var half=(win-1)/2;
  return series.map(function(p,i){
    var s=0,n=0;
    for(var j=i-half;j<=i+half;j++){
      if(j<0||j>=series.length) continue;
      if(!isFinite(series[j].y)) continue;
      s+=series[j].y; n++;
    }
    return {x:p.x,y:n?+(s/n).toFixed(2):p.y};
  });
}

/* A sensor that drops uplinks leaves holes in its record. Chart.js would join the
   readings either side with a straight line, which draws data that was never measured.
   A null at each hole breaks the line instead, so the chart shows only what was read. */
function breakGaps(series,maxMs){
  var out=[];
  for(var i=0;i<series.length;i++){
    if(i && series[i].x-series[i-1].x>maxMs) out.push({x:series[i-1].x+1,y:null});
    out.push(series[i]);
  }
  return out;
}

/* Where the king post sensor is silent, an estimate drawn dotted: the mid-height
   reading at that moment plus the offset between the king post and mid height over
   the twelve hours before the gap. The two sensors share the same column of air, so
   the offset moves slowly. The estimate joins the measured line at each end of the
   gap and is never used in any calculation. */
/* Rolling mean that never reaches across a gap: each run of readings is
 smoothed on its own, so a line does not hook towards the far side of a gap. */
function smoothSeg(series,win,maxMs){
 var out=[],run=[];
 function flush(){ if(run.length){ out=out.concat(smooth(run,win)); run=[]; } }
 for(var i=0;i<series.length;i++){
  if(i && series[i].x-series[i-1].x>maxMs) flush();
  run.push(series[i]);
 }
 flush();
 return out;
}

/* The projections and the forecast are made by separate models from the
 readings, so where they start they rarely sit exactly on the last measured
 value. Each broken line is therefore drawn from the last reading, and the
 difference between the model and that reading is let go over a few hours,
 so the line hands over from measurement to projection without a step. */
function lastPt(){
 var best=null;
 for(var i=0;i<arguments.length;i++){
  var a=arguments[i]||[];
  for(var j=a.length-1;j>=0;j--){
   if(a[j]&&isFinite(a[j].y)&&a[j].y!==null){ if(!best||a[j].x>best.x) best=a[j]; break; }
  }
 }
 return best;
}
function joinAhead(m,ahead,tauH,lo,hi){
 if(!m||!ahead||!ahead.length) return ahead||[];
 var a=ahead.filter(function(p){return p.x>m.x&&isFinite(p.y);});
 if(!a.length) return ahead;
 var d=m.y-a[0].y, w=tauH*3600000;
 var out=[{x:m.x,y:m.y}];
 a.forEach(function(p){
  var y=p.y+d*Math.exp(-(p.x-m.x)/w);
  if(lo!==undefined) y=Math.max(lo,y);
  if(hi!==undefined) y=Math.min(hi,y);
  out.push({x:p.x,y:+y.toFixed(2)});
 });
 return out;
}

function kpFill(high,mid,maxMs){
 var hp=high.filter(function(p){return isFinite(p.y);});
 var ms=mid.filter(function(p){return isFinite(p.y);}).map(function(p){return {x:p.x,v:p.y};});
 if(hp.length<2||ms.length<6) return [];
 var d=[];
 hp.forEach(function(p){var m=interpAt(ms,p.x); if(m!==null) d.push({x:p.x,v:p.y-m});});
 if(!d.length) return [];
 /* Offset between the king post and mid height, averaged over the hour on one
  side of a gap edge, widening to twelve hours if the hour holds nothing. */
 function deltaNear(t,dir){
  var spans=[3600000,12*3600000];
  for(var k=0;k<spans.length;k++){
   var s=0,n=0;
   d.forEach(function(e){
    var off=(e.x-t)*dir;
    if(off>=0&&off<=spans[k]){ s+=e.v; n++; }
   });
   if(n) return s/n;
  }
  return null;
 }
 var out=[];
 /* The estimate leaves the last measured point and arrives at the next one:
  the offset is carried across the gap, blending from its value before the
  gap to its value after, so the dashed line meets the measured line at both
  ends instead of stepping onto it. */
 function fillGap(a,b,ya,yb){
  var da=deltaNear(a,-1); if(da===null) return;
  var db=(yb!==null)?deltaNear(b,1):null; if(db===null) db=da;
  var mA=interpAt(ms,a), mB=(yb!==null)?interpAt(ms,b):null;
  if(mA!==null) da=ya-mA;
  if(mB!==null) db=yb-mB;
  var seg=[{x:a,y:ya}];
  ms.forEach(function(m){
   if(m.x>a&&m.x<b){
    var f=(m.x-a)/(b-a);
    seg.push({x:m.x,y:+(m.v+da+(db-da)*f).toFixed(2)});
   }
  });
  if(yb!==null) seg.push({x:b,y:yb});
  if(seg.length<2) return;
  out=out.concat(seg);
  out.push({x:seg[seg.length-1].x+1,y:null});
 }
 for(var i=1;i<hp.length;i++){
  if(hp[i].x-hp[i-1].x>maxMs) fillGap(hp[i-1].x,hp[i].x,hp[i-1].y,hp[i].y);
 }
 var lastH=hp[hp.length-1], lastM=ms[ms.length-1];
 if(lastM.x-lastH.x>maxMs) fillGap(lastH.x,lastM.x+1,lastH.y,null);
 return out;
}

/* On the margin chart, everything below zero is condensation: shade it. */
var wetZone={id:'wetzone',beforeDatasetsDraw:function(c){
  var ar=c.chartArea, y=c.scales.y; if(!ar||!y) return;
  var y0=y.getPixelForValue(0); if(y0>=ar.bottom) return;
  var top=Math.max(ar.top,y0), ctx=c.ctx;
  ctx.save(); ctx.fillStyle='rgba(140,47,47,.10)';
  ctx.fillRect(ar.left,top,ar.right-ar.left,ar.bottom-top);
  ctx.fillStyle='rgba(140,47,47,.75)'; ctx.font='italic 11px "Source Serif 4", Georgia, serif';
  if(ar.bottom-top>14) ctx.fillText('Condensation',ar.left+6,top+13);
  ctx.restore();
}};

function marginOf(p){return isFinite(p.p)? +(p.p-dew(p.t,p.rh)).toFixed(2) : NaN;}

/* daily envelope: min, mean, max per calendar day */
function daily(arr,fn){
  var by={};
  arr.forEach(function(p){
    var v=fn(p); if(!isFinite(v)) return;
    var d=new Date(p.x); d.setHours(12,0,0,0);
    var k=d.getTime();
    if(!by[k]) by[k]={x:k,lo:v,hi:v,sum:0,n:0};
    by[k].lo=Math.min(by[k].lo,v); by[k].hi=Math.max(by[k].hi,v);
    by[k].sum+=v; by[k].n++;
  });
  return Object.keys(by).map(function(k){var o=by[k];o.mean=o.sum/o.n;return o;})
         .sort(function(a,b){return a.x-b.x;});
}
/* central moving average over windowDays, per EN 15757 method */
function movingAvg(days,windowDays){
  var half=windowDays/2*86400000;
  return days.map(function(d){
    var s=0,n=0;
    days.forEach(function(e){ if(Math.abs(e.x-d.x)<=half){s+=e.mean;n++;} });
    return {x:d.x,y:+(s/n).toFixed(2)};
  });
}
function bandData(days,key){return days.map(function(d){return {x:d.x,y:+d[key].toFixed(2)};});}

/* Fit dS/dt = k(driver - S) + c  [per hour] from measured history */
/* Cloud cover from the reference station's raw report. The aviation groups give
   eighths of sky covered; NCD and CAVOK mean no cloud detected. Kept because
   clear nights, not humidity, turned out to be the largest measured influence on
   how close the coldest surfaces come to their dew point. */
/* Would opening the building up today make it wetter or drier?
   The comparison is between the moisture the outside air carries and the moisture
   the inside air carries, never between relative humidities: cold air at ninety per
   cent holds less water than warm air at fifty. Each forecast day is weighted by the
   exchange actually available, since still air with a small temperature difference
   moves very little whatever it holds. One decision per day, not an hourly control. */
function buildVerdict(){
  var box=document.getElementById('verdict');
  if(!box||!DATA||!DATA.fc||!DATA.fc.length||!DATA.inn.length) return;

  /* Interior series carry temperature and humidity; vapour concentration is derived
     here as it is everywhere else on the page. */
  var cut=Date.now()-2*3600000, n=0, ahi=0, ti=0;
  DATA.inn.forEach(function(p){
    if(p.x>=cut&&isFinite(p.t)&&isFinite(p.rh)){ ahi+=svd(p.t)*p.rh/100; ti+=p.t; n++; }
  });
  if(!n) return;
  ahi/=n; ti/=n;

  /* The decision is taken twice a day rather than once, because the moisture in the
     outside air swings with the daily cycle and because someone opens the building in
     the morning and closes it in the evening. Morning runs 06:00 to 12:00 and evening
     15:00 to 21:00; the two periods shown are the next two that have not yet ended, so
     the panel rolls to the following morning once the evening is past. */
  var MORN=[6,12], EVE=[15,21], now=Date.now();
  var slots={};
  DATA.fc.forEach(function(p){
    if(!isFinite(p.t)||!isFinite(p.rh)) return;
    var d=new Date(p.x), h=d.getHours(), which=null;
    if(h>=MORN[0]&&h<MORN[1]) which='morning';
    else if(h>=EVE[0]&&h<EVE[1]) which='evening';
    if(!which) return;
    var end=new Date(p.x);
    end.setHours(which==='morning'?MORN[1]:EVE[1],0,0,0);
    if(end.getTime()<=now) return;
    var k=end.getTime();
    if(!slots[k]){
      var st=new Date(p.x); st.setHours(which==='morning'?MORN[0]:EVE[0],0,0,0);
      slots[k]={end:k,start:st.getTime(),which:which,s:0,sw:0,n:0};
    }
    var ah=svd(p.t)*p.rh/100;
    var w=Math.sqrt(0.35*Math.max(0,ti-p.t)+0.5*Math.pow(isFinite(p.wind)?p.wind:3,2));
    slots[k].s+=ah*w; slots[k].sw+=w; slots[k].n++;
  });

  var days=Object.keys(slots).map(function(k){return slots[k];})
             .filter(function(d){return d.n>=2&&d.sw>0;})
             .sort(function(a,b){return a.start-b.start;})
             .slice(0,2);
  if(!days.length) return;

  function slotLabel(d){
    var st=new Date(d.start), today=new Date(), tom=new Date(Date.now()+86400000);
    var same=function(a,b){return a.toDateString()===b.toDateString();};
    var when=same(st,today)?'This':(same(st,tom)?'Tomorrow':
      st.toLocaleDateString('en-GB',{weekday:'long'}));
    var word=(d.which==='morning')?'morning':'evening';
    if(when==='This'&&word==='evening') return 'This evening';
    if(when==='This') return 'This morning';
    if(when==='Tomorrow') return 'Tomorrow '+word;
    return when+' '+word;
  }

  /* Three positions, because that is what a cord and cleat actually offer: shut,
     a working half, and wide. The size of the moisture difference decides how far,
     not merely which way. */
  function position(diff){
    if(diff<-0.15) return 'Drier out';
    if(diff>=0.75) return 'Wetter out';
    return 'Little in it';
  }
  /* The drum's own humidity is not forecast, only the weather outside it. The call
     below is an estimate: the weighted outside moisture for the slot blended half and
     half with the moisture measured inside, read as a relative humidity at the drum's
     present temperature. It is drawn as an estimate and marked as one. */
  function heatCall(rh){ return rh<70 ? 'No heating required' : 'Heating beneficial'; }

  var rows='';
  days.forEach(function(d){
    var diff=d.s/d.sw-ahi;
    var ahP=0.5*(d.s/d.sw)+0.5*ahi;
    var rhP=Math.max(0,Math.min(100,100*ahP/svd(ti)));
    rows+='<tr><td>'+slotLabel(d)+'</td><td class="call">'+position(diff)+'</td><td>'+
          (diff>0?'+':'')+diff.toFixed(1)+' g/m<sup>3</sup></td>'+
          '<td class="est">'+heatCall(rhP)+', mean RH '+rhP.toFixed(0)+'%</td></tr>';
  });
  document.getElementById('verdictDays').innerHTML=rows;

  var d0=days[0], diff0=d0.s/d0.sw-ahi;
  var pos0=position(diff0);
  document.getElementById('verdictCall').textContent =
    (pos0==='Drier out')?'Drier outside.':(pos0==='Wetter out'?'Wetter outside.':'Little in it.');
  var eo=(d0.s/d0.sw).toFixed(1), ei=ahi.toFixed(1);
  document.getElementById('verdictWhy').innerHTML =
    (pos0==='Drier out')
      ? eo+' g of water per cubic metre outside against '+ei+' in: exchange would take moisture out '+
        'of the building.'
      : (pos0==='Wetter out'
        ? eo+' outside against '+ei+' in, in grams per cubic metre: exchange would carry moisture in, '+
          'and the fabric would follow it.'
        : 'About '+eo+' outside against '+ei+' in, in grams per cubic metre. Little in it either way.');
  /* And the heating. Not a recommendation either: the point is to show, through the
     autumn, the conditions under which heat starts to earn its place, so that when
     the record reaches the cold months a reader has watched the case build rather
     than meeting it as an assertion. */
  var rhNow=0, mNow=null, cnt=0;
  DATA.inn.forEach(function(p){
    if(p.x>=cut&&isFinite(p.rh)){ rhNow+=p.rh; cnt++; }
  });
  if(cnt){
    rhNow/=cnt;
    var state;
    if(rhNow<70){
      state='<b>No heating required.</b> At a mean relative humidity of '+rhNow.toFixed(0)+
            ' per cent the drum is clear of the 80 per cent at which mould can germinate.';
    } else if(rhNow<75){
      state='<b>Heating beneficial.</b> At a mean relative humidity of '+rhNow.toFixed(0)+
            ' per cent a few degrees of warmth would add no water and lower the humidity at every surface at once.';
    } else if(rhNow<80){
      state='<b>Heating beneficial.</b> At a mean relative humidity of '+rhNow.toFixed(0)+
            ' per cent the drum is close to the 80 per cent at which mould can germinate.';
    } else {
      state='<b>Heating beneficial.</b> At a mean relative humidity of '+rhNow.toFixed(0)+
            ' per cent the drum is at the level at which mould can germinate.';
    }
    var heat='<span class="heat-label">Conservation heating</span> '+state+' Temporary, reversible '+
         'heating would answer it. The building was heated continuously from the 1860s boiler house '+
         'until the museum left in 2001.';
    var he=document.getElementById('verdictHeat');
    if(he) he.innerHTML=heat;
  }

  box.hidden=false;
}

function oktaOf(raw){
  if(typeof raw!=='string') return NaN;
  if(/\b(NCD|CAVOK|SKC|CLR|NSC)\b/.test(raw)) return 0;
  var v=NaN;
  [['FEW',0.2],['SCT',0.45],['BKN',0.75],['OVC',1.0]].forEach(function(g){
    if(raw.indexOf(g[0])>=0) v=isNaN(v)?g[1]:Math.max(v,g[1]);
  });
  return v;
}
/* Measured cloud behind the present moment, forecast cloud ahead of it. */
function cloudAt(x){
  if(x>Date.now()&&DATA.fc&&DATA.fc.length){
    var f=interpAt(DATA.fc.map(function(p){return {x:p.x,v:p.cloud};}),x);
    if(f!==null) return Math.min(1,Math.max(0,f/100));
  }
  if(DATA.ref&&DATA.ref.length){
    var r=DATA.ref.filter(function(p){return isFinite(p.cloud);})
                  .map(function(p){return {x:p.x,v:p.cloud};});
    var c=interpAt(r,x);
    if(c!==null) return Math.min(1,Math.max(0,c));
  }
  return 0.5;
}
/* Least squares for a first-order pull plus extra driving terms:
   d(state)/dt = c + k*(driver - state) + sum(b_i * extra_i) */
function fitMulti(state,driver,extras){
  var rows=[],ys=[];
  for(var i=1;i<state.length;i++){
    var dt=(state[i].x-state[i-1].x)/3600000;
    if(dt<=0||dt>3) continue;
    var d=interpAt(driver,state[i-1].x);
    if(d===null) continue;
    var row=[1,d-state[i-1].v],ok=true;
    for(var e=0;e<extras.length;e++){
      var v=extras[e](state[i-1].x);
      if(v===null||!isFinite(v)){ok=false;break;}
      row.push(v);
    }
    if(!ok) continue;
    rows.push(row); ys.push((state[i].v-state[i-1].v)/dt);
  }
  var m=rows.length, w=2+extras.length;
  if(m<20) return null;
  var A=[],b=[];
  for(var r0=0;r0<w;r0++){
    A.push(new Array(w).fill(0)); b.push(0);
    for(var q=0;q<m;q++){
      for(var c0=0;c0<w;c0++) A[r0][c0]+=rows[q][r0]*rows[q][c0];
      b[r0]+=rows[q][r0]*ys[q];
    }
  }
  for(var col=0;col<w;col++){
    var piv=col;
    for(var rr=col+1;rr<w;rr++) if(Math.abs(A[rr][col])>Math.abs(A[piv][col])) piv=rr;
    if(Math.abs(A[piv][col])<1e-12) return null;
    var tA=A[col];A[col]=A[piv];A[piv]=tA; var tb=b[col];b[col]=b[piv];b[piv]=tb;
    for(var rr2=0;rr2<w;rr2++){
      if(rr2===col) continue;
      var f=A[rr2][col]/A[col][col];
      for(var cc=col;cc<w;cc++) A[rr2][cc]-=f*A[col][cc];
      b[rr2]-=f*b[col];
    }
  }
  var sol=[];
  for(var z=0;z<w;z++) sol.push(b[z]/A[z][z]);
  if(!sol.every(isFinite)) return null;
  return {c:sol[0],k:sol[1],b:sol.slice(2)};
}
/* Mean absolute error of the fitted model rolled forward H hours from every
   start point in the record. This is the quantity the projection is judged on,
   so it is the quantity the lag search minimises. */
function rollError(state,driver,lagged,f,H){
  var n=state.length, steps=0, tot=0, cnt=0;
  for(var i=0;i<n;i++){
    var tEnd=state[i].x+H*3600000;
    if(state[n-1].x<tEnd) break;
    var T=state[i].v, x=state[i].x, guard=0;
    while(x<tEnd&&guard++<400){
      var dt=Math.min(1,(tEnd-x)/3600000);
      var d=interpAt(driver,x), sv=interpAt(lagged,x);
      if(d===null||sv===null){ T=null; break; }
      T+=dt*(f.c+f.k*(d-T)+f.b[0]*sv);
      x+=dt*3600000;
    }
    if(T===null||!isFinite(T)) continue;
    var act=interpAt(state,tEnd);
    if(act===null) continue;
    tot+=Math.abs(T-act); cnt++;
  }
  return cnt>=10?tot/cnt:null;
}
/* As rollError, for the model that carries the thermal store of the drum and ground:
   two further terms, the interior temperature itself and the slow outside average. */
function rollErrorMass(state,driver,lagged,f,H){
  var n=state.length, tot=0, cnt=0;
  for(var i=0;i<n;i+=6){
    var tEnd=state[i].x+H*3600000;
    if(state[n-1].x<tEnd) break;
    var T=state[i].v, x=state[i].x, guard=0;
    while(x<tEnd&&guard++<400){
      var dt=Math.min(1,(tEnd-x)/3600000);
      var d=interpAt(driver,x), sv=interpAt(lagged,x), so=slowAtGlobal(x);
      if(d===null||sv===null||so===null){ T=null; break; }
      T+=dt*(f.c+f.k*(d-T)+f.b[0]*sv+f.b[1]*T+f.b[2]*so);
      x+=dt*3600000;
    }
    if(T===null||!isFinite(T)) continue;
    var act=interpAt(state,tEnd);
    if(act===null) continue;
    tot+=Math.abs(T-act); cnt++;
  }
  return cnt>=10?tot/cnt:null;
}
var SLOW_OUT=null;
function slowAtGlobal(x){ return SLOW_OUT?interpAt(SLOW_OUT,x):null; }
function fitK(state,driver){
  var xs=[],ys=[];
  for(var i=1;i<state.length;i++){
    var dt=(state[i].x-state[i-1].x)/3600000;
    if(dt<=0||dt>3) continue;
    var d=interpAt(driver,state[i-1].x);
    if(d===null) continue;
    xs.push(d-state[i-1].v);
    ys.push((state[i].v-state[i-1].v)/dt);
  }
  var n=xs.length;
  if(n<10) return {k:1/24,c:0};
  var sx=0,sy=0,sxx=0,sxy=0;
  for(var j=0;j<n;j++){sx+=xs[j];sy+=ys[j];sxx+=xs[j]*xs[j];sxy+=xs[j]*ys[j];}
  var k=(n*sxy-sx*sy)/(n*sxx-sx*sx||1);
  var c=(sy-k*sx)/n;
  if(!isFinite(k)||k<=0.002||k>2) return {k:1/24,c:0};
  return {k:k,c:c};
}
function interpAt(series,x){
  var lo=0,hi=series.length-1;
  if(hi<1||x<series[0].x||x>series[hi].x) return null;
  while(hi-lo>1){var mid=(lo+hi)>>1; if(series[mid].x<=x) lo=mid; else hi=mid;}
  var a=series[lo],b=series[hi];
  if(b.x-a.x>75*60000) return null;
  return a.v+(b.v-a.v)*(x-a.x)/(b.x-a.x);
}
function toSeries(arr,key){return arr.filter(function(p){return isFinite(p[key]);})
  .map(function(p){return {x:p.x,v:p[key]};});}

/* Stratification within the drum, and the shift from the floor sensor to each
   level displayed.

   The projection is fitted on the floor sensor, which holds the long record,
   and shifted onto the level being shown. That shift is not a constant and it
   is not a function of the clock: stratification is driven by solar load on
   the lead cone, which warms the upper volume and holds it above the cool
   floor. On a clear day the difference reaches several kelvin by mid
   afternoon; on a cold overcast day there is little to drive it and mixing
   keeps the drum close to uniform. It is therefore modelled against a solar
   index, lagged to allow for the thermal inertia of the roof.

   Solar index. A clear-sky proxy, the sine of solar elevation, is computed
   from the site position and the time. Measured illuminance at the weather
   station is scaled onto it, so the index reads about the clear-sky value on
   a clear day and falls with cloud. Ahead of the present moment the same
   proxy is attenuated by forecast cloud cover, after Kasten and Czeplak.
   Where the fit cannot be made the median offset is used instead. */
var SITE_LAT=51.478*Math.PI/180, SITE_LON=0.061;

function clearSky(x){
  var d=new Date(x);
  var doy=Math.floor((Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate())
        -Date.UTC(d.getUTCFullYear(),0,1))/86400000)+1;
  var g=2*Math.PI*(doy-1+(d.getUTCHours()-12)/24)/365;
  var eot=229.18*(0.000075+0.001868*Math.cos(g)-0.032077*Math.sin(g)
        -0.014615*Math.cos(2*g)-0.040849*Math.sin(2*g));
  var dec=0.006918-0.399912*Math.cos(g)+0.070257*Math.sin(g)
        -0.006758*Math.cos(2*g)+0.000907*Math.sin(2*g)
        -0.002697*Math.cos(3*g)+0.00148*Math.sin(3*g);
  var tst=d.getUTCHours()*60+d.getUTCMinutes()+d.getUTCSeconds()/60+eot+4*SITE_LON;
  var ha=(tst/4-180)*Math.PI/180;
  var s=Math.sin(SITE_LAT)*Math.sin(dec)+Math.cos(SITE_LAT)*Math.cos(dec)*Math.cos(ha);
  return s>0?s:0;
}

var SOLAR=null;
function solarSeries(){
  if(SOLAR!==null) return SOLAR;
  SOLAR=false;
  var lit=DATA.out.filter(function(p){return isFinite(p.lux);});
  if(lit.length<50) return SOLAR;
  var r=[];
  lit.forEach(function(p){var c=clearSky(p.x); if(c>0.3) r.push(p.lux/c);});
  if(r.length<20) return SOLAR;
  r.sort(function(a,b){return b-a;});
  var alpha=r[Math.floor(Math.max(10,r.length/4)/2)];
  if(!isFinite(alpha)||alpha<=0) return SOLAR;
  var s=lit.map(function(p){return {x:p.x,v:Math.max(0,p.lux/alpha)};});
  var now=Date.now();
  (DATA.fc||[]).forEach(function(p){
    if(p.x<=now) return;
    var n=isFinite(p.cloud)?Math.min(1,Math.max(0,p.cloud/100)):0.5;
    s.push({x:p.x,v:clearSky(p.x)*(1-0.75*Math.pow(n,3.4))});
  });
  SOLAR=s.sort(function(a,b){return a.x-b.x;});
  return SOLAR;
}

function lagSeries(s,k){
  var o=[],S=s[0].v;
  for(var i=0;i<s.length;i++){
    if(i){var dt=Math.min(3,(s[i].x-s[i-1].x)/3600000); S+=k*(s[i-1].v-S)*dt;}
    o.push({x:s[i].x,v:S});
  }
  return o;
}

function stratModel(levelArr,key){
  var fl=DATA.inn.map(function(p){return {x:p.x,v:(key==='ah')?svd(p.t)*p.rh/100:p[key]};});
  var raw=[],all=[];
  levelArr.forEach(function(p){
    var v=(key==='ah')?svd(p.t)*p.rh/100:p[key];
    if(!isFinite(v)) return;
    var f=interpAt(fl,p.x);
    if(f!==null){ raw.push({x:p.x,d:v-f}); all.push(v-f); }
  });
  if(!all.length) return {flat:0};
  all.sort(function(a,b){return a-b;});
  var flat={flat:all[Math.floor(all.length/2)]};
  var sol=solarSeries();
  if(!sol||raw.length<20) return flat;
  var cands=[];
  [0.15,0.25,0.35,0.5,0.7,1.0].forEach(function(k){
    var lag=lagSeries(sol,k),xs=[],ys=[];
    raw.forEach(function(p){
      var s=interpAt(lag,p.x);
      if(s!==null){xs.push(s);ys.push(p.d);}
    });
    var n=xs.length; if(n<20) return;
    /* The intercept is the stratification with no solar load, which the record
       measures directly every night. Fixing it there and fitting only the slope
       keeps the lag search from buying a better overall fit by putting the night
       baseline somewhere the building has never been. */
    var night=[],i;
    for(i=0;i<n;i++) if(xs[i]<0.05) night.push(ys[i]);
    var b;
    if(night.length>=10){ night.sort(function(p,q){return p-q;}); b=night[Math.floor(night.length/2)]; }
    var sx=0,sy=0,sxx=0,sxy=0;
    for(i=0;i<n;i++){sx+=xs[i];sy+=ys[i];sxx+=xs[i]*xs[i];sxy+=xs[i]*ys[i];}
    var den=n*sxx-sx*sx; if(!den) return;
    var a;
    if(b===undefined){ a=(n*sxy-sx*sy)/den; b=(sy-a*sx)/n; }
    else { a=(sxy-b*sx)/(sxx||1); }
    var my=sy/n, ssr=0, sst=0;
    for(i=0;i<n;i++){var e=ys[i]-(a*xs[i]+b); ssr+=e*e; sst+=(ys[i]-my)*(ys[i]-my);}
    var r2=sst>0?1-ssr/sst:0;
    if(a>0) cands.push({a:a,b:b,k:k,r2:r2});
  });
  if(!cands.length) return flat;
  var top=cands.reduce(function(m,c){return c.r2>m.r2?c:m;});
  if(top.r2<0.5) return flat;
  /* Lags within a whisker of the best fit the daytime rise almost equally well but
     differ in where they put the night baseline, and a longer lag can buy a slightly
     better R2 by pushing the intercept well below the stratification actually
     measured at night. Among near-equal fits, take the one whose intercept is
     smallest, which is the one consistent with a drum that mixes to near-uniform
     once the sun is off it. */
  var near=cands.filter(function(c){return c.r2>=top.r2-0.01;});
  var best=near.reduce(function(m,c){return Math.abs(c.b)<Math.abs(m.b)?c:m;});
  best.lag=lagSeries(sol,best.k);
  return best;
}

function offsetAt(m,x){
  if(!m) return 0;
  if(m.flat!==undefined) return m.flat;
  var s=interpAt(m.lag,x);
  if(s===null) return m.b;
  return m.a*s+m.b;
}


function predictInternals(){
  if(!DATA.fc||!DATA.fc.length) return null;
  var week=DATA.inn.filter(function(p){return p.x>Date.now()-7*86400000;});
  var weekOut=DATA.out.filter(function(p){return p.x>Date.now()-7*86400000;});
  if(week.length<40||weekOut.length<40) return null;

  var inT=toSeries(week,'t'), outT=toSeries(weekOut,'t');
  var fab=toSeries(week,'p');

  var kT=fitK(inT,outT), kF=fitK(fab,inT);

  /* Two corrections the record demanded. First, sun: a pull toward outside air
     alone loses the solar gain entirely, and the constant term then stands in for
     it, so the projection drifts as it rolls forward. A lagged solar load carried
     as its own term roughly halves the day-ahead error at floor level. Second,
     the night sky: the coldest surfaces lose heat by radiation to a clear sky,
     which the record shows is the largest single influence on how near they come
     to their dew point, worth on the order of two degrees between clear and
     overcast. Both are fitted from the trailing week and both are forecastable,
     solar through cloud-attenuated illuminance and the night term through
     forecast cloud, so both extend into the projection. If either fit fails the
     model falls back to the simple pull it used before. */
  var solAll=solarSeries();
  /* The solar lag is chosen by rolling the fitted model forward a day across the
     record and taking the lag that lands closest, not by the one-step residual.
     Those two disagree sharply here: the residual prefers a fast lag that tracks
     each half-hour and then drifts badly over a day, while the day-ahead test
     picks a slow one near twelve hours, which is the roof's own conduction time.
     A projection is judged a day out, so it is fitted that way. */
  /* Third correction, for the cold season. The drum and the ground beneath the slab
     hold heat for days, so as the weather cools the interior sits further above the
     outside air than a single pull toward it allows, and the projection ran cold.
     Two terms carry that store: a slow average of outside temperature over about four
     days, and a free coefficient on the interior temperature itself, which together
     stand in for the mass of the drum and the ground. Tested a day ahead across the
     autumn record, they roughly halve the error at floor level. */
  var outAll=toSeries(DATA.out,'t').concat((DATA.fc||[]).map(function(p){return {x:p.x,v:p.t};}))
    .filter(function(p){return isFinite(p.v);}).sort(function(a,b){return a.x-b.x;});
  var slowOut=outAll.length>48?lagSeries(outAll,1/96):null;
  SLOW_OUT=slowOut;
  function slowAt(x){ return slowOut?interpAt(slowOut,x):null; }
  function inAt(x){ return interpAt(inT,x); }
  var solLag=null, kTs=null, massTerms=false;
  if(solAll&&solAll.length){
    var cands=[0.05,0.07,0.09,0.12,0.16,0.22,0.30,0.45];
    var bestErr=Infinity;
    for(var ci=0; ci<cands.length; ci++){
      var LG=lagSeries(solAll,cands[ci]);
      var lgAt=(function(L){return function(x){return interpAt(L,x);};})(LG);
      if(slowOut){
        var fm=fitMulti(inT,outT,[lgAt,inAt,slowAt]);
        if(fm){
          var em=rollErrorMass(inT,outT,LG,fm,24);
          if(em!==null&&em<bestErr){ bestErr=em; solLag=LG; kTs=fm; massTerms=true; }
        }
      }
      var f=fitMulti(inT,outT,[lgAt]);
      if(!f) continue;
      var err=rollError(inT,outT,LG,f,24);
      if(err!==null&&err<bestErr){ bestErr=err; solLag=LG; kTs=f; massTerms=false; }
    }
  }
  function solAt(x){ return solLag?interpAt(solLag,x):null; }
  function clearNightAt(x){
    var v=solAt(x); if(v===null) return null;
    return (v<0.05)?(1-cloudAt(x)):0;
  }
  var kFn=solLag?fitMulti(fab,inT,[clearNightAt]):null;

  /* Interior moisture is not a lag on exterior moisture at the hourly scale: within
     a day the fabric dominates, giving up water as the drum warms and taking it back
     as it cools, and the record shows interior vapour rising with interior temperature
     at about two-thirds of the constant-RH slope. Across days, the interior follows
     the exterior daily mean at roughly half amplitude, same day. The projection
     therefore carries interior RH as the slow variable, a first-order pull toward
     the exterior daily-mean state, and derives vapour concentration from that RH at
     the projected interior temperature, so the diurnal swing comes from temperature,
     which is how the building actually behaves. Both couplings are fitted from the
     trailing week. */
  var inR=toSeries(week,'rh');
  /* exterior daily-mean vapour, expressed as the RH it would produce at interior T */
  function dailyMeanAH(arr){
    var by={},k;
    arr.forEach(function(p){
      var d=new Date(p.x); k=d.toISOString().slice(0,10);
      (by[k]=by[k]||[]).push(svd(p.t)*p.rh/100);
    });
    var o={};
    Object.keys(by).forEach(function(k){
      var v=by[k]; o[k]=v.reduce(function(a,b){return a+b;},0)/v.length;
    });
    return o;
  }
  var histDM=dailyMeanAH(weekOut), fcDM=dailyMeanAH(DATA.fc);
  function outDayAH(x){
    var k=new Date(x).toISOString().slice(0,10);
    if(fcDM[k]!==undefined) return fcDM[k];
    if(histDM[k]!==undefined) return histDM[k];
    return null;
  }
  /* fit: dRH/dt = kR*(RHeq - RH), where RHeq is the RH that the exterior day-mean
     vapour would give at the current interior temperature */
  var rhEqSeries=week.map(function(p){
    var dm=outDayAH(p.x);
    return {x:p.x, v: dm===null?NaN : Math.min(100,Math.max(1,100*dm/svd(p.t)))};
  }).filter(function(p){return isFinite(p.v);});
  var kR=fitK(inR,rhEqSeries);

  var last=week[week.length-1];
  var T=last.t, R=last.rh;
  var F=isFinite(last.p)?last.p:T;
  var fc=DATA.fc;
  var t0=last.x, tEnd=fc[fc.length-1].x;
  var out=[];
  for(var x=t0+3600000; x<=tEnd; x+=3600000){
    var oT=interpAt(fc.map(function(p){return {x:p.x,v:p.t};}),x);
    var dm=outDayAH(x);
    if(oT===null||dm===null) break;
    if(kTs){ var sv=solAt(x); var dT=kTs.c+kTs.k*(oT-T)+kTs.b[0]*(sv===null?0:sv);
      if(massTerms){ var so=slowAt(x); dT+=kTs.b[1]*T+kTs.b[2]*(so===null?oT:so); }
      T+=dT; }
    else   { T+=kT.k*(oT-T)+kT.c; }
    var Req=Math.min(100,Math.max(1,100*dm/svd(T)));
    R+=kR.k*(Req-R)+kR.c;
    R=Math.min(100,Math.max(1,R));
    var A=svd(T)*R/100;
    if(kFn){ var nv=clearNightAt(x); F+=kFn.c+kFn.k*(T-F)+kFn.b[0]*(nv===null?0:nv); }
    else   { F+=kF.k*(T-F)+kF.c; }
    A=Math.max(0.5,A);
    var rh=R;
    var g=Math.log(rh/100)+17.62*T/(243.12+T);
    var td=243.12*g/(17.62-g);
    out.push({x:x,t:+T.toFixed(2),rh:+rh.toFixed(1),ah:+A.toFixed(2),
              p:+F.toFixed(2),m:+(F-td).toFixed(2)});
  }
  return out;
}

var EVENT_SPANS=[];
/* Shaded spans marking logged interventions, periods the doors stood open.
   Drawn behind the data so the reader can see cause against effect. */
var eventSpans={id:'eventspans',beforeDatasetsDraw:function(c){
  if(!EVENT_SPANS.length) return;
  var xs=c.scales.x, ar=c.chartArea; if(!ar) return;
  var ctx=c.ctx;
  EVENT_SPANS.forEach(function(s){
    if(s.b<xs.min||s.a>xs.max) return;
    var x1=xs.getPixelForValue(Math.max(s.a,xs.min));
    var x2=xs.getPixelForValue(Math.min(s.b,xs.max));
    if(x2-x1<1) x2=x1+1;
    ctx.save();
    ctx.fillStyle='rgba(107,76,59,.07)';
    ctx.fillRect(x1,ar.top,x2-x1,ar.bottom-ar.top);
    ctx.strokeStyle='rgba(107,76,59,.28)';
    ctx.setLineDash([2,3]); ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(x1,ar.top); ctx.lineTo(x1,ar.bottom);
    ctx.moveTo(x2,ar.top); ctx.lineTo(x2,ar.bottom); ctx.stroke();
    if(x2-x1>46){
      ctx.fillStyle='rgba(107,76,59,.55)';
      ctx.font="italic 9px 'Source Serif 4',serif";
      ctx.textAlign='center';
      ctx.fillText('doors open',(x1+x2)/2,ar.top+11);
    }
    ctx.restore();
  });
}};

var decisionLines={id:'decisionlines',beforeDatasetsDraw:function(c){
  var xs=c.scales.x, ar=c.chartArea; if(!ar) return;
  var min=xs.min, max=xs.max, ctx=c.ctx;
  var spanH=(max-min)/3600000;
  var pxPerWindow=(ar.right-ar.left)/(spanH/12);
  var wide = pxPerWindow>78;   /* room for the words */
  var terse = pxPerWindow>34;  /* room for the clock time only */
  var d=new Date(min); d.setMinutes(0,0,0);
  for(var t=d.getTime(); t<=max; t+=3600000){
    var hr=new Date(t).getHours();
    if(DECISION_HOURS.indexOf(hr)<0) continue;
    if(t<min) continue;
    var px=xs.getPixelForValue(t);
    ctx.save();
    ctx.strokeStyle='rgba(107,76,59,.35)'; ctx.setLineDash([2,3]); ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(px,ar.top); ctx.lineTo(px,ar.bottom); ctx.stroke();
    ctx.setLineDash([]);
    if(wide || terse){
      ctx.fillStyle='rgba(107,76,59,.62)';
      ctx.textAlign='center';
      if(wide){
        ctx.font="italic 9px 'Source Serif 4',serif";
        ctx.fillText(hr<12?'morning':'evening', px, ar.bottom-5);
      } else {
        ctx.font="italic 8px 'Source Serif 4',serif";
        ctx.fillText(hr<12?'6am':'6pm', px, ar.bottom-5);
      }
    }
    ctx.restore();
  }
}};

var nowLine={id:'nowline',afterDatasetsDraw:function(c){
  var xs=c.scales.x, ar=c.chartArea; if(!ar) return;
  var px=xs.getPixelForValue(Date.now());
  if(px<ar.left||px>ar.right) return;
  var ctx=c.ctx; ctx.save();
  ctx.strokeStyle='rgba(44,53,57,.55)'; ctx.setLineDash([4,3]); ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(px,ar.top); ctx.lineTo(px,ar.bottom); ctx.stroke();
  ctx.setLineDash([]);
  ctx.font="italic 10px 'Source Serif 4',serif"; ctx.fillStyle='rgba(44,53,57,.7)';
  ctx.fillText('now',px+4,ar.top+11);
  ctx.restore();
}};

/* Chart captions follow the view, because the views do not draw the same series.
   The short views separate the three heights and carry no fabric line on the
   temperature chart; the week view averages the sensors into one air line and one
   fabric line; the record view reduces everything to daily shapes. A caption that
   describes a line the reader cannot see is worse than no caption. */
function setCaptions(view){
  var short = (view==='outlook'||view==='now');
  var C={
    capT: short
      ? 'Three heights within the drum, against the air outside in grey. The higher the air, '+
        'the warmer, by several degrees on a clear afternoon. Sun on the lead drives the '+
        'difference, and it closes to almost nothing overnight. Where the king post sensor misses '+
          'readings, its line is carried in a lighter tone from the mid-height sensor.'
      : (view==='week'
      ? 'The air inside moves far less than the air outside in grey. The fabric is drawn as two '+
        'lines: the timber beneath the lead, the most volatile surface measured, and the floor '+
        'slab, the steadiest.'
      : 'Each day reduced to its mean, with the day\u2019s range shaded for the air inside, against '+
        'the air outside in grey. Timber beneath the lead and floor slab are drawn separately.'),
    capRH: (short
      ? 'Humidity at the same three heights, with the zone above 80 per cent shaded, where mould '+
        'can germinate. Warmer air reads drier, so the high positions run low. The lighter stretches '+
          'of the king post line are estimated from mid height where that sensor missed readings. '
      : (view==='week'
      ? 'Humidity inside and out, with the zone above 80 per cent shaded, where mould can '+
        'germinate. '
      : 'Daily mean humidity inside, with the day\u2019s range shaded, against the air outside. '+
        'Past thirty days the 30-day average required by EN 15757 is drawn. '))+
      'From 10 August to 14 November the readings ran from 31 to 95 per cent across the array, and from '+
      '31 to 89 per cent within the drum, which averaged 50 per cent in August, 62 in September, 70 in '+
      'October, when 7 per cent of readings were above 80, and 76 in the first half of November.',
    capAH: 'The water content of the air, in grams per cubic metre, averaged across the sensors '+
      'within the drum. Humidity percentages depend on temperature; this does not. The inside '+
      'line rises and falls each day with the building\u2019s own temperature: as the drum warms, '+
      'brick and timber release moisture, and as it cools they take it back. Tens of kilograms of '+
      'water a day, far more than the openings could carry. From August to mid-November, in the hours '+
      'when the drum was above 70 per cent, the air outside was drier for about a third of them.'+
      (view==='outlook'
        ? ' Green marks the times when the air outside holds more water than the air inside, '+
          'russet the times when it holds less.'
        : ''),
    capM: (view==='record'
      ? 'The heavy line is each day\u2019s lowest margin at any surface measured, the fainter line '+
        'the daily mean.'
      : 'Most sensors read a surface as well as the air beside it. The heavy line is the surface '+
        'closest to condensation at any moment, the faint line the one furthest from it, and '+
        'neither is a fixed sensor.')+
      ' While the line stays clear of zero, nothing measured is wet. The margin has narrowed '+
      'through the season. Heating needed to protect the primary timbers does not improve the '+
      'sarking board risk. That can only be improved by repairing the roof itself.',
    capS: 'Measured illuminance at the weather station, scaled against a clear-sky calculation '+
      'for this latitude and date, so the line reads about one on a cloudless day and falls with '+
      'cloud.'+
      (view==='outlook'
        ? ' Ahead of now it is the same calculation attenuated by forecast cloud.'
        : (view==='record'
          ? ' Daily means, which fall away through the autumn.'
          : ''))+
      ' The building lags it by several hours: sun on the lead in the early afternoon reaches the '+
      'timber towards evening.',
    capW: 'Two anemometers, deliberately different. The stronger line is London City Airport, '+
      '2.5 km north on open ground, taken as the free-stream wind. The fainter line is the mast '+
      'beside the building, which stands in the lee of the drum and the trees. The gap between '+
      'them is the building\u2019s wind shadow. Arrows along the top fly with the wind, so an arrow '+
      'pointing right is air moving west to east.'+
      (view==='outlook'
        ? ' The dotted line ahead is the forecast, read against the airport, not the mast.'
        : (view==='record' ? ' Daily means. The ratio between the lines holds at roughly one part '+
          'in seven whatever the weather does.' : '')),
    capRain: (view==='record'
      ? 'Rain per day, in millimetres, summed from the gauge\u2019s cumulative total. '
      : 'Depth fallen in the hour to each reading, taken from the gauge\u2019s cumulative total '+
        'rather than its reported rate. The gauge tips in steps of 0.254 mm, so light rain '+
        'resolves coarsely. ')+
      'Readings during the station move on 10 August 2026 are excluded. Measured at the weather '+
      'station beside the old cannon dock. Rain events show up inside as surface temperature, and '+
      'later as moisture the fabric gives back.'
  };
  Object.keys(C).forEach(function(id){
    var el=document.getElementById(id);
    if(el) el.textContent=C[id];
  });
}

function build(view){
  setCaptions(view);
  if(!DATA) return;
  VIEW=view;
  var note=document.getElementById('view-note');

  if(view==='record'){
    var firstDay=DATA.inn.length?DATA.inn[0].x:nowMs;
    var d0=new Date(firstDay); d0.setHours(0,0,0,0);
    var d1=new Date(nowMs);    d1.setHours(24,0,0,0);
    XMIN=d0.getTime(); XMAX=d1.getTime();
    if(note){
      var spanD=(DATA.inn.length>1)?(DATA.inn[DATA.inn.length-1].x-DATA.inn[0].x)/86400000:0;
      note.textContent='Everything measured so far, one shape per day: the line is the '+
        'daily mean, the shaded band spans that day\u2019s minimum and maximum. '+
        'Short-term detail is set aside so that seasonal movement, and any day that '+
        'departs from the pattern, can be seen. '+
        (spanD>=30
          ? 'The heavier line on the humidity chart is the 30-day running average that '+
            'describes the building\u2019s own climate.'
          : 'The record began in July 2026; a 30-day running average will be added to the '+
            'humidity chart once it is long enough to support one, and a full year is '+
            'needed before the building\u2019s own climate can be described.');
    }
    var dT=daily(DATA.inn,function(p){return p.t;});
    var dTo=daily(DATA.out,function(p){return p.t;});
    var dP=daily(DATA.inn.filter(function(p){return isFinite(p.p);}),function(p){return p.p;});
    var dRoof=daily(DATA.all.filter(function(p){
      return onSarking(p) && isFinite(p.p);}),function(p){return p.p;});
    mk('cT',[
      {label:'Inside, daily range',data:bandData(dT,'hi'),borderColor:'transparent',backgroundColor:'rgba(176,83,47,.13)',pointRadius:0,fill:'+1'},
      {label:'_lo',data:bandData(dT,'lo'),borderColor:'transparent',pointRadius:0,fill:false},
      {label:'Inside, daily mean',data:bandData(dT,'mean'),borderColor:cssvar('--rust'),borderWidth:2,pointRadius:0,tension:.4},
      {label:'Roof timber, daily mean',data:bandData(dRoof,'mean'),borderColor:cssvar('--deep'),borderWidth:2,pointRadius:0,tension:.4},
      {label:'Floor slab, daily mean',data:bandData(dP,'mean'),borderColor:'rgba(140,47,47,.55)',borderWidth:1.6,pointRadius:0,tension:.4},
      {label:'Outside, daily mean',data:bandData(dTo,'mean'),borderColor:cssvar('--grey'),borderWidth:2,pointRadius:0,tension:.4}]);

    var dR=daily(DATA.inn,function(p){return p.rh;});
    var dRo=daily(DATA.out,function(p){return p.rh;});
    var band={id:'band',beforeDraw:function(c){
      var ar=c.chartArea,y=c.scales.y; if(!ar||!y) return;
      var bo=y.getPixelForValue(80), t=ar.top, ctx=c.ctx; if(bo<=t) return;
      ctx.save();ctx.fillStyle='rgba(150,70,45,.07)';ctx.fillRect(ar.left,t,ar.right-ar.left,bo-t);ctx.restore();}};
    var spanDays=(dR.length>1)?(dR[dR.length-1].x-dR[0].x)/86400000:0;
    var rhSets=[
      {label:'Inside, daily range',data:bandData(dR,'hi'),borderColor:'transparent',backgroundColor:'rgba(44,95,138,.12)',pointRadius:0,fill:'+1'},
      {label:'_lo',data:bandData(dR,'lo'),borderColor:'transparent',pointRadius:0,fill:false},
      {label:'Inside, daily mean',data:bandData(dR,'mean'),borderColor:cssvar('--blue'),borderWidth:2.2,pointRadius:0,tension:.4}];
    if(spanDays>=30){
      rhSets.push({label:'Inside, 30-day average',data:movingAvg(dR,30),
        borderColor:cssvar('--gunmetal'),borderWidth:2.6,pointRadius:0,tension:.4});
    }
    rhSets.push({label:'Outside, daily mean',data:bandData(dRo,'mean'),borderColor:cssvar('--sky'),borderWidth:1.8,pointRadius:0,tension:.4});
    mk('cRH',rhSets,[band]);

    var dA=daily(DATA.all.filter(function(p){return p.dev!=='MTS-80';}),ah), dAo=daily(DATA.out,ah);
    var byDay={}; dAo.forEach(function(d){byDay[d.x]=d.mean;});
    var pairsD=dA.filter(function(d){return isFinite(byDay[d.x]);})
                 .map(function(d){return {x:d.x,inv:+d.mean.toFixed(2),outv:+byDay[d.x].toFixed(2)};});
    mk('cAH',[
      {label:'Inside, daily mean',data:bandData(dA,'mean'),borderColor:cssvar('--blue'),borderWidth:2,pointRadius:0,tension:.4},
      {label:'Outside, daily mean',data:bandData(dAo,'mean'),borderColor:cssvar('--sky'),borderWidth:2,pointRadius:0,tension:.4}],
      [ahTargetPlugin(pairsD)]);

    var dM=daily(DATA.inn,marginOf);
    mk('cM',[
      {label:'Daily minimum margin',data:bandData(dM,'lo'),borderColor:cssvar('--deep'),borderWidth:2.4,pointRadius:0,tension:.4},
      {label:'Daily mean margin',data:bandData(dM,'mean'),borderColor:cssvar('--grey'),borderWidth:1.6,pointRadius:0,tension:.4}],[wetZone],{zero:true});

    var solR=solarSeries();
    if(solR&&solR.length){
      mk('cS',[{label:'Sunlight, daily mean',
                data:daily(solR,function(p){return p.v;}).map(function(p){return {x:p.x,y:+p.mean.toFixed(3)};}),
                borderColor:cssvar('--rust'),borderWidth:2,pointRadius:0,tension:.3,
                backgroundColor:'rgba(160,82,45,.10)',fill:'origin'}],[],{zero:true});
    }
    var fw=document.getElementById('figW'); if(fw) fw.style.display='';
    var wRec=[{label:'Site mast, daily mean m/s',
               data:daily(DATA.out,function(p){return p.wind;}).map(function(p){return {x:p.x,y:+p.mean.toFixed(2)};}),
               borderColor:'rgba(44,53,57,.45)',borderWidth:1.4,pointRadius:0,tension:.3}];
    if(DATA.ref.length){
      wRec.unshift({label:'London City, daily mean m/s',
               data:daily(DATA.ref,function(p){return p.wind;}).map(function(p){return {x:p.x,y:+p.mean.toFixed(2)};}),
               borderColor:cssvar('--blue'),borderWidth:2,pointRadius:0,tension:.3});
    }
    mk('cW',wRec,[],{zero:true});
    mk('cRain',[{label:'Rain, daily total mm',data:rainDaily(DATA.out),borderColor:cssvar('--blue'),borderWidth:2,pointRadius:0,tension:.3}],[],{zero:true});
    return;
  }

  /* Fix the plotted window for each view, so the axis frames the intended
     period rather than whatever the data happens to span. */
  var nowMs=Date.now();
  if(view==='outlook'){ XMIN=nowMs-24*3600000; XMAX=nowMs+48*3600000; }
  /* Two days rather than one. A single diurnal cycle gives nothing to compare
     itself against, and the measured moisture time constant is 12 to 14 hours,
     so a 24-hour window shows an event and cuts off its recovery. Forty-eight
     hours holds two complete cycles with the left edge at the same clock time
     as the right, so consecutive nights sit side by side. Thirty-six would put
     the left edge on a different hour each time the page is opened. */
  else if(view==='now'){ XMIN=nowMs-48*3600000; XMAX=nowMs; }
  else if(view==='week'){ XMIN=nowMs-7*86400000; XMAX=nowMs; }
  else { XMIN=null; XMAX=null; }   /* the record: let it span everything */

  /* Smoothing window in points, by view */
  var SM = (view==='now')?5 : (view==='outlook')?3 : (view==='week')?5 : 3;
  var pred = (view==='outlook') ? predictInternals() : null;
  /* Level projections. The model is fitted on the floor record (the longest
     series) and shifted to each measured level by that level's stratification
     against the floor, which solar load drives and which is therefore modelled
     against a lagged solar index rather than taken as a constant; temperature
     and vapour concentration are shifted separately and relative humidity is
     recomputed from the shifted values. A level's projection is drawn only when that level's own
     record is long enough to establish its stratification. */
  var lowPred=null, midPred=null, highPred=null;
  function shiftPred(levelArr){
    if(!pred || levelArr.length<=6) return null;
    var oT=stratModel(levelArr,'t'), oA=stratModel(levelArr,'ah'), oP=stratModel(levelArr,'p');
    return pred.map(function(p){
      var T=p.t+offsetAt(oT,p.x), A=Math.max(0.5,p.ah+offsetAt(oA,p.x));
      var rh=Math.min(100,Math.max(1,100*A/svd(T)));
      var F=isFinite(p.p)?p.p+offsetAt(oP,p.x):NaN;
      var o={x:p.x,t:+T.toFixed(2),ah:+A.toFixed(2),rh:+rh.toFixed(1)};
      if(isFinite(F)){ o.p=+F.toFixed(2); o.m=+(F-dew(T,rh)).toFixed(2); }
      return o;
    });
  }
  lowPred=shiftPred(DATA.ring);
  midPred=shiftPred(DATA.walk);
  var apexSpan=DATA.high.length?(DATA.high[DATA.high.length-1].x-DATA.high[0].x)/86400000:0;
  var apexOwn=apexSpan>=APEX_MIN_DAYS;
  if(apexOwn) highPred=shiftPred(DATA.high);
  function lvlDs(P,key){
    return P?P.filter(function(p){return p.x<=Date.now()+48*3600000;})
      .map(function(p){return {x:p.x,y:p[key]};}):[];
  }
  function midDs(key){ return lvlDs(midPred,key); }
  /* Days of readings to load. The 'now' view was left at 1 when its window went
     to 48 hours, so the axis spanned two days and the data filled only the
     right half. Must match the XMIN set below for each view. */
  var days = (view==='outlook')?1 : (view==='now')?2 : 7;
  /* Grid interval. The sensors currently report every 20 minutes; plotting
     finer than the data would imply resolution the record does not hold. */
  var step = (view==='outlook')?30 : (view==='now')?10 : 20;
  if(note){
    if(view==='outlook'){
      note.textContent = pred
        ? 'The past day, and two days ahead. Solid lines are measurements. Everything broken is '+
          'not: beyond the \u201cnow\u201d mark, the weather forecast and, for each interior level, '+
          'a projection from the building\u2019s own measured response to outside conditions. '+
          'Projections are indicative and improve as the record grows. '+
          'The faint verticals mark morning and evening.'
        : 'The past day. The forecast feed is not yet available; the outlook will appear '+
          'here once it is.';
    } else if(view==='now'){
      note.textContent='Two days at the resolution the sensors report, fine enough to show individual events, and long enough to set last night beside the one before.';
    } else {
      note.textContent='The past week, with the sensors averaged: one line for the air inside, '+
        'one for the fabric surfaces, against the weather outside. Individual positions are shown '+
        'in the shorter views.';
    }
  }
  var cutoff=Date.now()-days*86400000;
  var inn=thin(DATA.inn.filter(function(p){return p.x>=cutoff;}),step);
  var out=thin(DATA.out.filter(function(p){return p.x>=cutoff;}),step);
  var fcLimit=Date.now()+48*3600000;
  var fc=(view==='outlook'&&DATA.fc)?DATA.fc.filter(function(p){return p.x<=fcLimit;}):[];
  var plugins=(view==='outlook')?[eventSpans,decisionLines,nowLine]
             :(view==='now')?[eventSpans,decisionLines]
             :(view==='week')?[eventSpans]:[];

  function predDs(key){return pred?pred.filter(function(p){return p.x<=fcLimit;})
    .map(function(p){return {x:p.x,y:p[key]};}):[];}
  function fcDs(key){return fc.map(function(p){return {x:p.x,y:p[key]};})
    .filter(function(p){return isFinite(p.y);});}

  var drum=DATA.all.filter(function(p){
    return p.x>=cutoff && p.dev!=='MTS-80';
  });
  var ahG=groupDev(drum,ah,step);
  var lowG=groupDev(DATA.ring.filter(function(p){return p.x>=cutoff;}),'t',step);
  var midG=groupDev(DATA.walk.filter(function(p){return p.x>=cutoff;}),'t',step);
  var highM=groupDev(DATA.high.filter(function(p){return p.x>=cutoff;}),'t',step);
  var tSets;
  if(view==='week'){
    var airG=groupDev(drum,'t',step);
    /* The probes do not read one fabric. Those beneath the lead are solar loaded and
       run tens of degrees above the air; the slab is the steadiest surface in the
       building. Averaging them produces a line that describes no surface at all. */
    var roofG=groupDev(DATA.all.filter(function(p){
      return p.x>=cutoff && onSarking(p) && isFinite(p.p);}),'p',step);
    var slabG=groupDev(DATA.inn.filter(function(p){
      return p.x>=cutoff && isFinite(p.p);}),'p',step);
    tSets=[
      {label:'Air inside, averaged',data:smooth(gser(airG,'mean'),SM),borderColor:cssvar('--rust'),borderWidth:2,pointRadius:0,tension:.38},
      {label:'Roof timber, beneath the lead',data:smooth(gser(roofG,'mean'),SM),borderColor:cssvar('--deep'),borderWidth:2,pointRadius:0,tension:.38},
      {label:'Floor slab',data:smooth(gser(slabG,'mean'),SM),borderColor:'rgba(140,47,47,.55)',borderWidth:1.6,pointRadius:0,tension:.38},
      {label:'Outside',data:smooth(ds(out,'t'),SM),borderColor:cssvar('--grey'),borderWidth:2,pointRadius:0,tension:.38}];
    mk('cT',tSets,plugins);
  } else {
  tSets=[
    {label:'Low, 5 m',data:smooth(gser(lowG,'mean'),SM),borderColor:cssvar('--rust'),borderWidth:2,pointRadius:0,tension:.38},
    {label:'Mid, 11 m',data:smooth(gser(midG,'mean'),SM),borderColor:'#7D6340',borderWidth:2,pointRadius:0,tension:.38},
    {label:'King post, 16 m',data:breakGaps(smoothSeg(gser(highM,'mean'),SM,3*step*60000),3*step*60000),spanGaps:false,borderColor:cssvar('--gunmetal'),borderWidth:2,pointRadius:0,tension:.38},
    {label:'_King post, estimated',data:kpFill(smoothSeg(gser(highM,'mean'),SM,3*step*60000),smooth(gser(midG,'mean'),SM),3*step*60000),spanGaps:false,borderColor:'rgba(44,53,57,.40)',borderWidth:2,pointRadius:0,tension:.38},
    {label:'Outside',data:smooth(ds(out,'t'),SM),borderColor:cssvar('--grey'),borderWidth:2,pointRadius:0,tension:.38}];
  if(view==='outlook'){
    tSets.push({label:'Outside ahead',data:joinAhead(lastPt(tSets[4].data),fcDs('t'),3),borderColor:cssvar('--grey'),borderDash:[2,3],borderWidth:1.6,pointRadius:0,tension:.38});
    if(lowPred) tSets.push({label:'Low ahead',data:joinAhead(lastPt(tSets[0].data),lvlDs(lowPred,'t'),6),borderColor:cssvar('--rust'),borderDash:[2,3],borderWidth:1.6,pointRadius:0,tension:.38});
    if(midPred) tSets.push({label:'Mid ahead',data:joinAhead(lastPt(tSets[1].data),lvlDs(midPred,'t'),6),borderColor:'#7D6340',borderDash:[2,3],borderWidth:1.6,pointRadius:0,tension:.38});
    if(highPred) tSets.push({label:'King post ahead',data:joinAhead(lastPt(tSets[2].data,tSets[3].data),lvlDs(highPred,'t'),6),borderColor:cssvar('--gunmetal'),borderDash:[2,3],borderWidth:1.6,pointRadius:0,tension:.38});
  }
  mk('cT',tSets,plugins);
  }

  var band2={id:'band',beforeDraw:function(c){
    var ar=c.chartArea,y=c.scales.y; if(!ar||!y) return;
    var bo=y.getPixelForValue(80), t=ar.top, ctx=c.ctx; if(bo<=t) return;
    ctx.save();ctx.fillStyle='rgba(150,70,45,.07)';ctx.fillRect(ar.left,t,ar.right-ar.left,bo-t);ctx.restore();}};
  var lowR=groupDev(DATA.ring.filter(function(p){return p.x>=cutoff;}),'rh',step);
  var midR=groupDev(DATA.walk.filter(function(p){return p.x>=cutoff;}),'rh',step);
  var highRM=groupDev(DATA.high.filter(function(p){return p.x>=cutoff;}),'rh',step);
  var rhS;
  if(view==='week'){
    var airR=groupDev(drum,'rh',step);
    rhS=[
      {label:'Inside',data:smooth(gser(airR,'mean'),SM),borderColor:cssvar('--blue'),borderWidth:2,pointRadius:0,tension:.38},
      {label:'Outside',data:smooth(ds(out,'rh'),SM),borderColor:cssvar('--sky'),borderWidth:2,pointRadius:0,tension:.38}];
    mk('cRH',rhS,[band2].concat(plugins));
  } else {
  rhS=[
    {label:'Low, 5 m',data:smooth(gser(lowR,'mean'),SM),borderColor:cssvar('--blue'),borderWidth:2,pointRadius:0,tension:.38},
    {label:'Mid, 11 m',data:smooth(gser(midR,'mean'),SM),borderColor:'#7D6340',borderWidth:2,pointRadius:0,tension:.38},
    {label:'King post, 16 m',data:breakGaps(smoothSeg(gser(highRM,'mean'),SM,3*step*60000),3*step*60000),spanGaps:false,borderColor:cssvar('--gunmetal'),borderWidth:2,pointRadius:0,tension:.38},
    {label:'_King post, estimated',data:kpFill(smoothSeg(gser(highRM,'mean'),SM,3*step*60000),smooth(gser(midR,'mean'),SM),3*step*60000),spanGaps:false,borderColor:'rgba(44,53,57,.40)',borderWidth:2,pointRadius:0,tension:.38},
    {label:'Outside',data:smooth(ds(out,'rh'),SM),borderColor:cssvar('--sky'),borderWidth:2,pointRadius:0,tension:.38}];
  if(view==='outlook'){
    rhS.push({label:'Outside ahead',data:joinAhead(lastPt(rhS[4].data),fcDs('rh'),3,0,100),borderColor:cssvar('--sky'),borderDash:[2,3],borderWidth:1.6,pointRadius:0,tension:.38});
    if(lowPred) rhS.push({label:'Low ahead',data:joinAhead(lastPt(rhS[0].data),lvlDs(lowPred,'rh'),6,0,100),borderColor:cssvar('--blue'),borderDash:[2,3],borderWidth:1.6,pointRadius:0,tension:.38});
    if(midPred) rhS.push({label:'Mid ahead',data:joinAhead(lastPt(rhS[1].data),lvlDs(midPred,'rh'),6,0,100),borderColor:'#7D6340',borderDash:[2,3],borderWidth:1.6,pointRadius:0,tension:.38});
    if(highPred) rhS.push({label:'King post ahead',data:joinAhead(lastPt(rhS[2].data,rhS[3].data),lvlDs(highPred,'rh'),6,0,100),borderColor:cssvar('--gunmetal'),borderDash:[2,3],borderWidth:1.6,pointRadius:0,tension:.38});
  }
  mk('cRH',rhS,[band2].concat(plugins));
  }

  var innAH=ahG.map(function(o){return {x:o.x,t:NaN,rh:NaN,ahv:o.mean};});
  var ahPairs=pairAHv(innAH,out);
  var ahS=[
    {label:'Inside',data:smooth(ahG.map(function(o){return {x:o.x,y:+o.mean.toFixed(2)};}),SM),borderColor:cssvar('--blue'),borderWidth:2,pointRadius:0,tension:.38},
    {label:'Outside',data:out.map(function(p){return {x:p.x,y:ah(p)};}),borderColor:cssvar('--sky'),borderWidth:2,pointRadius:0,tension:.38}];
  if(view==='outlook'&&pred){
    var fcAH=fc.map(function(p){return {x:p.x,y:+(svd(p.t)*p.rh/100).toFixed(2)};});
    ahS.push({label:'Outside ahead',data:joinAhead(lastPt(ahS[1].data),fcAH,3,0),borderColor:cssvar('--sky'),borderDash:[2,3],borderWidth:1.6,pointRadius:0,tension:.38});
    ahS.push({label:'Inside ahead',data:joinAhead(lastPt(ahS[0].data),predDs('ah'),6,0),borderColor:cssvar('--blue'),borderDash:[2,3],borderWidth:1.6,pointRadius:0,tension:.38});
    pred.forEach(function(p){
      var o=interpAt(fc.map(function(q){return {x:q.x,v:svd(q.t)*q.rh/100};}),p.x);
      if(o!==null) ahPairs.push({x:p.x,inv:p.ah,outv:+o.toFixed(2)});
    });
  }
  mk('cAH',ahS,[ahTargetPlugin(ahPairs)].concat(plugins));

  var marG=groupDev(DATA.all.filter(function(p){
      return p.x>=cutoff && onSurface(p);
    }),marginOf,step);
  var mS=[
    {label:'Closest to condensation',data:smooth(gser(marG,'lo'),SM),borderColor:cssvar('--deep'),borderWidth:2.4,pointRadius:0,tension:.38},
    {label:'Furthest from condensation',data:smooth(gser(marG,'hi'),SM),borderColor:'rgba(140,47,47,.35)',borderWidth:1.2,pointRadius:0,tension:.38,
     backgroundColor:'rgba(140,47,47,.08)',fill:'-1'}];
  if(view==='outlook'&&pred){
    /* The measured series are an envelope across the array, so the projection has to
       be one too. Projecting a single sensor and drawing it in the envelope's colour
       put a step at the present moment: the floor probe rests on the slab and sits
       far from condensation, while the measured minimum is usually a roof probe.
       Levels contributing a fabric temperature are the floor, the 5 m ring and the
       walkway, and the king post once its own record carries the projection; before
       that the king post is projected for air only and is excluded. */
    var mEnv=[];
    pred.forEach(function(p,i){
      var v=[];
      if(isFinite(p.m)) v.push(p.m);
      [lowPred,midPred,apexOwn?highPred:null].forEach(function(P){
        if(P && P[i] && P[i].x===p.x && isFinite(P[i].m)) v.push(P[i].m);
      });
      if(v.length) mEnv.push({x:p.x,lo:Math.min.apply(null,v),hi:Math.max.apply(null,v)});
    });
    if(mEnv.length){
      var lim=Date.now()+48*3600000;
      var envDs=function(k){return mEnv.filter(function(p){return p.x<=lim;})
        .map(function(p){return {x:p.x,y:p[k]};});};
      mS.push({label:'Closest ahead',data:joinAhead(lastPt(mS[0].data),envDs('lo'),6),borderColor:cssvar('--deep'),borderDash:[2,3],borderWidth:1.6,pointRadius:0,tension:.38});
      mS.push({label:'Furthest ahead',data:joinAhead(lastPt(mS[1].data),envDs('hi'),6),borderColor:'rgba(140,47,47,.35)',borderDash:[2,3],borderWidth:1.2,pointRadius:0,tension:.38,
               backgroundColor:'rgba(140,47,47,.08)',fill:'-1'});
    }
  }
  mk('cM',mS,[wetZone].concat(plugins),{zero:true});

  var sol=solarSeries();
  if(sol&&sol.length){
    var nowS=Date.now();
    var solWin=sol.filter(function(p){return p.x>=XMIN&&p.x<=XMAX;});
    var dBin=(view==='now')?60:(view==='outlook')?90:180;
    var sS=[{label:'Sunlight',
             data:binMean(solWin.filter(function(p){return p.x<=nowS;}),function(p){return p.v;},dBin),
             borderColor:cssvar('--rust'),borderWidth:1.8,pointRadius:0,tension:.4,
             backgroundColor:'rgba(160,82,45,.10)',fill:'origin'}];
    if(view==='outlook'){
      sS.push({label:'Sunlight ahead',
             data:binMean(solWin.filter(function(p){return p.x>nowS;}),function(p){return p.v;},dBin),
             borderColor:cssvar('--rust'),borderDash:[2,3],borderWidth:1.6,pointRadius:0,tension:.4,
             backgroundColor:'rgba(160,82,45,.06)',fill:'origin'});
    }
    mk('cS',sS,plugins,{zero:true});
  }
  var fw=document.getElementById('figW'); if(fw) fw.style.display='';
  /* Direction is drawn as a ribbon of slender arrows across the top of the
     plot, not as markers on the line: rotated point-triangles read as noise at
     line-marker size. Each arrow is a stem with a small head, evenly spaced,
     rotated to fly WITH the wind, so an arrow pointing right is air moving
     west to east; wind FROM 290 travels TOWARD 110, hence the +180. Measured
     direction comes from the airport; ahead of now, from the forecast. The
     mast's vane sits in the building's wake and is not drawn. */
  var dirSrc=[];
  if(DATA.ref.length){
    DATA.ref.forEach(function(p){
      if(p.x>=XMIN&&p.x<=Math.min(XMAX,Date.now())&&isFinite(p.wdir))
        dirSrc.push({x:p.x,dir:p.wdir});
    });
  }
  if(view==='outlook'&&fc.length){
    fc.forEach(function(p){
      if(p.x>Date.now()&&p.x<=XMAX&&isFinite(p.wdir)) dirSrc.push({x:p.x,dir:p.wdir});
    });
  }
  var windRibbon={id:'windRibbon',afterDatasetsDraw:function(c){
    if(!dirSrc.length) return;
    var ar=c.chartArea,x=c.scales.x,ctx=c.ctx;
    var n=12, y0=ar.top+11, L=7;
    ctx.save();
    ctx.strokeStyle='rgba(44,53,57,.55)'; ctx.fillStyle='rgba(44,53,57,.55)'; ctx.lineWidth=1.1;
    for(var i=0;i<n;i++){
      var t=x.getValueForPixel(ar.left+(i+0.5)*(ar.right-ar.left)/n);
      var best=null;
      for(var j=0;j<dirSrc.length;j++){
        if(best===null||Math.abs(dirSrc[j].x-t)<Math.abs(dirSrc[best].x-t)) best=j;
      }
      if(Math.abs(dirSrc[best].x-t)>3*3600000) continue;
      var px=ar.left+(i+0.5)*(ar.right-ar.left)/n;
      var a=(dirSrc[best].dir+180)*Math.PI/180;   /* 0 = north, clockwise */
      var dx=Math.sin(a), dy=-Math.cos(a);
      ctx.beginPath();
      ctx.moveTo(px-dx*L,y0-dy*L); ctx.lineTo(px+dx*L,y0+dy*L); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(px+dx*L,y0+dy*L);
      ctx.lineTo(px+dx*L-dx*4-dy*2.6,y0+dy*L-dy*4+dx*2.6);
      ctx.lineTo(px+dx*L-dx*4+dy*2.6,y0+dy*L-dy*4-dx*2.6);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }};
  var wBin=(view==='now')?60:(view==='outlook')?90:180;
  var wS=[{label:'Site mast m/s',data:binMean(out,'wind',wBin),
           borderColor:'rgba(44,53,57,.45)',borderWidth:1.4,pointRadius:0,tension:.4}];
  if(DATA.ref.length){
    var refWin=DATA.ref.filter(function(p){return p.x>=XMIN&&p.x<=XMAX;});
    wS.unshift({label:'London City m/s',data:binMean(refWin,'wind',wBin),
                borderColor:cssvar('--blue'),borderWidth:2,pointRadius:0,tension:.4});
  }
  if(view==='outlook'&&fc.length){
    wS.push({label:'Wind ahead',data:binMean(fc.filter(function(p){return p.x>Date.now();}),'wind',wBin),
             borderColor:cssvar('--blue'),borderDash:[2,3],borderWidth:1.6,pointRadius:0,tension:.4});
  }
  mk('cW',wS,plugins.concat([windRibbon]),{zero:true});

  var rS=[{label:'Rain, mm in the hour to each reading',data:ds(out,'rain'),borderColor:cssvar('--blue'),borderWidth:2,pointRadius:0,tension:.3}];
  if(view==='outlook'&&fc.length){
    rS.push({label:'Rain ahead',data:fcDs('rain'),borderColor:cssvar('--blue'),borderDash:[2,3],borderWidth:1.6,pointRadius:0,tension:.3});
  }
  mk('cRain',rS,plugins,{zero:true});

}

/* Each view has its own link, so a view can be sent to someone:
   #outlook, #two-days, #week and #record. */
var VIEW_HASH={outlook:'outlook',now:'two-days',week:'week',record:'record'};
function viewFromHash(){
  var h=(location.hash||'').replace('#','');
  for(var k in VIEW_HASH){ if(VIEW_HASH[k]===h) return k; }
  return null;
}
function pressView(view){
  var btns=document.querySelectorAll('.range button');
  Array.prototype.forEach.call(btns,function(o){
    o.setAttribute('aria-pressed',o.getAttribute('data-view')===view?'true':'false');
  });
}
function wireButtons(){
  var btns=document.querySelectorAll('.range button');
  Array.prototype.forEach.call(btns,function(b){
    b.addEventListener('click',function(){
      var v=b.getAttribute('data-view')||'week';
      pressView(v);
      if(history.replaceState) history.replaceState(null,'','#'+VIEW_HASH[v]);
      build(v);
    });
  });
  window.addEventListener('hashchange',function(){
    var v=viewFromHash(); if(v){ pressView(v); build(v); }
  });
}

function paintSection(li,lo){
  var holder=document.getElementById('section-holder');
  if(!holder) return;
  fetch('Rotunda-section-monitoring.svg?v=20260926c').then(function(r){
    if(!r.ok) throw new Error('svg '+r.status);
    return r.text();
  }).then(function(txt){
    holder.innerHTML=txt;
    function set(id,attr,val){
      var el=holder.querySelector('#'+id); if(!el) return;
      if(attr==='text'){ el.textContent=val; } else { el.setAttribute(attr,val); }
    }
    /* latest reading per device */
    var latest={};
    DATA.all.forEach(function(p){
      if(!latest[p.dev] || p.x>latest[p.dev].x) latest[p.dev]=p;
    });
    function fmt(p){
      var s=p.t.toFixed(1)+'\u00B0C \u00B7 '+p.rh.toFixed(0)+'%';
      if(isFinite(p.p)) s+=' \u00B7 surface '+p.p.toFixed(1)+'\u00B0C';
      return s;
    }
    /* Markers are fixed in meaning: dark for air, red for surface.
       Values are carried by the labels. */
    /* The ring's two probe markers: one surface type each once probes are on
       different surfaces, otherwise a single mean on the left-hand marker. */
    function setRingProbe(){
      var ps=RING.map(function(d){return latest[d];})
              .filter(function(p){return p&&isFinite(p.p);});
      if(!ps.length) return;
      function mean(a){return a.reduce(function(s,p){return s+p.p;},0)/a.length;}
      var sk=ps.filter(onSarking), po=ps.filter(function(p){return surfaceAt(p.dev,p.x)==='post';});
      if(po.length){
        if(sk.length) set('pval-ringS','text','sarking '+mean(sk).toFixed(1)+'\u00B0C');
        set('pval-ringN','text','post '+mean(po).toFixed(1)+'\u00B0C');
      } else {
        set('pval-ringS','text',mean(ps).toFixed(1)+'\u00B0C');
      }
    }
    function paint(id,devs,labelOnly){
      var ps=devs.map(function(d){return latest[d];}).filter(Boolean);
      if(!ps.length) return;
      var mt=ps.reduce(function(s,p){return s+p.t;},0)/ps.length;
      var mr=ps.reduce(function(s,p){return s+p.rh;},0)/ps.length;
      var pr=ps.filter(function(p){return isFinite(p.p);});
      var mp=pr.length?pr.reduce(function(s,p){return s+p.p;},0)/pr.length:NaN;
      if(!labelOnly && isFinite(mp)) set('pval-'+id,'text',mp.toFixed(1)+'\u00B0C');
      set('val-'+id,'text',mt.toFixed(1)+'\u00B0C \u00B7 '+mr.toFixed(0)+'%');
    }
    /* both ring markers coloured; one shared label carries the mean */
    paint('ring',RING,true);
    setRingProbe();
    paint('MTS-76',['MTS-76']);
    paint('MTS-77',['MTS-77']);
    paint('MTS-80',['MTS-80']);
    paint('MTS-81',['MTS-81']);
    if(lo){
      set('val-WST','text',lo.t.toFixed(1)+'\u00B0C \u00B7 '+lo.rh.toFixed(0)+'%');
    }
  }).catch(function(){
    holder.innerHTML='<img src="Rotunda-section-monitoring.svg?v=20260926c" alt="Section through the Rotunda showing the monitoring positions" style="width:100%;height:auto;display:block">';
  });
}

function rows(list){
  return list.map(function(r){
    return {x:Date.parse(r.Time),
            dev:r.Device||'',
            t:parseFloat(r.AirTempC),
            rh:parseFloat(r.RH),
            p:parseFloat(r.ProbeTempC),
            press:parseFloat(r.PressurehPa),
            wind:parseFloat(r.WindMs),
            gust:parseFloat(r.GustMs),
            lux:parseFloat(r.LightLux),
            racc:parseFloat(r.RainAccMm!==undefined?r.RainAccMm:r.RainAccmm),
            rmask:rainMasked(Date.parse(r.Time)),
            rain:NaN};
  }).filter(function(p){return isFinite(p.x)&&isFinite(p.t);})
    .sort(function(a,b){return a.x-b.x;});
}

wireButtons();

Promise.all([
  fetch(GVQ('raw',WINDOW_DAYS)).then(function(r){return r.text();}),
  fetch(GVQ('weather',WINDOW_DAYS)).then(function(r){return r.text();}),
  fetch(GV+'forecast').then(function(r){return r.text();}).catch(function(){return '';}),
  fetch(GV+'events').then(function(r){return r.text();}).catch(function(){return '';}),
  /* Written by the v7 script; absent until it is deployed. Everything below
     tolerates an empty result, so the page works either way. The tab is named
     'metar' because 'reference' already holds the sheet's own documentation. */
  fetch(GVQ('metar',WINDOW_DAYS)).then(function(r){return r.text();}).catch(function(){return '';})
]).then(function(res){
  var raw=csv(res[0]).filter(function(r){
    return /^MTS-/.test(r.Device||'') && r.Fcnt!=='999' && r.AirTempC!=='' && r.AirTempC!=='-40.6';});
  var wx=csv(res[1]).filter(function(r){return r.AirTempC!=='';});
  var fc=csv(res[2]||'').filter(function(r){return r.OutTempC!==undefined&&r.OutTempC!=='';})
    .map(function(r){return {x:Date.parse(r.Time),t:parseFloat(r.OutTempC),
      rh:parseFloat(r.OutRH),rain:parseFloat(r.RainMmH),
      cloud:parseFloat(r.CloudPct),
      /* Present once the forecast fetcher writes them; NaN until then, which every
         consumer already tolerates. Locationforecast returns wind_speed and
         wind_from_direction in the same instant block as air_temperature. */
      wind:parseFloat(r.OutWindMs),
      wdir:parseFloat(r.OutWindDirDeg)};})
    .filter(function(p){return isFinite(p.x)&&isFinite(p.t)&&p.x>Date.now()-3600000;})
    .sort(function(a,b){return a.x-b.x;});
  /* Events tab: a hand-kept log of interventions. Columns: Time (ISO), Event
     ('door open' / 'door closed', or any open/closed pair sharing a name),
     Note. Open/closed pairs of the same name become shaded spans on the
     charts; an unclosed 'open' runs to the present moment. */
  var events=[];
  csv(res[3]||'').forEach(function(r){
    var x=Date.parse(r.Time||''); if(!isFinite(x)) return;
    var ev=(r.Event||'').toLowerCase().trim(); if(!ev) return;
    events.push({x:x,ev:ev,note:r.Note||''});
  });
  events.sort(function(a,b){return a.x-b.x;});
  var spans=[],openAt={};
  events.forEach(function(e){
    var name=e.ev.replace(/\s*(open(ed)?|closed?|shut)\s*$/,'').trim()||'door';
    if(/open/.test(e.ev)) openAt[name]=e.x;
    else if(/clos|shut/.test(e.ev)){
      if(openAt[name]!==undefined){spans.push({a:openAt[name],b:e.x,name:name}); delete openAt[name];}
    }
  });
  Object.keys(openAt).forEach(function(n){spans.push({a:openAt[n],b:Date.now(),name:n,open:true});});
  EVENT_SPANS=spans;

  var all=rows(raw).filter(inService);
  DATA={all:all,
        inn:all.filter(function(p){return p.dev==='MTS-77';}),
        ring:all.filter(function(p){return RING.indexOf(p.dev)>=0;}),
        walk:all.filter(function(p){return p.dev==='MTS-76';}),
        high:all.filter(function(p){return p.dev==='MTS-81';}),
        out:deriveRain(rows(wx)),
        ref:csv(res[4]||'').filter(function(r){return r.RefWindMs!==undefined&&r.RefWindMs!=='';})
             .map(function(r){return {x:Date.parse(r.Time),wind:parseFloat(r.RefWindMs),
                                      wdir:parseFloat(r.RefWindDirDeg),
                                      cloud:oktaOf(r.RefRaw)};})
             .filter(function(p){return isFinite(p.x)&&isFinite(p.wind);})
             .sort(function(a,b){return a.x-b.x;}),
        fc:fc};
  if(!DATA.inn.length){ note('No readings available at the moment.'); return; }

  var li=DATA.inn[DATA.inn.length-1];
  var lo=DATA.out.length?DATA.out[DATA.out.length-1]:null;
  var margin=isFinite(li.p)?(li.p-dew(li.t,li.rh)):null;

  buildVerdict();

  function put(id,val){var el=document.getElementById(id); if(el) el.textContent=val;}
  /* The king post sensor has the weakest radio path in the array and drops
     uplinks, so a reading more than three hours old is not shown as current. */
  var lk=DATA.high.length?DATA.high[DATA.high.length-1]:null;
  if(lk && lk.x<Date.now()-3*3600000) lk=null;
  put('s-roof-t', lk?lk.t.toFixed(1):'\u2013');
  put('s-roof-rh',lk?lk.rh.toFixed(0):'\u2013');
  put('s-floor-t',li.t.toFixed(1));
  put('s-out-t',lo?lo.t.toFixed(1):'\u2013');

  put('s-floor-rh',li.rh.toFixed(0));

  /* The two figures the vent judgement turns on, side by side. */
  put('s-ah-in', ah(li).toFixed(1));
  put('s-ah-out', lo?ah(lo).toFixed(1):'\u2013');

  /* Not the floor sensor's margin but the smallest anywhere in the array, which is
     what the chart below plots and what actually governs. */
  var tight=null;
  ['inn','ring','walk','high'].forEach(function(k){
    (DATA[k]||[]).forEach(function(p){
      if(p.x<Date.now()-2*3600000||!isFinite(p.p)) return;
      var m=p.p-dew(p.t,p.rh);
      if(tight===null||m<tight) tight=m;
    });
  });
  put('s-margin',tight!==null?((tight>0?'+':tight<0?'\u2212':'')+Math.abs(tight).toFixed(1)):'\u2013');
  /* At or below zero the surface is colder than the dew point of the air beside it,
     so water is forming on it now. The figure is then a depth below dew point, not a
     margin, and the box says so in the warning colour. */
  var mb=document.getElementById('s-margin-box');
  if(mb){
    var wet=(tight!==null&&tight<=0);
    mb.classList.toggle('alarm',wet);
    put('s-margin-l',wet?'Condensing now: surface below dew point \u00b0C':'Margin to condensation, closest surface \u00b0C');
  }
  note('Latest reading '+new Date(li.x).toLocaleString('en-GB',
      {weekday:'short',hour:'2-digit',minute:'2-digit'})+' \u00b7 updates every five minutes');

  var startView=viewFromHash()||'outlook';
  pressView(startView);
  build(startView);
  paintSection(li,lo);
}).catch(function(err){
  note('Live data unavailable at the moment.');
  if(window.console) console.error('Rotunda monitoring:',err);
});
})();
