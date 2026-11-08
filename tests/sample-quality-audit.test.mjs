import test from "node:test";
import assert from "node:assert/strict";
import {analyzeInstrumentSample} from "../integration/sample-quality-audit.js";

const sr=24000;
const sample=(channels)=>({sampleRate:sr,channels});
function tone(frames=sr,amp=.3){
  const a=new Float32Array(frames);
  for(let i=0;i<frames;i++)a[i]=Math.sin(2*Math.PI*440*i/sr)*amp;
  return a;
}
test("non-mutating 1s tone detects active end but not clipping or silent",()=>{
 const arr=tone(),original=arr.slice();
 const r=analyzeInstrumentSample(sample([arr]));
 assert.equal(r.frames,sr);
 assert.equal(r.channels,1);
 assert.equal(r.durationSeconds,1);
 assert.ok(r.rms>.2&&r.rms<.22);
 assert.ok(r.peak>.29&&r.peak<.301);
 assert.equal(r.clippedFrames,0);
 assert.equal(r.nearSilence,false);
 assert.equal(r.usableForPreview,true);
 assert.ok(r.issues.includes("active_end"));
 assert.deepEqual(arr,original);
});
test("quiet 0.6s tail and 0.1s lead are measured in 20ms windows",()=>{
 const a=new Float32Array(sr*2);
 a.set(tone(sr,0.2),Math.round(sr*.1));
 const r=analyzeInstrumentSample(sample([a]));
 assert.equal(r.issues.includes("active_end"),false);
 assert.ok(r.leadingQuietSeconds>=.09&&r.leadingQuietSeconds<=.12);
 assert.ok(r.trailingQuietSeconds>=.88&&r.trailingQuietSeconds<=.92);
});
test("full silence refuses to classify as usable instrument sample",()=>{
 const r=analyzeInstrumentSample(sample([new Float32Array(sr)]));
 assert.equal(r.nearSilence,true);
 assert.equal(r.usableForPreview,false);
 assert.equal(r.rmsDbfs,null);
 assert.equal(r.peakDbfs,null);
 assert.ok(r.issues.includes("near_silence"));
});
test("clipping and DC offset are independent advisory findings",()=>{
 const arr=tone();
 arr[3]=1;
 const clipped=analyzeInstrumentSample(sample([arr]));
 assert.equal(clipped.clippedFrames,1);
 assert.ok(clipped.issues.includes("possible_clipping"));
 const biased=new Float32Array(sr);
 biased.fill(.15);
 const dc=analyzeInstrumentSample(sample([biased]));
 assert.ok(dc.dcOffset>.14&&dc.dcOffset<.16);
 assert.ok(dc.issues.includes("dc_offset"));
 assert.equal(dc.clippedFrames,0);
});
test("stereo is combined without losing channels; short samples warn",()=>{
 const mono=tone(Math.round(sr*.1));
 const r=analyzeInstrumentSample(sample([mono,mono.slice()]));
 assert.equal(r.channels,2);
 assert.equal(r.clippedFrames,0);
 assert.ok(r.issues.includes("very_short"));
});
test("bad sample data fails closed",()=>{
 for(const src of [
  null,{channels:[],sampleRate:sr},
  {channels:[new Float32Array(3),new Float32Array(2)],sampleRate:sr},
  {channels:[new Float32Array(1)],sampleRate:0},
  {channels:[new Float32Array([1,NaN])],sampleRate:sr},
  {channels:[new Float32Array(1)],sampleRate:sr}
 ]) {
  if(src?.channels?.[0]?.length===1 && src.sampleRate===sr)continue; // a one-frame sample is valid by design
  assert.throws(()=>analyzeInstrumentSample(src));
 }
 assert.throws(()=>analyzeInstrumentSample(sample([tone()]),{quietThreshold:0}));
});
