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
  const events={oscs:[],filters:[],gainChanges:[],gains:[]};
  function parameter(){return {value:0,history:[],setValueAtTime(v,t){this.value=v;this.history.push({kind:'set',v,t});events.gainChanges.push({v,t})},linearRampToValueAtTime(v,t){this.history.push({kind:'linear',v,t});events.gainChanges.push({v,t})},exponentialRampToValueAtTime(v,t){this.history.push({kind:'exp',v,t});events.gainChanges.push({v,t})}}}
  const ctx={
    createGain(){const gain=parameter();events.gains.push(gain);return {gain,connect(){return this}}},
    createBiquadFilter(){const node={type:'',Q:parameter(),gain:parameter(),frequency:parameter(),connect(){return this}};events.filters.push(node);return node},
    createPeriodicWave(real,imag,options){return {real:Array.from(real),imag:Array.from(imag),options}},
    createOscillator(){const node={type:'sine',wave:null,frequency:parameter(),detune:parameter(),connect(){return this},setPeriodicWave(wave){this.wave=wave},start(t){events.oscs.push({type:this.type,freq:this.frequency.value,time:t,wave:this.wave,freqHistory:structuredClone(this.frequency.history)})},stop(){}};return node}
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
  assert.ok(h.events.oscs.some(x=>x.freq>=4.7&&x.freq<=5.4),'gentle sustained ~5 Hz vibrato');
  assert.equal(h.events.filters[0].type,'lowpass');
  assert.ok(h.events.filters[0].frequency.value<3300,'avoid excessive bright harmonics');
  assert.equal(h.events.filters[1].type,'peaking');
  assert.equal(h.events.filters[1].frequency.value,960);
  assert.ok(h.events.gainChanges.every(x=>Number.isFinite(x.t)&&Number.isFinite(x.v)));
});
test('MUSIC-055 humming short syllables avoid synthetic pitch wobble',()=>{
  const h=hummingHarness(),track={type:'guide',gain:.75,pan:0,guideInstrument:'humming'};
  h.run(h.ctx,{},track,{start:.12,duration:.18,midi:67,velocity:.8},1,0,Infinity,false);
  const harmonics=h.events.oscs.filter(x=>x.freq>100);
  assert.equal(harmonics.length,5,'short notes still play all five voice-like harmonics');
  assert.equal(h.events.oscs.filter(x=>x.freq>=4.7&&x.freq<=5.4).length,0,
    'short syllables should not wobble at the onset');
});
test('MUSIC-055 sustained humming blooms into bounded, varied late vibrato',()=>{
  const track={type:'guide',gain:.75,pan:0,guideInstrument:'humming'};
  const note={start:.12,duration:.60,midi:64,velocity:.8},base=1;
  const h=hummingHarness();
  h.run(h.ctx,{},track,note,base,0,Infinity,false);
  const lfos=h.events.oscs.filter(x=>x.freq>=4.7&&x.freq<=5.4);
  assert.equal(lfos.length,2,'only two fundamental harmonics receive subtle vibrato');
  const first=h.events.gainChanges.find(x=>Math.abs(x.v-9.6)<1e-6);
  assert.ok(first,'fundamental vibrato depth is bounded to under twelve cents');
  const onset=base+note.start;
  assert.ok(first.t>=onset+.14&&first.t<=onset+.26+1e-9,
    'vibrato fades in after the start of the sustained vowel');
  const other=hummingHarness();
  other.run(other.ctx,{},track,{...note,start:.87,midi:69},base,0,Infinity,false);
  const otherLfo=other.events.oscs.find(x=>x.freq>=4.7&&x.freq<=5.4);
  assert.ok(otherLfo&&otherLfo.freq!==lfos[0].freq,
    'vibrato speed varies reproducibly across sung notes');
});
test('MUSIC-056 sustained humming vowel color follows original note progress at WAV chunk seams',()=>{
  const track={type:'guide',gain:.75,pan:0,guideInstrument:'humming'};
  const note={start:194.3,duration:1.2,midi:69,velocity:.8};
  const original=structuredClone(note);
  const left=hummingHarness(),right=hummingHarness(),whole=hummingHarness();
  left.run(left.ctx,{},track,note,0,190,195,false);
  right.run(right.ctx,{},track,note,0,195,196,false);
  whole.run(whole.ctx,{},track,note,0,0,196,false);
  const automation=h=>h.events.filters[1].frequency.history;
  const l=automation(left),r=automation(right),w=automation(whole);
  assert.equal(l.length,2);
  assert.equal(r.length,2);
  assert.equal(w.length,2);
  assert.equal(l[0].kind,'set');assert.equal(l[1].kind,'linear');
  assert.equal(r[0].kind,'set');assert.equal(r[1].kind,'linear');
  assert.ok(Math.abs(l[1].v-r[0].v)<1e-8,
    'adjacent 195-second timeline windows must match vowel frequency at their seam');
  assert.ok(Math.abs(l[0].v-w[0].v)<1e-8);
  assert.ok(Math.abs(r[1].v-w[1].v)<1e-8);
  assert.ok([...l,...r,...w].every(x=>x.v>=860&&x.v<=1060&&Number.isFinite(x.t)));
  assert.deepEqual(note,original,'no guide note data or source timing is mutated');
});
test('MUSIC-056 short humming and unrelated piano notes keep existing fixed formants',()=>{
  const cases=[
    {track:{type:'guide',gain:.7,guideInstrument:'humming'},note:{start:1,duration:.35,midi:60},hz:960},
    {track:{type:'guide',gain:.7,guideInstrument:'piano'},note:{start:1,duration:1.4,midi:60},hz:2300}
  ];
  for(const c of cases){
    const h=hummingHarness();
    h.run(h.ctx,{},c.track,c.note,0,0,Infinity,false);
    assert.equal(h.events.filters[1].frequency.value,c.hz);
    assert.deepEqual(h.events.filters[1].frequency.history,[],
      'short sounds and other instrument profiles must retain their original formant behavior');
  }
});
test('MUSIC-057 long humming keeps source-relative sustain through both 5 and 10 second WAV seams',()=>{
  const track={type:'guide',gain:.75,pan:0,start:0,guideInstrument:'humming'};
  const note={start:4.4,duration:7,midi:69,velocity:.8},original=structuredClone(note);
  const render=(from,to)=>{
    const h=hummingHarness();
    h.run(h.ctx,{},track,note,0,from,to,false);
    return h.events.gains[0].history;
  };
  const first=render(0,5),middle=render(4.9,10),last=render(9.9,13),whole=render(0,13);
  const peak=.086*track.gain*note.velocity,held=peak*.90;
  // The earlier code incorrectly ramped to silence at every clipped stop.
  assert.equal(first.at(-1).kind,'exp');
  assert.ok(Math.abs(first.at(-1).v-held)<1e-8,'first chunk must end in sustain, not release');
  assert.deepEqual(middle,[{kind:'set',v:held,t:0}],
    'the middle chunk must inherit the note sustain without re-attack/release');
  assert.equal(last[0].kind,'set');
  assert.ok(Math.abs(last[0].v-held)<1e-8,'second seam also starts at sustain level');
  assert.ok(last.some(x=>x.kind==='set'&&x.t>1.2&&Math.abs(x.v-held)<1e-8),
    'the true release may begin only near the original note end');
  assert.equal(last.at(-1).v,.0001,'real note end must still release to silence');
  assert.deepEqual(first.slice(0,3),whole.slice(0,3),
    'the full-note envelope and first split window must share the same attack and decay');
  assert.deepEqual(note,original,'source notes are not modified');
});
test('MUSIC-057 seek inside humming release follows original envelope rather than restarting attack',()=>{
  const track={type:'guide',gain:.75,pan:0,guideInstrument:'humming'};
  const note={start:0,duration:1.2,midi:67,velocity:.8};
  const h=hummingHarness();
  h.run(h.ctx,{},track,note,0,1.1,1.2,false);
  const history=h.events.gains[0].history;
  assert.equal(history[0].kind,'set');
  assert.ok(history[0].v>.0001&&history[0].v<.086*.75*.8*.9,
    'a clipped tail should already be releasing at its first sample');
  assert.equal(history.at(-1).v,.0001);
  assert.equal(history.at(-1).kind,'exp');
});
test('MUSIC-057 leaves short humming and sustained piano envelope schedules unchanged',()=>{
  for(const c of [
    {track:{type:'guide',gain:.7,guideInstrument:'humming'},note:{start:0,duration:.4,midi:64}},
    {track:{type:'guide',gain:.7,guideInstrument:'piano'},note:{start:0,duration:7,midi:64}}
  ]){
    const h=hummingHarness();h.run(h.ctx,{},c.track,c.note,0,0,2,false);
    const times=h.events.gains[0].history;
    assert.equal(times[0].v,.0001);
    assert.equal(times.at(-1).v,.0001,'unchanged instruments keep previous clipped release behavior');
  }
});
test('MUSIC-058 sustained humming LFO preserves note-relative phase at the 5s and 10s WAV seams',()=>{
  const track={type:'guide',gain:.75,pan:0,start:0,guideInstrument:'humming'};
  const note={start:4.4,duration:7,midi:69,velocity:.8},original=structuredClone(note);
  const segments=[[0,5],[4.9,10],[9.9,13]];
  const snapshots=segments.map(([a,b])=>{
    const h=hummingHarness();
    h.run(h.ctx,{},track,note,0,a,b,false);
    const lfos=h.events.oscs.filter(x=>x.freq>=4.7&&x.freq<=5.4);
    assert.equal(lfos.length,2,'both vibrato partials must exist in every chunk');
    return {lfos,h};
  });
  assert.equal(snapshots[0].lfos[0].wave,null,'the note-origin LFO can use the original sine');
  const rate=snapshots[0].lfos[0].freq;
  for(let i=1;i<segments.length;i++){
    const from=segments[i][0],elapsed=from-note.start;
    for(const lfo of snapshots[i].lfos){
      assert.ok(lfo.wave?.options?.disableNormalization,'phase-rotated sine is not gain-normalized');
      assert.ok(Math.abs(lfo.wave.real[1]-Math.sin(2*Math.PI*rate*elapsed))<1e-5,
        'cosine coefficient must follow original onset time');
      assert.ok(Math.abs(lfo.wave.imag[1]-Math.cos(2*Math.PI*rate*elapsed))<1e-5,
        'sine coefficient must preserve original note phase');
      const at=Math.min(10.02,note.start+note.duration-.1);
      const chunkPhase=Math.atan2(lfo.wave.real[1],lfo.wave.imag[1]);
      const expected=Math.sin(2*Math.PI*rate*(at-note.start));
      const actual=Math.sin(chunkPhase+2*Math.PI*rate*(at-from));
      assert.ok(Math.abs(actual-expected)<1e-5,'same global beat must have matching vibrato phase across chunks');
    }
  }
  assert.deepEqual(note,original,'source melody records must not change');
});
test('MUSIC-058 clipped sustained-note tail maintains full vibrato depth even for short windows',()=>{
  const track={type:'guide',gain:.75,pan:0,guideInstrument:'humming'};
  const note={start:4.4,duration:.8,midi:64,velocity:.8};
  const h=hummingHarness();
  h.run(h.ctx,{},track,note,0,5.0,5.05,false);
  const lfos=h.events.oscs.filter(x=>x.freq>=4.7&&x.freq<=5.4);
  assert.equal(lfos.length,2,'a 50ms split tail of an 800ms vowel must not lose its LFO');
  const depths=h.events.gains.filter(g=>g.history.some(x=>Math.abs(x.v-9.6)<1e-6));
  assert.equal(depths.length,1,'fundamental LFO depth must remain at sustained strength');
  assert.deepEqual(depths[0].history,[{kind:'set',v:9.6,t:0}]);
});
test('MUSIC-058 entering a long vowel during vibrato fade retains fractional depth',()=>{
  const track={type:'guide',gain:.75,pan:0,guideInstrument:'humming'};
  const note={start:4.4,duration:1.1,midi:64,velocity:.8};
  const h=hummingHarness();
  h.run(h.ctx,{},track,note,0,4.5,4.6,false);
  const target=9.6,fadeSeconds=.26;
  const vibGain=h.events.gains.find(g=>g.history.some(x=>Math.abs(x.v-target*.1/fadeSeconds)<1e-6));
  assert.ok(vibGain,'LFO must start with the fraction of elapsed original-note fade');
  assert.ok(vibGain.history.at(-1).v>vibGain.history[0].v,
    'remaining 100ms of segment must continue rising instead of restarting at zero');
  assert.ok(vibGain.history.at(-1).v<target,'the truncated window cannot jump to full depth early');
});
test('MUSIC-059 every humming harmonic resumes with absolute note phase at 5s and 10s WAV seams',()=>{
  const note={start:4.4,duration:7,midi:69,velocity:.8};
  const track={type:'guide',gain:.75,pan:0,start:0,guideInstrument:'humming'},original=structuredClone(note);
  const parts=[[0,5],[4.9,10],[9.9,13]].map(([from,to])=>{
    const h=hummingHarness();h.run(h.ctx,{},track,note,0,from,to,false);
    return {from,harmonics:h.events.oscs.filter(x=>x.freq>100),lfos:h.events.oscs.filter(x=>x.freq>=4.7&&x.freq<=5.4)};
  });
  assert.ok(parts.every(p=>p.harmonics.length===5&&p.lfos.length===2));
  assert.ok(parts[0].harmonics.every(o=>o.wave===null),
    'first note onset must keep the original unmodified sine harmonics');
  for(const p of parts.slice(1)){
    const elapsed=p.from-note.start;
    for(const [idx,osc] of p.harmonics.entries()){
      assert.ok(osc.wave&&osc.wave.options?.disableNormalization,
        'all five carrier harmonics must use phase-correct periodic waves at chunk resumption');
      assert.ok(Math.abs(osc.freq/parts[0].harmonics[0].freq-(idx+1))<.001);
      const theta=2*Math.PI*(elapsed*osc.freq);
      assert.ok(Math.abs(osc.wave.real[1]-Math.sin(theta))<1e-5);
      assert.ok(Math.abs(osc.wave.imag[1]-Math.cos(theta))<1e-5);
      // The same absolute sample within a crossfade must agree with an
      // oscillator that started at the original note onset, not the new chunk.
      const absolute=p.from+.037;
      const fromChunk=osc.wave.real[1]*Math.cos(2*Math.PI*osc.freq*(absolute-p.from))+
        osc.wave.imag[1]*Math.sin(2*Math.PI*osc.freq*(absolute-p.from));
      const fromSource=Math.sin(2*Math.PI*osc.freq*(absolute-note.start));
      assert.ok(Math.abs(fromChunk-fromSource)<1e-5,
        'carrier harmonic '+(idx+1)+' has continuous source-relative phase');
    }
  }
  assert.deepEqual(note,original,'carrier rephasing must not change saved pitch or timing');
});
test('MUSIC-059 other guide instruments never receive new carrier periodic waves',()=>{
  const piano=hummingHarness();
  piano.run(piano.ctx,{}, {type:'guide',gain:.75,pan:0,guideInstrument:'piano'},
    {start:4.4,duration:7,midi:69},0,4.9,10,false);
  assert.ok(piano.events.oscs.every(o=>o.wave===null),
    'the previous piano synthesis path must remain untouched');
});
test('MUSIC-059 carrier phase lock safely falls back without periodic-wave support',()=>{
  const h=hummingHarness();h.ctx.createPeriodicWave=undefined;
  h.run(h.ctx,{}, {type:'guide',gain:.75,pan:0,guideInstrument:'humming'},
    {start:4.4,duration:7,midi:69},0,4.9,10,false);
  assert.equal(h.events.oscs.filter(o=>o.freq>100).length,5);
  assert.ok(h.events.oscs.every(o=>o.wave===null),'legacy audio contexts still render without crashing');
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
test('MUSIC-061 humming treats repeated notes as separate syllables and preserves leap breaths',()=>{
  const h=legatoHarness();
  const notes=[
    {start:0,duration:.28,midi:60},
    {start:.32,duration:.28,midi:60},
    {start:.65,duration:.20,midi:65},
    {start:.90,duration:.20,midi:72},
    {start:1.12,duration:.20,midi:79},
    {start:1.43,duration:.15,midi:81}
  ];
  const original=structuredClone(notes);
  h.scheduleGuide({}, {},{type:'guide',guideInstrument:'humming',notes},0,0,Infinity,false);
  assert.equal(h.scheduled.length,notes.length);
  assert.equal(h.scheduled[0].duration,.28,
    'identical notes separated by 40ms must retain a fresh syllable attack');
  assert.ok(Math.abs(h.scheduled[1].duration-.348)<1e-9,
    'a connected 5-semitone step may bridge a 50ms micro-gap');
  assert.equal(h.scheduled[2].duration,.20,
    'a 7-semitone leap with 50ms silence must retain breath space');
  assert.ok(Math.abs(h.scheduled[3].duration-.238)<1e-9,
    'an almost connected 7-semitone leap keeps the original legato option');
  assert.equal(h.scheduled[4].duration,.20,'genuine 110ms pause remains untouched');
  assert.deepEqual(notes,original,'MIDI pitches, source timing and saved project notes must stay unchanged');
});
test('MUSIC-061 piano playback retains original reattack and note durations',()=>{
  const h=legatoHarness();
  const notes=[{start:0,duration:.3,midi:60},{start:.34,duration:.3,midi:60},
    {start:.68,duration:.25,midi:67}];
  h.scheduleGuide({}, {},{type:'guide',guideInstrument:'piano',notes},0,0,Infinity,false);
  assert.deepEqual(h.scheduled,notes);
});
test('MUSIC-062 humming small connected steps get transient glides without changing notes',()=>{
  const notes=[
    {start:0,duration:.30,midi:60,velocity:.8},
    {start:.34,duration:.30,midi:62,velocity:.8},
    {start:.69,duration:.30,midi:62,velocity:.8},
    {start:1.04,duration:.30,midi:69,velocity:.8},
    {start:1.40,duration:.30,midi:72,velocity:.8},
    {start:1.76,duration:.30,midi:74,velocity:.8}
  ];
  const original=structuredClone(notes),h=legatoHarness();
  h.scheduleGuide({}, {},{type:'guide',guideInstrument:'humming',notes},0,0,Infinity,false);
  assert.equal(h.scheduled[1].glideFromMidi,60,'2-semitone connected step should glide');
  assert.equal(h.scheduled[2].glideFromMidi,undefined,'same-note reattack must remain distinct');
  assert.equal(h.scheduled[3].glideFromMidi,undefined,'7-semitone leap retains deliberate articulation');
  assert.equal(h.scheduled[4].glideFromMidi,undefined,'60ms breath must not be smoothed');
  assert.equal(h.scheduled[5].glideFromMidi,undefined,'later 60ms breath must remain');
  assert.deepEqual(notes,original,'the saved source note array must remain exact');
  const piano=legatoHarness();
  piano.scheduleGuide({}, {},{type:'guide',guideInstrument:'piano',notes},0,0,Infinity,false);
  assert.deepEqual(piano.scheduled,notes,'other instruments must never inherit transient glide');
});
test('MUSIC-062 all five humming harmonics glide to target pitch in under 45ms',()=>{
  const track={type:'guide',gain:.75,pan:0,guideInstrument:'humming'},note={start:4.98,duration:.5,midi:62,glideFromMidi:60};
  const h=hummingHarness();
  h.run(h.ctx,{},track,note,0,0,6,false);
  const voices=h.events.oscs.filter(x=>x.freq>100),fromHz=440*Math.pow(2,(60-69)/12),toHz=440*Math.pow(2,(62-69)/12);
  assert.equal(voices.length,5);
  for(let i=0;i<5;i++){
    const osc=voices[i],ramp=osc.freqHistory.find(x=>x.kind==='exp');
    assert.ok(Math.abs(osc.freq-fromHz*(i+1))<2,'glide should start from adjacent previous pitch');
    assert.ok(ramp&&Math.abs(ramp.v-toHz*(i+1))<2,'all harmonics arrive at exact target');
    assert.ok(ramp.t>note.start&&ramp.t<=note.start+.045+1e-9,'short glide is tightly bounded');
  }
});
test('MUSIC-062 glide phase and pitch remain continuous when a WAV chunk begins during the slide',()=>{
  const track={type:'guide',gain:.75,pan:0,guideInstrument:'humming'},note={start:4.98,duration:.50,midi:62,glideFromMidi:60};
  const early=hummingHarness(),late=hummingHarness();
  early.run(early.ctx,{},track,note,0,0,5,false);
  late.run(late.ctx,{},track,note,0,4.99,5.5,false);
  const first=early.events.oscs.filter(x=>x.freq>100),second=late.events.oscs.filter(x=>x.freq>100);
  assert.equal(first.length,5);assert.equal(second.length,5);
  const dt=.01,glideDuration=.045;
  for(let i=0;i<5;i++){
    const a=first[i],z=second[i],from=a.freq,target=from*Math.pow(2,2/12);
    const k=Math.log(target/from),expectedHz=from*Math.exp(k*dt/glideDuration);
    const integrated=from*glideDuration*Math.expm1(k*dt/glideDuration)/k;
    assert.ok(Math.abs(z.freq-expectedHz)<.02,'resumed frequency is already part-way through slide');
    assert.ok(Math.abs(z.wave.real[1]-Math.sin(2*Math.PI*integrated))<.0001);
    assert.ok(Math.abs(z.wave.imag[1]-Math.cos(2*Math.PI*integrated))<.0001);
    assert.ok(z.freqHistory.some(x=>x.kind==='exp'&&Math.abs(x.v-target)<.02),
      'clipped note must finish remaining glide, not reset the slide');
  }
  const after=hummingHarness();after.run(after.ctx,{},track,note,0,5.2,5.4,false);
  assert.ok(after.events.oscs.filter(x=>x.freq>100).every((x,i)=>Math.abs(x.freq-440*Math.pow(2,(62-69)/12)*(i+1))<2),
    'a later chunk should hold the target pitch without retriggering a glide');
});
test('MUSIC-062 short connected glides do not restart the amplitude envelope at WAV seams',()=>{
  const track={type:'guide',gain:.75,pan:0,guideInstrument:'humming'},
    note={start:4.98,duration:.5,midi:62,glideFromMidi:60,velocity:.8};
  const before=hummingHarness(),after=hummingHarness();
  before.run(before.ctx,{},track,note,0,0,5,false);
  after.run(after.ctx,{},track,note,0,5,5.5,false);
  const peak=.086*track.gain*note.velocity,held=peak*.90;
  const left=before.events.gains[0].history,right=after.events.gains[0].history;
  assert.ok(left.at(-1).v>=held*.80&&left.at(-1).v<=peak,
    'the clipped first 20ms must retain vowel attack, not fake silence at 5s');
  assert.ok(right[0].v>held*.6&&right[0].v<=peak,
    'the resumed vowel must keep its absolute note envelope');
  assert.ok(right.at(-1).v===.0001,'only the real note ending can release fully');
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
  const segment=source('  function reduceGuideBackingLeak(vocalData,backingData,relativeStartFrames,sampleRate,windowed=true){','  async function extractGuide(){');
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
  assert.equal(result.segments?.length,2,'the two detected latency regimes should be reported separately');
  assert.ok(result.segments.some(x=>Math.abs(x.lag+d1)<=8),'must identify first delay');
  assert.ok(result.segments.some(x=>Math.abs(x.lag+d2)<=8),'must identify changed delay');
});

test('secondary reflected backing tap is removed from guide PCM without changing original audio',()=>{
  const reduce=bleedReductionHarness(),sampleRate=12000,n=sampleRate*4,direct=Math.round(.025*sampleRate),echo=Math.round(.082*sampleRate);
  const backing=Float32Array.from({length:n},(_,i)=>{
    const t=i/sampleRate;
    return .32*Math.sin(2*Math.PI*113*t)+.18*Math.sin(2*Math.PI*197*t)
      +.09*Math.sin(2*Math.PI*(141*t+6*t*t))+.04*Math.sin(2*Math.PI*1781*t);
  });
  const vocal=Float32Array.from({length:n},(_,i)=>{
    const t=i/sampleRate;
    return t>.8&&t<3.2?.21*Math.sin(2*Math.PI*440*t)+.08*Math.sin(2*Math.PI*880*t):0;
  });
  const mixture=Float32Array.from(vocal,(v,i)=>v+(i>=direct?.35*backing[i-direct]:0)+(i>=echo?.16*backing[i-echo]:0));
  const source=mixture.slice(),reference=backing.slice();
  const result=reduce(mixture,backing,0,sampleRate);
  let before=0,after=0;
  for(let i=0;i<n;i++){before+=(mixture[i]-vocal[i])**2;after+=(result.samples[i]-vocal[i])**2}
  console.log('ECHO_TAP_DIAGNOSTIC',JSON.stringify({ratio:after/before,lag:result.lag,gain:result.gain,echoGain:result.echoGain,echoLag:result.echoLag}));
  assert.ok(after<before*.12,'short reverberation must leave under 12% residual accompaniment power');
  assert.ok(result.echoGain>.06&&result.echoGain<.25,'secondary echo gain should be identified');
  assert.ok(Math.abs(result.echoLag+echo)<=12,'secondary echo must align to the reflected 82ms offset');
  assert.deepEqual(mixture,source,'raw voice must remain unchanged');
  assert.deepEqual(backing,reference,'original backing must remain unchanged');
});

test('no phantom secondary echo on a single clean leak or a dry microphone take',()=>{
  const reduce=bleedReductionHarness(),sampleRate=12000,n=sampleRate*4,direct=Math.round(.025*sampleRate);
  const backing=Float32Array.from({length:n},(_,i)=>{
    const t=i/sampleRate;
    return .3*Math.sin(2*Math.PI*113*t)+.2*Math.sin(2*Math.PI*197*t)
      +.08*Math.sin(2*Math.PI*(141*t+6*t*t))+.04*Math.sin(2*Math.PI*1781*t);
  });
  const voice=Float32Array.from({length:n},(_,i)=>{
    const t=i/sampleRate;return t>.8&&t<3.2?.2*Math.sin(2*Math.PI*440*t):0;
  });
  const directOnly=Float32Array.from(voice,(v,i)=>v+(i>=direct?.35*backing[i-direct]:0));
  const result=reduce(directOnly,backing,0,sampleRate);
  assert.equal(result.echoGain??0,0,'echo model must not invent a reflected tap in a single-delay microphone recording');
  assert.ok(result.gain>.25,'reference model still identifies the single direct leak');
  const dry=reduce(voice,backing,0,sampleRate);
  assert.equal(dry.samples,voice,'dry vocal with unrelated backing remains identical');
  assert.equal(dry.echoGain??0,0,'dry voice never acquires echo correction');
});
