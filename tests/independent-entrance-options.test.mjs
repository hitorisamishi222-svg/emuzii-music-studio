import test from "node:test";
import assert from "node:assert/strict";
import {compareIndependentEntrances} from "../integration/independent-entrance-options.js";
const parts=()=>[
 {name:"melody",bpm:120,beatsPerBar:4,notes:[
  {beat:0,durationBeats:2,midi:60,velocity:80},
  {beat:2,durationBeats:2,midi:64,velocity:80}]},
 {name:"bass",bpm:120,beatsPerBar:4,notes:[
  {beat:0,durationBeats:1,midi:48,velocity:80},
  {beat:1,durationBeats:2,midi:61,velocity:80}]}
];
test("candidate entrances report changes but preserve original compositions",()=>{
 const source=parts(),before=structuredClone(source);
 const r=compareIndependentEntrances(source,{candidateOffsetBars:[0,1,2]});
 assert.equal(r.candidates.length,3);
 assert.deepEqual(r.candidates.map(x=>x.totalOverlaps),[3,0,0]);
 assert.deepEqual(r.candidates.map(x=>x.reviewCount),[1,0,0]);
 assert.deepEqual(r.candidates.map(x=>x.complete),[true,true,true]);
 assert.equal(r.sourceUnchanged,true);
 assert.deepEqual(source,before);
 assert.deepEqual(r,compareIndependentEntrances(source,{candidateOffsetBars:[0,1,2]}));
 assert.match(r.caveat,/not necessarily better music/);
});
test("invalid candidate indices, duplicates and negative bars rejected",()=>{
 const source=parts();
 assert.throws(()=>compareIndependentEntrances(source,{candidatePartIndex:2}));
 assert.throws(()=>compareIndependentEntrances(source,{candidateOffsetBars:[0,0]}));
 assert.throws(()=>compareIndependentEntrances(source,{candidateOffsetBars:[-1]}));
 assert.throws(()=>compareIndependentEntrances(source,{candidateOffsetBars:[]}));
});
