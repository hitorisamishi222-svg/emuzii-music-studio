import test from "node:test";
import assert from "node:assert/strict";
import {estimateMonophonicPitch} from "../integration/offline-monophonic-pitch-estimator.js";
const sr=24000;
const sine=(hz,n=4096,amp=.25)=>Float32Array.from({length:n},(_,i)=>amp*Math.sin(2*Math.PI*hz*i/sr));
test("estimates known mono sine fundamentals without mutating samples",()=>{
 for(const hz of [110,220,440,660]){
  const input=sine(hz),before=input.slice();
  const r=estimateMonophonicPitch(input,{sampleRate:sr,minHz:80,maxHz:800});
  assert.equal(r.voiced,true,JSON.stringify(r));
  assert.ok(Math.abs(r.hz-hz)/hz<.015,JSON.stringify(r));
  assert.ok(r.confidence>=.82);
  assert.deepEqual(input,before);
 }
});
test("rejects silence and invalid input instead of manufacturing a note",()=>{
 const silence=new Float32Array(4096);
 assert.equal(estimateMonophonicPitch(silence).reason,"silence");
 assert.throws(()=>estimateMonophonicPitch(new Float32Array(16)));
 assert.throws(()=>estimateMonophonicPitch(sine(440),{minHz:800,maxHz:100}));
 const invalid=sine(440);invalid[4]=NaN;
 assert.throws(()=>estimateMonophonicPitch(invalid));
});
