import test from "node:test";
import assert from "node:assert/strict";
import {alignIndependentNoteParts} from "../integration/independent-note-grid-aligner.js";
const parts=()=>[
 {name:"song-A",bpm:90,beatsPerBar:3,notes:[
  {beat:0,durationBeats:1.5,midi:60,velocity:80},
  {beat:3,durationBeats:1.5,midi:64,velocity:90}]},
 {name:"song-B",bpm:140,beatsPerBar:4,notes:[
  {beat:0,durationBeats:2,midi:48,velocity:70},
  {beat:4,durationBeats:2,midi:55,velocity:75}]}
];
test("3/4 and 4/4 independently composed phrases align to common 4/4 beat grid",()=>{
 const src=parts(),copy=structuredClone(src);
 const r=alignIndependentNoteParts(src,{targetBpm:120,targetBeatsPerBar:4});
 assert.equal(r.parts.length,2);
 assert.equal(r.parts[0].notes[0].start,0);
 assert.equal(r.parts[0].notes[0].duration,1);
 assert.equal(r.parts[0].notes[1].start,2);
 assert.equal(r.parts[1].notes[1].start,2);
 assert.equal(r.parts[1].notes[0].duration,1);
 assert.deepEqual(src,copy);
 assert.deepEqual(r,alignIndependentNoteParts(src,{targetBpm:120,targetBeatsPerBar:4}));
});
test("optional transpose and bar offset are explicit and do not edit originals",()=>{
 const r=alignIndependentNoteParts(parts(),{
  targetBpm:100,targetBeatsPerBar:4,offsetBars:2,transposeSemitones:[2,-12]
 });
 assert.equal(r.parts[0].notes[0].midi,62);
 assert.equal(r.parts[1].notes[0].midi,36);
 assert.equal(r.parts[0].notes[0].start,4.8);
 assert.equal(r.report[0].sourceBpm,90);
 assert.equal(r.report[1].sourceBpm,140);
});
test("invalid beats, MIDI overflow, duplicate names, unsafe tempo rejected",()=>{
 const a=parts();
 assert.throws(()=>alignIndependentNoteParts(a,{targetBpm:0}));
 assert.throws(()=>alignIndependentNoteParts(a,{targetBeatsPerBar:0}));
 assert.throws(()=>alignIndependentNoteParts(a,{transposeSemitones:[100]}));
 assert.throws(()=>alignIndependentNoteParts(a,{offsetBars:-1}));
 assert.throws(()=>alignIndependentNoteParts([a[0],{...a[0]}]));
 assert.throws(()=>alignIndependentNoteParts([a[0],{...a[1],notes:[{beat:0,durationBeats:0,midi:60,velocity:80}]}]));
 assert.throws(()=>alignIndependentNoteParts([a[0],{...a[1],notes:[{beat:0,durationBeats:1,midi:127,velocity:80}]}],{transposeSemitones:[0,1]}));
 assert.throws(()=>alignIndependentNoteParts([a[0]]));
});

test("preserve-beats mode retains beat spacing across 3/4 and 4/4 without silent stretch",()=>{
 const src=parts(),copy=structuredClone(src);
 const r=alignIndependentNoteParts(src,{targetBpm:120,targetBeatsPerBar:4,
  meterMapping:"preserve-beats"});
 assert.equal(r.parts[0].notes[0].duration,.75);
 assert.equal(r.parts[0].notes[1].start,1.5);
 assert.equal(r.parts[1].notes[1].start,2);
 assert.equal(r.report[0].barRatio,1);
 assert.equal(r.report[0].meterMapping,"preserve-beats");
 assert.deepEqual(src,copy);
});
test("independent bar entrances allow delayed bass without shifting melody",()=>{
 const r=alignIndependentNoteParts(parts(),{targetBpm:120,targetBeatsPerBar:4,
  meterMapping:"preserve-beats",partOffsetBars:[0,2]});
 assert.equal(r.parts[0].notes[0].start,0);
 assert.equal(r.parts[1].notes[0].start,4);
 assert.equal(r.report[1].offsetBars,2);
 assert.throws(()=>alignIndependentNoteParts(parts(),{meterMapping:"auto"}));
 assert.throws(()=>alignIndependentNoteParts(parts(),{partOffsetBars:[-1,0]}));
 assert.throws(()=>alignIndependentNoteParts(parts(),{partOffsetBars:[0,1,2]}));
});
