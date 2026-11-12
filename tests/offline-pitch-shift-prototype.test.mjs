import test from "node:test";
import assert from "node:assert/strict";
import {pitchShiftOfflinePrototype} from "../integration/offline-pitch-shift-prototype.js";
const sr=24000;
const signal=Float32Array.from({length:12000},(_,i)=>.2*Math.sin(2*Math.PI*220*i/sr));
test("zero correction and dry setting preserve samples byte-for-byte",()=>{
 for(const opts of [{correctionCents:0},{correctionCents:60,wet:0}]){
  const r=pitchShiftOfflinePrototype(signal,opts);
  assert.equal(r.applied,false);
  assert.deepEqual(r.pcm,signal);
  assert.notStrictEqual(r.pcm,signal);
 }
});
test("partial pitch processing retains duration, bounds and original PCM",()=>{
 const before=signal.slice();
 for(const cents of [-35,35,60]){
  const r=pitchShiftOfflinePrototype(signal,{correctionCents:cents,wet:.8});
  assert.equal(r.applied,true);
  assert.equal(r.pcm.length,signal.length);
  assert.ok(r.peak<=1);
  assert.ok(r.pcm.every(Number.isFinite));
  assert.notDeepEqual(r.pcm,signal);
  assert.ok(r.latencySamples>0);
 }
 assert.deepEqual(signal,before);
});
test("unsafe settings and malformed PCM fail closed",()=>{
 for(const opts of [{correctionCents:101},{grainMs:5},{wet:2},{sampleRate:1000}])
  assert.throws(()=>pitchShiftOfflinePrototype(signal,opts));
 const bad=signal.slice();bad[4]=NaN;
 assert.throws(()=>pitchShiftOfflinePrototype(bad));
});
