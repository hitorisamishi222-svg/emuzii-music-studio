import test from "node:test";
import assert from "node:assert/strict";
import {assessPitchMotionSafety} from "../integration/pitch-motion-safety-gate.js";
const sr=24000,n=24000;
const stable=Float32Array.from({length:n},(_,i)=>.2*Math.sin(2*Math.PI*220*i/sr));
const vibrato=Float32Array.from({length:n},(_,i)=>{
 const t=i/sr;return .2*Math.sin(2*Math.PI*220*t+220*.08*(1-Math.cos(2*Math.PI*5*t))/5);
});
test("stable, expressive and silent inputs are assessed without audio mutation",()=>{
 for(const [name,pcm] of [["stable",stable],["vibrato",vibrato],["silence",new Float32Array(n)]]){
  const original=pcm.slice();
  const report=assessPitchMotionSafety(pcm,{sampleRate:sr});
  console.log("MUSIC109_MOTION",JSON.stringify({name,reason:report.reason,allow:report.allowCorrection,maxMotion:report.maxMotionCents}));
  assert.equal(typeof report.allowCorrection,"boolean");
  assert.ok(report.frames.length>3);
  assert.deepEqual(pcm,original);
  if(name==="silence")assert.equal(report.allowCorrection,false);
 }
});
test("rejects unsafe configurations",()=>{
 assert.throws(()=>assessPitchMotionSafety(stable,{stepSamples:0}));
 assert.throws(()=>assessPitchMotionSafety(stable,{motionThresholdCents:-1}));
});
