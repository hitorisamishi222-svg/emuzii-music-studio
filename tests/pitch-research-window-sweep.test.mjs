import test from "node:test";
import assert from "node:assert/strict";
import {compareResearchWindowLengths} from "../integration/pitch-research-window-sweep.js";
const sr=24000;
const sine=(hz)=>Float32Array.from({length:48000},(_,i)=>.2*Math.sin(2*Math.PI*hz*i/sr));
test("compare bounded research windows on several pitches and corrections",()=>{
 for(const hz of [110,220,440]){
  const input=sine(hz),before=input.slice();
  for(const cents of [-35,35,60]){
   const report=compareResearchWindowLengths(input,{sampleRate:sr,correctionCents:cents});
   assert.equal(report.results.length,4);
   console.log("MUSIC107_SWEEP",JSON.stringify({hz,cents,results:report.results}));
   assert.ok(report.results.every(x=>typeof x.within20Cents==="boolean"));
   assert.deepEqual(input,before);
  }
 }
});
test("reject invalid research sweep settings",()=>{
 assert.throws(()=>compareResearchWindowLengths(sine(220),{windowLengthsMs:[]}));
 assert.throws(()=>compareResearchWindowLengths(sine(220),{windowLengthsMs:[40]}));
});
