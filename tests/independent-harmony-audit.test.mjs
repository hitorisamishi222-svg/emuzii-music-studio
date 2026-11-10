import test from "node:test";
import assert from "node:assert/strict";
import {alignIndependentNoteParts} from "../integration/independent-note-grid-aligner.js";
import {inspectSimultaneousIntervals} from "../integration/independent-harmony-audit.js";
const parts=()=>[
 {name:"melody",bpm:120,beatsPerBar:4,notes:[
  {beat:0,durationBeats:2,midi:60,velocity:80},
  {beat:2,durationBeats:2,midi:64,velocity:80}]},
 {name:"bass",bpm:120,beatsPerBar:4,notes:[
  {beat:0,durationBeats:1,midi:48,velocity:80},
  {beat:1,durationBeats:2,midi:61,velocity:80}]}
];
test("interval diagnostic finds only actual cross-song overlaps and labels semitones",()=>{
 const original=parts(),before=structuredClone(original);
 const aligned=alignIndependentNoteParts(original);
 const result=inspectSimultaneousIntervals(aligned);
 assert.equal(result.totalOverlaps,3);
 assert.deepEqual(result.findings.map(x=>x.semitones),[12,1,3]);
 assert.deepEqual(result.findings.map(x=>x.interval),["unison","minor-second","minor-third"]);
 assert.equal(result.findings[1].attention,"review");
 assert.equal(result.findings[2].attention,"neutral");
 assert.equal(result.sourceUnchanged,true);
 assert.deepEqual(original,before);
 assert.deepEqual(result,inspectSimultaneousIntervals(aligned));
});
test("delayed entrance removes earlier overlap without changing the composition",()=>{
 const aligned=alignIndependentNoteParts(parts(),{partOffsetBars:[0,1]});
 const result=inspectSimultaneousIntervals(aligned);
 assert.equal(result.totalOverlaps,0);
});
test("bounded output reports truncation rather than silently declaring no issues",()=>{
 const aligned=alignIndependentNoteParts(parts());
 const result=inspectSimultaneousIntervals(aligned,{maxFindings:2});
 assert.equal(result.totalOverlaps,3);
 assert.equal(result.findings.length,2);
 assert.equal(result.truncated,true);
 assert.throws(()=>inspectSimultaneousIntervals(aligned,{maxFindings:0}));
 assert.throws(()=>inspectSimultaneousIntervals({parts:[{name:"bad",notes:[{start:0,duration:0,midi:60}]},{name:"ok",notes:[]}]}));
});
