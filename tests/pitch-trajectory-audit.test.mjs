import test from "node:test";
import assert from "node:assert/strict";
import {auditPitchTrajectory} from "../integration/pitch-trajectory-audit.js";
const sr=24000,n=48000;
const sustained=Float32Array.from({length:n},(_,i)=>.2*Math.sin(2*Math.PI*220*i/sr));
const vibrato=Float32Array.from({length:n},(_,i)=>{
 const t=i/sr;
 return .2*Math.sin(2*Math.PI*220*t+(2*Math.PI*220*.02/5)*(1-Math.cos(2*Math.PI*5*t)));
});
test("framewise gate reports sustained tone and vibrato without certifying either",()=>{
 for(const [kind,input] of [["sustained",sustained],["vibrato",vibrato]]){
  const original=input.slice();
  for(const cents of [-35,35]){
   const report=auditPitchTrajectory(input,{sampleRate:sr,correctionCents:cents});
   console.log("MUSIC108_TRAJECTORY",JSON.stringify({kind,cents,frames:report.frameCount,passed:report.passedCount,passRate:report.passRate,allFramesPass:report.allFramesPass}));
   assert.ok(report.frameCount>4);
   assert.ok(report.passedCount<=report.frameCount);
   assert.equal(typeof report.allFramesPass,"boolean");
   assert.deepEqual(input,original);
  }
 }
});
test("invalid windows fail closed",()=>{
 assert.throws(()=>auditPitchTrajectory(sustained,{frameSamples:100}));
 assert.throws(()=>auditPitchTrajectory(sustained,{stepSamples:0}));
});
