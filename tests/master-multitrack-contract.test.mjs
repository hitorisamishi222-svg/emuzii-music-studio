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
