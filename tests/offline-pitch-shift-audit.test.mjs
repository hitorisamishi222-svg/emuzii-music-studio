import test from "node:test";
import assert from "node:assert/strict";
import {auditOfflinePitchShift} from "../integration/offline-pitch-shift-audit.js";
const sr=24000;
const sine=Float32Array.from({length:24000},(_,i)=>.2*Math.sin(2*Math.PI*220*i/sr));
test("reports measured pitch difference without claiming accuracy or mutating source",()=>{
 const original=sine.slice();
 for(const cents of [-35,35,60]){
  const report=auditOfflinePitchShift(sine,{sampleRate:sr,correctionCents:cents});
  assert.equal(report.requestedCents,cents);
  assert.equal(typeof report.within20Cents,"boolean");
  assert.equal(report.sourceUnchanged,true);
  assert.ok(report.before.voiced);
  assert.deepEqual(sine,original);
 }
});
test("rejects invalid audit windows and audio",()=>{
 assert.throws(()=>auditOfflinePitchShift(sine,{windowSamples:100}));
 assert.throws(()=>auditOfflinePitchShift(new Float32Array(1000)));
});
