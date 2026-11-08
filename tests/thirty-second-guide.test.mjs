import test from "node:test";
import assert from "node:assert/strict";
import {renderGuidePhrase,createThirtySecondGuideScore} from "../integration/thirty-second-guide.js";
test("30-second deterministic score renders without clipping or missing frames",()=>{
 const notes=createThirtySecondGuideScore();
 const a=renderGuidePhrase(notes),b=renderGuidePhrase(notes);
 assert.equal(a.pcm.length,720000);
 assert.equal(a.kind,"synthetic-guide-only");
 assert.deepEqual(a.pcm,b.pcm);
 assert.ok(a.pcm.some(x=>Math.abs(x)>0.01));
 assert.ok(a.pcm.every(x=>Number.isFinite(x)&&Math.abs(x)<=1));
});
test("note velocity influences energy",()=>{
 const n={start:0,duration:.5,midi:69,velocity:40};
 const low=renderGuidePhrase([n],{seconds:1}).pcm;
 const high=renderGuidePhrase([{...n,velocity:110}],{seconds:1}).pcm;
 const peak=a=>Math.max(...a.subarray(0,12000));
 assert.ok(peak(high)>peak(low)*2);
});
test("invalid score data fails before rendering",()=>{
 for(const notes of [[{start:0,duration:31,midi:60,velocity:80}],[{start:0,duration:1,midi:999,velocity:80}],[{start:0,duration:1,midi:60,velocity:NaN}]])
  assert.throws(()=>renderGuidePhrase(notes));
});
