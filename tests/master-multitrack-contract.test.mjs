import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const app=fs.readFileSync(new URL('../app-v10.3.2.html',import.meta.url),'utf8');
function source(start,end){
  const a=app.indexOf(start),b=app.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a,'source slice missing: '+start);
  return app.slice(a,b);
}
const fnSource=source('function renderStructuredSource84(ctx,dest,track,map){','state.repair83=state.repair83||');
function harness(){
  const events={sources:[],envelopes:[],pans:[]};
  const param=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){}});
  const ctx={
    createBufferSource(){const src={buffer:null,connect(){return this},start(when,offset,duration){events.sources.push({id:this.buffer?.id,when,offset,duration})}};return src},
    createGain(){return {gain:param(),connect(){return this}}}
  };
  const env=(gain,t,base,start,end,offset)=>events.envelopes.push({id:t.id,base,start,end,offset,trackGain:t.gain,fadeIn:t.fadeIn,fadeOut:t.fadeOut});
  const pan=(ctx,node,dest,value)=>{events.pans.push(value);return dest};
  const els={structuralCrossfade:{value:'18'}};
  const render=(new Function('envelope','stereoDestination','els',fnSource+';return renderStructuredSource84;'))(env,pan,els);
  return {render,ctx,events};
}
const track=(id,start,dur,opts={})=>({id,start,buffer:{id,duration:dur},gain:1,pan:0,fadeIn:0,fadeOut:0,...opts});
test('master uses every audible audio track instead of choosePitchTrack',()=>{
  const s=source('async function renderMasterMix(){','async function exportMasterMixWav(){');
  assert.match(s,/state\.tracks\.filter\(t=>t\.buffer&&shouldPlayTrack\(t\)\)/);
  assert.match(s,/for\(const track of audibleAudioTracks\)renderStructuredSource84\(ctx,audioBus,track,structureMap\)/);
  assert.doesNotMatch(s,/choosePitchTrack\(/);
});
test('two tracks with different starts both schedule at correct timestamps',()=>{
  const h=harness(),a=track('backing',0,2),b=track('vocal',.75,1,{gain:.5,pan:.4,fadeIn:.1});
  h.render(h.ctx,{},a,null);h.render(h.ctx,{},b,null);
  assert.deepEqual(h.events.sources,[{id:'backing',when:0,offset:0,duration:2},{id:'vocal',when:.75,offset:0,duration:1}]);
  assert.deepEqual(h.events.pans,[0,.4]);
  assert.equal(h.events.envelopes[1].trackGain,.5);
  assert.equal(h.events.envelopes[1].fadeIn,.1);
});
test('negative-start vocal trims leading audio but preserves zero origin',()=>{
  const h=harness();h.render(h.ctx,{},track('vocal',-.5,2),null);
  assert.deepEqual(h.events.sources,[{id:'vocal',when:0,offset:.5,duration:1.5}]);
});
test('structural cut and copy schedule every clip on same mapped timeline',()=>{
  const h=harness(),map={segments:[
    {srcStart:0,srcEnd:1,dstStart:0},
    {srcStart:2,srcEnd:3,dstStart:1},
    {srcStart:0,srcEnd:1,dstStart:2}
  ]};
  h.render(h.ctx,{},track('backing',0,3),map);
  h.render(h.ctx,{},track('vocal',.5,2),map);
  assert.deepEqual(h.events.sources.filter(s=>s.id==='backing').map(s=>[s.when,s.offset,s.duration]),[[0,0,1],[1,2,1],[2,0,1]]);
  assert.deepEqual(h.events.sources.filter(s=>s.id==='vocal').map(s=>[s.when,s.offset,s.duration]),[[.5,0,.5],[1,1.5,.5],[2.5,0,.5]]);
});
test('master source volume zero is retained and mute/solo filtering happens before render',()=>{
  const s=source('async function renderMasterMix(){','async function exportMasterMixWav(){');
  assert.match(s,/Number\(els\.masterSourceGain\?\.value\?\?100\)/);
  assert.match(s,/filter\(t=>t\.buffer&&shouldPlayTrack\(t\)\)/);
  assert.match(source('function timelineDuration86(){','function validateMasterTimeline86(){'),/shouldPlayTrack\(t\)/);
});

function midiHarness(tracks,bpm='96'){
  const slice=source('  function vlq(value){','  function downloadBlob(blob,name){');
  return new Function('state','els',slice+';return midiFile;')({tracks},{bpm:{value:bpm}});
}
async function midiNoteEvents(blob){
  const bytes=new Uint8Array(await blob.arrayBuffer());
  assert.equal(new TextDecoder().decode(bytes.slice(0,4)),'MThd');
  assert.equal(new TextDecoder().decode(bytes.slice(14,18)),'MTrk');
  const trackSize=new DataView(bytes.buffer).getUint32(18,false);
  assert.equal(bytes.length,22+trackSize);
  let pos=22,tick=0;
  const vlq=()=>{let n=0,part;do{assert.ok(pos<bytes.length);part=bytes[pos++];n=(n<<7)|(part&127)}while(part&128);return n};
  const events=[];
  while(pos<bytes.length){
    tick+=vlq();const status=bytes[pos++];
    if(status===0xff){pos++;const metaLength=vlq();pos+=metaLength;continue}
    assert.ok(status===0x80||status===0x90,'unexpected channel event');
    const pitch=bytes[pos++];pos++;
    events.push({tick,kind:status===0x90?'on':'off',pitch});
  }
  assert.equal(pos,bytes.length);
  return events;
}
test('midi export preserves timing when a saved guide omits track.start',async()=>{
  const guide={type:'guide',duration:1.5,notes:[{start:0,duration:.25,midi:60},{start:1,duration:.25,midi:64}]};
  const snapshot=structuredClone(guide);
  const events=await midiNoteEvents(midiHarness([guide])());
  assert.deepEqual(events,[{tick:0,kind:'on',pitch:60},{tick:192,kind:'off',pitch:60},{tick:768,kind:'on',pitch:64},{tick:960,kind:'off',pitch:64}]);
  assert.deepEqual(guide,snapshot,'MIDI export must not mutate the original guide');
});
test('negative guide start clips its onset and discards fully inaudible notes',async()=>{
  const guide={type:'guide',start:-.3,duration:1,notes:[
    {start:0,duration:.1,midi:50},
    {start:.2,duration:.3,midi:62},
    {start:.6,duration:.2,midi:65}
  ]};
  const events=await midiNoteEvents(midiHarness([guide])());
  assert.deepEqual(events,[
    {tick:0,kind:'on',pitch:62},{tick:154,kind:'off',pitch:62},
    {tick:230,kind:'on',pitch:65},{tick:384,kind:'off',pitch:65}
  ]);
});
test('no audible notes or unsafe pitches never become phantom MIDI events',async()=>{
  const invisible={type:'guide',start:-1,notes:[{start:0,duration:.5,midi:60}]};
  assert.equal(midiHarness([invisible])(),null);
  const invalid={type:'guide',notes:[{start:0,duration:.2,midi:200},{start:0,duration:NaN,midi:61}]};
  assert.equal(midiHarness([invalid])(),null);
  const fallback={type:'melody',notes:[{start:0,duration:.5,midi:72}]};
  assert.deepEqual((await midiNoteEvents(midiHarness([fallback])())).map(x=>x.pitch),[72,72]);
});

test('humming guide instrument has an auditable preview and no user audio requirement',()=>{
  assert.match(app,/<option value="humming">ハミング風/);
  assert.match(app,/id="previewGuideInstrument"/);
  assert.match(app,/humming:"ハミング風"/);
  const preview=source('  async function previewGuideInstrument(){','  function listenGroup(track){');
  assert.match(preview,/ensureAudioContext\(\)/);
  assert.match(preview,/scheduleGuide\(ctx,ctx\.destination,\{\.\.\.track,notes:phrase\},base,0,Infinity,false\)/);
  assert.doesNotMatch(preview,/state\.tracks\.(push|splice|pop|shift|unshift)|persistProject|fetch\(/);
});
function hummingHarness(){
  const src=source('  function scheduleTone(ctx,destination,track,note,base,windowStart,windowEnd,collect){','  function scheduleGuide(ctx,destination,track,base,windowStart=0,windowEnd=Infinity,collect=true) {');
  const f=new Function('state','midiHz','stereoDestination','noiseBuffer','collectNode',src+';return scheduleTone;');
  const events={oscs:[],filters:[],gainChanges:[]};
  function parameter(){return {value:0,setValueAtTime(v,t){this.value=v;events.gainChanges.push({v,t})},linearRampToValueAtTime(v,t){events.gainChanges.push({v,t})},exponentialRampToValueAtTime(v,t){events.gainChanges.push({v,t})}}}
  const ctx={
    createGain(){return {gain:parameter(),connect(){return this}}},
    createBiquadFilter(){const node={type:'',Q:parameter(),gain:parameter(),frequency:parameter(),connect(){return this}};events.filters.push(node);return node},
    createOscillator(){const node={type:'sine',frequency:parameter(),detune:parameter(),connect(){return this},start(t){events.oscs.push({type:this.type,freq:this.frequency.value,time:t})},stop(){}};return node}
  };
  const run=f({guideInstrument:'humming'},(midi,cents=0)=>440*Math.pow(2,((midi-69)+(cents/100))/12),()=>{},()=>{throw Error('humming must not require a noise sample')},()=>{});
  return {run,ctx,events};
}
test('humming synthesizer emits pitched harmonic voice-like partials without percussion transients',()=>{
  const h=hummingHarness();
  h.run(h.ctx,{}, {type:'guide',gain:.75,pan:0,guideInstrument:'humming'}, {start:.12,duration:.48,midi:60,velocity:.8}, 1,0,Infinity,false);
  const harmonic=h.events.oscs.filter(x=>x.freq>100);
  assert.equal(harmonic.length,5,'fundamental plus four integer harmonics');
  const root=harmonic[0].freq;
  assert.ok(root>260&&root<263);
  for(let i=0;i<harmonic.length;i++)assert.ok(Math.abs(harmonic[i].freq/root-(i+1))<.001);
  assert.ok(h.events.oscs.some(x=>Math.abs(x.freq-5.05)<.001),'soft 5 Hz vibrato');
  assert.equal(h.events.filters[0].type,'lowpass');
  assert.ok(h.events.filters[0].frequency.value<3300,'avoid excessive bright harmonics');
  assert.equal(h.events.filters[1].type,'peaking');
  assert.equal(h.events.filters[1].frequency.value,960);
  assert.ok(h.events.gainChanges.every(x=>Number.isFinite(x.t)&&Number.isFinite(x.v)));
});
test('humming guide tolerates omitted start and never schedules clipped or invalid notes',()=>{
  const h=hummingHarness(),track={type:'guide',gain:.7,guideInstrument:'humming'};
  h.run(h.ctx,{},track,{start:0,duration:.4,midi:69},.1,0,Infinity,false);
  assert.equal(h.events.oscs.filter(x=>x.freq>100).length,5);
  const prior=h.events.oscs.length;
  h.run(h.ctx,{}, {...track,start:-2},{start:0,duration:.3,midi:69},.1,0,Infinity,false);
  h.run(h.ctx,{},track,{start:0,duration:NaN,midi:69},.1,0,Infinity,false);
  assert.equal(h.events.oscs.length,prior,'silent/invalid notes cannot produce new sources');
});

function legatoHarness(){
  const code=source('  function hummingLegatoNotes(notes){','  async function previewGuideInstrument(){');
  const scheduled=[];
  const factory=new Function('state','scheduleDrum','scheduleTone',code+';return {hummingLegatoNotes,scheduleGuide};');
  const methods=factory({guideInstrument:'electone'},()=>{throw Error('fixture contains no drums')},(_ctx,_dst,_track,note)=>scheduled.push({...note}));
  return {...methods,scheduled};
}
test('humming guide links micro-gaps while preserving breaths and original note data',()=>{
  const h=legatoHarness();
  const notes=[{start:0,duration:.32,midi:60},{start:.38,duration:.34,midi:62},{start:.78,duration:.36,midi:64},{start:1.30,duration:.4,midi:65}];
  const original=structuredClone(notes);
  h.scheduleGuide({}, {},{type:'guide',guideInstrument:'humming',notes},0,0,Infinity,false);
  assert.equal(h.scheduled.length,4);
  assert.ok(Math.abs(h.scheduled[0].duration-.398)<1e-9);
  assert.ok(Math.abs(h.scheduled[1].duration-.418)<1e-9);
  assert.equal(h.scheduled[2].duration,.36,'actual phrase rest must remain');
  assert.equal(h.scheduled[3].duration,.4);
  assert.deepEqual(notes,original,'no persistent notes changed');
});
test('humming-only legato never changes previous guide instruments or overlapping note positions',()=>{
  const h=legatoHarness();
  const notes=[{start:0,duration:.3,midi:60},{start:.31,duration:.2,midi:62},{start:.45,duration:.2,midi:64},{start:.7,duration:.3,midi:65}];
  h.scheduleGuide({}, {},{type:'guide',guideInstrument:'piano',notes},0,0,Infinity,false);
  assert.deepEqual(h.scheduled.map(n=>n.duration),[.3,.2,.2,.3]);
  h.scheduled.length=0;
  h.scheduleGuide({}, {},{type:'guide',guideInstrument:'humming',notes},0,0,Infinity,false);
  assert.ok(Math.abs(h.scheduled[0].duration-.328)<1e-9);
  assert.equal(h.scheduled[1].duration,.2,'overlap should not be extended again');
  assert.ok(Math.abs(h.scheduled[2].duration-.268)<1e-9);
  assert.deepEqual(notes[0],{start:0,duration:.3,midi:60});
});
test('humming legato ignores broken note boundaries or transitions involving drums',()=>{
  const h=legatoHarness();
  const notes=[{start:0,duration:.2,midi:60},{start:.23,duration:.04,drum:'kick'},{start:.30,duration:NaN,midi:62},{start:.35,duration:.24,midi:65}];
  const result=h.hummingLegatoNotes(notes);
  assert.deepEqual(result,notes);
});

function masterGuideHarness({included=true,tracks=[]}={}){
  const code=source('  function audibleMasterGuideTracks(){','  async function renderMasterMix(){');
  const scheduled=[];
  const state={tracks,guideNotes:[]};
  const els={masterIncludeGuide:{checked:included}};
  const methods=new Function('state','els','shouldPlayTrack','scheduleGuide',code+';return {audibleMasterGuideTracks,masterGuideSourceEnd,renderMasterGuideTrack};')(
    state,els,t=>!t.mute&&(!state.tracks.some(x=>x.solo)||t.solo),
    (_ctx,_dst,track,base,from,to,collect)=>scheduled.push({track:structuredClone(track),base,from,to,collect})
  );
  return {...methods,scheduled,state,els};
}
test('MASTER guide is explicitly opt-in; mute and solo remain authoritative',()=>{
  const a={type:'guide',id:'humming-a',notes:[{start:.2,duration:.3,midi:69}],mute:false,solo:false};
  const b={type:'guide',id:'humming-b',notes:[{start:.1,duration:.3,midi:71}],mute:true,solo:false};
  const backing={type:'backing',buffer:{duration:1},mute:false,solo:false};
  const h=masterGuideHarness({included:false,tracks:[a,b,backing]});
  assert.deepEqual(h.audibleMasterGuideTracks(),[],'default export must never include guide');
  h.els.masterIncludeGuide.checked=true;
  assert.deepEqual(h.audibleMasterGuideTracks().map(t=>t.id),['humming-a']);
  backing.solo=true;
  assert.deepEqual(h.audibleMasterGuideTracks(),[],'soloing backing prevents guide leakage');
  backing.solo=false;a.solo=true;
  assert.deepEqual(h.audibleMasterGuideTracks().map(t=>t.id),['humming-a']);
  assert.match(app,/<input id="masterIncludeGuide" type="checkbox"> ガイドメロディも入れる/);
  const exportCode=source('  async function renderMasterMix(){','  async function exportMasterMixWav(){');
  assert.match(exportCode,/const guideTracks=audibleMasterGuideTracks\(\)/);
  assert.match(exportCode,/if\(guideTracks\.length\)for\(const guide of guideTracks\)renderMasterGuideTrack\(/);
  assert.match(exportCode,/else if\(manualGuide\)/,'piano-roll legacy fallback must remain');
});
test('MASTER guide duration includes negative source start but no invented silence',()=>{
  const h=masterGuideHarness();
  const notes=[{start:0,duration:.2,midi:60},{start:1,duration:.4,midi:64},{start:2,duration:NaN,midi:65}];
  const track={type:'guide',start:-.3,notes};
  assert.ok(Math.abs(h.masterGuideSourceEnd(track)-1.1)<1e-9);
  assert.equal(h.masterGuideSourceEnd({...track,start:-10}),0);
});
test('MASTER guide schedules live notes without mutation when no structure map exists',()=>{
  const h=masterGuideHarness(),track={type:'guide',guideInstrument:'humming',start:.1,gain:.75,notes:[{start:0,duration:.3,midi:69},{start:.36,duration:.3,midi:71}]};
  const original=structuredClone(track);
  h.renderMasterGuideTrack({}, {},track,null,3);
  assert.equal(h.scheduled.length,1);
  assert.deepEqual(h.scheduled[0].track,track,'same note data passed to live scheduler');
  assert.equal(h.scheduled[0].to,3);
  assert.equal(h.scheduled[0].collect,false);
  assert.deepEqual(track,original,'no saved notes modified');
});
test('MASTER structure cuts/repeats map guide notes to the same output timeline as audio',()=>{
  const h=masterGuideHarness(),track={type:'guide',guideInstrument:'humming',start:.2,gain:.8,notes:[
    {start:0,duration:.6,midi:60},{start:.9,duration:.5,midi:64}
  ]};
  const original=structuredClone(track);
  const map={segments:[
    {srcStart:0,srcEnd:.6,dstStart:0},
    {srcStart:1,srcEnd:1.6,dstStart:.6},
    {srcStart:0,srcEnd:.6,dstStart:1.2}
  ]};
  h.renderMasterGuideTrack({}, {},track,map,2);
  assert.equal(h.scheduled.length,3);
  assert.deepEqual(h.scheduled.map(x=>x.track.notes.map(n=>({start:Number(n.start.toFixed(3)),duration:Number(n.duration.toFixed(3)),midi:n.midi}))),[
    [{start:.2,duration:.4,midi:60}],
    [{start:.7,duration:.5,midi:64}],
    [{start:1.4,duration:.4,midi:60}]
  ]);
  assert.ok(h.scheduled.every(x=>x.track.start===0&&x.track.guideInstrument==='humming'));
  assert.deepEqual(track,original);
});

function chunkedPcmHarness(){
  const code=source('  function pcmRange(buffer,from=0,to=buffer.length){','  function wavHeader(rate,frames){');
  const calls=[];
  const buffer=(left,right=left)=>({length:left.length,numberOfChannels:2,getChannelData(i){return i===0?left:right}});
  const render=async(from,to,rate)=>{
    calls.push({from,to,rate});
    const count=Math.max(1,Math.round((to-from)*rate));
    const chunkIndex=Math.floor((to-.0000001)/5);
    const value=chunkIndex%2===0?.4:-.4;
    return buffer(new Float32Array(count).fill(value));
  };
  const runner=new Function('buildChunk',code+';return {renderChunkedMixPcm,pcmCrossfadeSeam,pcmSeamTail,pcmRange};')(render);
  return {...runner,calls};
}
function pcmSamples(parts){
  const bytes=Buffer.concat(parts.map(p=>Buffer.from(p)));
  assert.equal(bytes.length%4,0);
  const data=[];
  for(let i=0;i<bytes.length;i+=4)data.push(bytes.readInt16LE(i)/32768);
  return data;
}
test('5-second Safari WAV chunk stitch has exact frames and smooth 100ms seam',async()=>{
  const h=chunkedPcmHarness(),progress=[];
  const {parts,frames}=await h.renderChunkedMixPcm(11.2,1000,5,async(done,total)=>progress.push([done,total]));
  assert.equal(frames,11200);
  assert.deepEqual(progress,[[1,3],[2,3],[3,3]]);
  assert.deepEqual(h.calls.map(x=>[Math.round(x.from*1000),Math.round(x.to*1000)]),[[0,5000],[4900,10000],[9900,11200]]);
  const data=pcmSamples(parts);
  assert.equal(data.length,11200);
  assert.ok(data[4920]>.2&&data[4980]<-.2,'fade should transition through first seam');
  assert.ok(Math.abs(data[4950])<.02,'mid-seam transition must be quiet instead of a hard jump');
  assert.ok(data[4990]<-.25,'end of seam should match the new synth oscillator');
  assert.ok(data[9990]>.25,'later seam must smoothly transition back to old polarity');
});
test('10-second desktop WAV chunk stitch preserves total duration across fractional end',async()=>{
  const h=chunkedPcmHarness(),duration=20.017;
  const result=await h.renderChunkedMixPcm(duration,1000,10);
  assert.equal(result.frames,20017);
  assert.equal(pcmSamples(result.parts).length,20017);
  assert.equal(h.calls.length,3);
  assert.equal(Math.round(h.calls[1].from*1000),9900);
  assert.equal(Math.round(h.calls[2].from*1000),19900);
});
test('full-song 195s segmented synthesis preserves all samples and bounded overlap',async()=>{
  const h=chunkedPcmHarness(),duration=195.22,rate=1000;
  const r=await h.renderChunkedMixPcm(duration,rate,5);
  assert.equal(r.frames,195220);
  assert.equal(r.parts.reduce((n,p)=>n+p.byteLength,0),195220*4);
  assert.equal(h.calls.length,40);
  assert.ok(h.calls.every(c=>c.to-c.from<=5.101),'no full-song offline context should be allocated');
});

function pitchPeakHarness(){
  const helper=source('  function chooseGuideFundamentalLag(correlations,minLag,bestLag,bestCorr){','  async function extractGuide(){');
  return new Function(helper+';return chooseGuideFundamentalLag;')();
}
function syntheticPitchCorrelations(frequency){
  const rate=12000,win=1024,minLag=Math.floor(rate/1000),maxLag=Math.ceil(rate/70);
  const data=Float32Array.from({length:win},(_,i)=>Math.sin(2*Math.PI*frequency*i/rate));
  let mean=0;
  for(let i=0;i<win;i+=4)mean+=data[i];
  mean/=Math.ceil(win/4);
  const correlations=new Float32Array(maxLag+2);
  let bestCorr=-1,bestLag=0;
  for(let lag=minLag;lag<=maxLag;lag++){
    let xy=0,xx=0,yy=0;
    for(let j=0;j<win-lag;j+=4){const a=data[j]-mean,b=data[j+lag]-mean;xy+=a*b;xx+=a*a;yy+=b*b}
    correlations[lag]=xy/Math.sqrt(Math.max(1e-12,xx*yy));
    if(correlations[lag]>bestCorr){bestCorr=correlations[lag];bestLag=lag}
  }
  return {correlations,minLag,bestLag,bestCorr};
}
test('pitch analysis chooses first strong autocorrelation period rather than distant octave multiples',()=>{
  const choose=pitchPeakHarness();
  for(const [freq,targetMidi] of [[261.6256,60],[523.2511,72],[440,69],[880,81],[329.63,64],[659.25,76]]){
    const x=syntheticPitchCorrelations(freq);
    const chosen=choose(x.correlations,x.minLag,x.bestLag,x.bestCorr);
    const measured=69+12*Math.log2(12000/chosen/440);
    assert.ok(Math.abs(measured-targetMidi)<=.8,
      `expected MIDI ${targetMidi} for ${freq}Hz, measured ${measured.toFixed(2)} from lag ${chosen}`);
  }
});
test('integer-lag octave errors in a vibrato harmonic singer resolve to the earliest strong 880 Hz period',()=>{
  const choose=pitchPeakHarness(),rate=12000,window=1024,freq=880;
  for(const offset of [.07,.18,.30,.50]){
    const data=new Float32Array(window),start=offset;
    for(let i=0;i<window;i++){
      const t=start+i/rate;
      const phase=2*Math.PI*freq*(t+(15/1200)*Math.sin(2*Math.PI*4.8*t)/(2*Math.PI*4.8));
      data[i]=.37*Math.sin(phase)+.29*Math.sin(2*phase+.15)+.18*Math.sin(3*phase+.6)+.1*Math.sin(4*phase+.3);
    }
    const minLag=12,maxLag=172,mean=data.filter((_,i)=>i%4===0).reduce((a,b)=>a+b,0)/256;
    const corr=new Float32Array(maxLag+2);
    let best=-1,bestLag=0;
    for(let lag=minLag;lag<=maxLag;lag++){
      let xy=0,xx=0,yy=0;
      for(let j=0;j<window-lag;j+=4){const a=data[j]-mean,b=data[j+lag]-mean;xy+=a*b;xx+=a*a;yy+=b*b}
      const c=xy/Math.sqrt(Math.max(1e-12,xx*yy));corr[lag]=c;
      if(c>best){best=c;bestLag=lag}
    }
    const resolved=choose(corr,minLag,bestLag,best);
    const midi=69+12*Math.log2(rate/resolved/440);
    assert.ok(Math.abs(midi-81)<.8,`880Hz harmonic singer at ${offset}s must remain A5; lag=${resolved}, bestLag=${bestLag}, bestCorr=${best}`);
  }
});
test('octave peak preference is disabled for uncertain or flat correlation surfaces',()=>{
  const choose=pitchPeakHarness(),c=new Float32Array(40);
  c[12]=.62;c[13]=.60;c[25]=.75;c[24]=.7;c[26]=.70;
  assert.equal(choose(c,11,25,.75),25,'low confidence remains untouched');
  const extraction=source('  async function extractGuide(){','  function transposeGuide(');
  assert.match(extraction,/lastConfidentTime=-Infinity/);
  assert.match(extraction,/withinPhrase=t-lastConfidentTime<=\.24/);
  assert.match(extraction,/if\(previousMidi&&withinPhrase&&confidence<\.82\)/,
    'confident interval leaps must not be octave-locked to the prior note');
  assert.doesNotMatch(extraction,/if\(previousMidi\)\{const candidates/,'unconditional prior-note octave locking cannot return');
});

function onsetCalibrationHarness(){
  const src=source('  function calibrateExtractedGuideOnsets(notes,windowSize,sampleRate){','  async function extractGuide(){');
  return new Function(src+';return calibrateExtractedGuideOnsets;')();
}
test('calibrateExtractedGuideOnsets copies only stable sung note starts and preserves their ends',()=>{
  const calibrate=onsetCalibrationHarness();
  const original=[
    {start:.36,duration:.9,midi:60,velocity:.8},
    {start:1.26,duration:.90,midi:62,velocity:.8},
    {start:0,duration:.7,midi:64},
    {start:.30,duration:.09,midi:67},
    {start:.4,duration:.8,drum:'kick'},
    {start:NaN,duration:.8,midi:69}
  ];
  const before=original.map(n=>({...n}));
  const shifted=calibrate(original,1024,12000);
  const compensation=1024/12000*.3;
  assert.ok(Math.abs(shifted[0].start-(original[0].start+compensation))<1e-9);
  assert.ok(Math.abs(shifted[0].duration-(original[0].duration-compensation))<1e-9);
  assert.ok(Math.abs(shifted[0].start+shifted[0].duration-(original[0].start+original[0].duration))<1e-9);
  assert.deepEqual(shifted.slice(2),original.slice(2),'song beginning, short notes, drums, malformed data unchanged');
  assert.deepEqual(original,before,'source note records are never changed');
  const extraction=source('  async function extractGuide(){','  function transposeGuide(');
  assert.match(extraction,/notes=calibrateExtractedGuideOnsets\(notes,win,targetRate\)/);
});
test('onset calibration bounds short-note compensation so pitch events remain valid',()=>{
  const calibrate=onsetCalibrationHarness();
  const short=[{start:.15,duration:.12,midi:67},{start:.01,duration:.5,midi:60},{start:0,duration:.2,midi:64}];
  const out=calibrate(short,1024,12000);
  assert.ok(out[0].duration>=.075);
  assert.equal(out[1],short[1]);
  assert.equal(out[2],short[2]);
  assert.ok(out[0].start>=short[0].start);
});

function guideTailWindowHarness(){
  const segment=source('  function guidePitchWindow(data,start,size,scratch){','  async function extractGuide(){');
  return new Function(segment+';return guidePitchWindow;')();
}
test('guide analysis keeps trailing partial windows without writing into original decoded vocal',()=>{
  const windowFn=guideTailWindowHarness();
  const vocal=Float32Array.from({length:1200},(_,i)=>i/1200);
  const frozen=Float32Array.from(vocal);
  const scratch=new Float32Array(1024);
  const full=windowFn(vocal,0,1024,scratch);
  assert.equal(full.length,1024);
  assert.equal(full[0],vocal[0]);
  assert.equal(full[1023],vocal[1023]);
  const partial=windowFn(vocal,1000,1024,scratch);
  assert.equal(partial.length,1024);
  assert.equal(partial[0],vocal[1000]);
  assert.equal(partial[199],vocal[1199]);
  assert.ok(partial.subarray(200).every(v=>v===0),'no repeated audio past the real end');
  const nearFinal=windowFn(vocal,1170,1024,scratch);
  assert.equal(nearFinal[29],vocal[1199]);
  assert.ok(nearFinal.subarray(30).every(v=>v===0),'scratch is cleared before each trailing frame');
  assert.deepEqual(vocal,frozen,'source sample array is unchanged');
});
test('guide extraction scans through final sample frame and clips generated note ends to source duration',()=>{
  const extraction=source('  async function extractGuide(){','  function transposeGuide(');
  assert.match(extraction,/const total=Math\.max\(1,Math\.ceil\(data\.length\/hop\)\)/);
  assert.match(extraction,/for\(let i=0,frame=0;i<data\.length;i\+=hop,frame\+\+\)/);
  assert.match(extraction,/const slice=guidePitchWindow\(data,i,win,scratch\)/);
  assert.match(extraction,/Math\.min\(duration,r\.end\)-r\.start/);
  assert.doesNotMatch(extraction,/i\+win<data\.length/,'song tail can no longer be omitted');
});

function bleedReductionHarness(){
  const segment=source('  function reduceGuideBackingLeak(vocalData,backingData,relativeStartFrames,sampleRate){','  async function extractGuide(){');
  return new Function(segment+';return reduceGuideBackingLeak;')();
}
test('opt-in reference cancellation removes delayed accompaniment without modifying original recording',()=>{
  const reduce=bleedReductionHarness(),rate=12000,len=rate*4,delay=Math.round(rate*.025);
  const backing=Float32Array.from({length:len},(_,i)=>{
    const t=i/rate;
    return .3*Math.sin(2*Math.PI*110*t)+.21*Math.sin(2*Math.PI*196*t)+.12*Math.sin(2*Math.PI*137*t)+.06*Math.sin(2*Math.PI*1901*t);
  });
  const voice=Float32Array.from({length:len},(_,i)=>{
    const t=i/rate;
    return t>1&&t<2.15?.23*Math.sin(2*Math.PI*440*t)+.08*Math.sin(2*Math.PI*880*t):0;
  });
  const mixture=Float32Array.from(voice,(v,i)=>v+(i>=delay?.37*backing[i-delay]:0));
  const sourceCopy=mixture.slice(),referenceCopy=backing.slice();
  const result=reduce(mixture,backing,0,rate);
  assert.ok(result.gain>.25&&result.gain<.5,'must estimate genuine positive bleed gain');
  assert.ok(Math.abs(result.lag+delay)<=8,'must align around 25ms input recording delay, found '+result.lag);
  let before=0,after=0;
  for(let i=0;i<len;i++){before+=(mixture[i]-voice[i])**2;after+=(result.samples[i]-voice[i])**2}
  assert.ok(after<before*.08,'reference cancellation must reduce backing residual energy by >92%');
  assert.deepEqual(mixture,sourceCopy,'input audio samples must not be changed');
  assert.deepEqual(backing,referenceCopy,'reference backing must not be changed');
});
test('unrelated backing and absent backing cannot modify a dry vocal',()=>{
  const reduce=bleedReductionHarness(),rate=12000,len=rate*2;
  const dry=Float32Array.from({length:len},(_,i)=>.2*Math.sin(2*Math.PI*440*i/rate));
  const unrelated=Float32Array.from({length:len},(_,i)=>.2*Math.sin(2*Math.PI*123*i/rate));
  assert.equal(reduce(dry,unrelated,0,rate).samples,dry,'unrelated reference should be a no-op');
  assert.equal(reduce(dry,null,0,rate).samples,dry,'missing reference should be a no-op');
  const extraction=source('  async function extractGuide(){','  function transposeGuide(');
  assert.match(extraction,/if\(els\.guideBackingReference\?\.checked\)/,'reference mode must be explicitly enabled');
  assert.match(extraction,/const backing=\[\.\.\.state\.tracks\]\.reverse\(\)\.find/,'actual backing track must be used');
});

test('time-varying 18ms to 43ms delay is cancelled per phrase without changing source',()=>{
  const reduce=bleedReductionHarness(),rate=12000,len=rate*12,split=rate*6;
  const backing=Float32Array.from({length:len},(_,i)=>{
    const t=i/rate;
    return .3*Math.sin(2*Math.PI*110*t)+.19*Math.sin(2*Math.PI*196*t)+.11*Math.sin(2*Math.PI*137*t)
      +.07*Math.sin(2*Math.PI*1901*t)+.07*Math.sin(2*Math.PI*(181*t+8*t*t));
  });
  const voice=Float32Array.from({length:len},(_,i)=>{
    const t=i/rate,active=(t>2&&t<3.6)||(t>8&&t<9.6);
    return active?.2*Math.sin(2*Math.PI*440*t)+.07*Math.sin(2*Math.PI*880*t):0;
  });
  const d1=Math.round(.018*rate),d2=Math.round(.043*rate);
  const mixture=Float32Array.from(voice,(v,i)=>v+.35*(i>=(i<split?d1:d2)?backing[i-(i<split?d1:d2)]:0));
  const before=mixture.slice(),backingBefore=backing.slice(),result=reduce(mixture,backing,0,rate);
  let earlyBefore=0,earlyAfter=0,lateBefore=0,lateAfter=0;
  for(let i=0;i<len;i++){
    const originalError=mixture[i]-voice[i],correctedError=result.samples[i]-voice[i];
    if(i<split){earlyBefore+=originalError**2;earlyAfter+=correctedError**2}
    else{lateBefore+=originalError**2;lateAfter+=correctedError**2}
  }
  assert.ok(earlyAfter<earlyBefore*.17,'first phrase must remove >83% of early backing leak');
  assert.ok(lateAfter<lateBefore*.17,'later phrase must remove >83% of changed-delay leak');
  assert.deepEqual(mixture,before,'source vocal samples must remain untouched');
  assert.deepEqual(backing,backingBefore,'reference samples must remain untouched');
  assert.ok(result.segments?.length>=3,'per-phrase models should be reported for diagnostics');
  assert.ok(result.segments.some(x=>Math.abs(x.lag+d1)<=8),'must identify first delay');
  assert.ok(result.segments.some(x=>Math.abs(x.lag+d2)<=8),'must identify changed delay');
});
