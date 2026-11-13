import test from "node:test";
import assert from "node:assert/strict";
import {pitchShiftLongWindowResearch} from "../integration/long-window-pitch-research.js";
import {estimateMonophonicPitch} from "../integration/offline-monophonic-pitch-estimator.js";
const sr=24000;
const signal=Float32Array.from({length:48000},(_,i)=>.2*Math.sin(2*Math.PI*220*i/sr));
test("research baseline changes central sustained-tone pitch with bounded error",()=>{
 const before=signal.slice();
 const input=estimateMonophonicPitch(signal.slice(20000,24096),{sampleRate:sr});
 for(const cents of [-35,35,60]){
  const shifted=pitchShiftLongWindowResearch(signal,{sampleRate:sr,correctionCents:cents});
  const measured=estimateMonophonicPitch(shifted.pcm.slice(20000,24096),{sampleRate:sr});
  const actual=1200*Math.log2(measured.hz/input.hz);
  console.log("MUSIC106_RESEARCH",JSON.stringify({requestedCents:cents,measuredCents:actual,errorCents:actual-cents}));
  assert.ok(measured.voiced);
  assert.ok(Math.abs(actual-cents)<20,JSON.stringify({cents,actual}));
  assert.equal(shifted.pcm.length,signal.length);
  assert.ok(shifted.pcm.every(x=>Number.isFinite(x)&&Math.abs(x)<=1));
 }
 assert.deepEqual(signal,before);
});
test("bypass is exact and invalid parameters are rejected",()=>{
 const bypass=pitchShiftLongWindowResearch(signal,{correctionCents:0});
 assert.deepEqual(bypass.pcm,signal);
 assert.notStrictEqual(bypass.pcm,signal);
 assert.throws(()=>pitchShiftLongWindowResearch(signal,{windowMs:40}));
 assert.throws(()=>pitchShiftLongWindowResearch(signal,{correctionCents:200}));
});
