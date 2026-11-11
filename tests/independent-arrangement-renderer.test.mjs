import test from "node:test";
import assert from "node:assert/strict";
import {renderIndependentArrangement} from "../integration/independent-arrangement-renderer.js";
import {renderIndependentEntrancePreviews} from "../integration/independent-entrance-preview-renderer.js";
const sr=24000;
const makeSample=freq=>{
 const data=new Float32Array(sr*4);
 for(let i=0;i<data.length;i++)data[i]=.24*Math.sin(2*Math.PI*freq*i/sr)*Math.exp(-i/(sr*2));
 return {sampleRate:sr,channels:[data]};
};
const parts=()=>[
 {name:"melody-from-song-A",bpm:90,beatsPerBar:3,notes:[
  {beat:0,durationBeats:1,midi:60,velocity:95},
  {beat:3,durationBeats:1,midi:64,velocity:92}]},
 {name:"bass-from-song-B",bpm:140,beatsPerBar:4,notes:[
  {beat:0,durationBeats:2,midi:48,velocity:100},
  {beat:4,durationBeats:2,midi:55,velocity:100}]}
];
const instruments=()=>[
 {sample:makeSample(261.63),region:{rootMidi:60,loKey:48,hiKey:80,volumeDb:-6},gainDb:0,pan:-.6},
 {sample:makeSample(130.81),region:{rootMidi:48,loKey:36,hiKey:72,volumeDb:-6},gainDb:-3,pan:.6}
];
const options={targetBpm:120,targetBeatsPerBar:4,sampleRate:sr,seconds:5,headroomDb:6};
test("independent 3/4 melody and 4/4 bass become real stereo PCM WAV with source preservation",()=>{
 const a=parts(),i=instruments(),before=structuredClone(a),samples=i.map(x=>x.sample.channels[0].slice());
 const r=renderIndependentArrangement(a,i,options);
 assert.equal(r.report.stemCount,2);
 assert.equal(r.report.instruments[0].renderedNotes,2);
 assert.equal(r.report.instruments[1].renderedNotes,2);
 assert.equal(r.report.overloaded,false);
 assert.equal(r.report.arrangement[0].sourceBpm,90);
 assert.equal(r.report.arrangement[1].sourceBpm,140);
 assert.equal(r.report.arrangement[0].targetBpm,120);
 const v=new DataView(r.wav.buffer,r.wav.byteOffset,r.wav.byteLength);
 assert.deepEqual(Array.from(r.wav.slice(0,4)),[82,73,70,70]);
 assert.equal(v.getUint16(22,true),2);
 assert.equal(v.getUint32(24,true),sr);
 assert.equal(v.getUint32(40,true),7*sr*4);
 assert.ok(r.wav.subarray(44+5*sr*4).every(x=>x===0));
 let nonzero=false,different=false;
 for(let p=44;p<44+5*sr*4;p+=4){
  const l=v.getInt16(p,true),rr=v.getInt16(p+2,true);
  nonzero||=(l!==0||rr!==0);different||=l!==rr;
 }
 assert.ok(nonzero&&different);
 assert.deepEqual(a,before);
 for(let j=0;j<i.length;j++)assert.deepEqual(i[j].sample.channels[0],samples[j]);
 assert.deepEqual(r.wav,renderIndependentArrangement(a,i,options).wav);
});
test("missing instrument, out-of-range notes, too-short samples and overload are refused",()=>{
 const p=parts(),i=instruments();
 assert.throws(()=>renderIndependentArrangement(p,[i[0]],options));
 assert.throws(()=>renderIndependentArrangement(p,i,{...options,seconds:1}));
 assert.throws(()=>renderIndependentArrangement(p,[{...i[0],region:{...i[0].region,loKey:61}},i[1]],options));
 assert.throws(()=>renderIndependentArrangement(p,[{...i[0],sample:{sampleRate:sr,channels:[new Float32Array(20)]}},i[1]],options));
 assert.throws(()=>renderIndependentArrangement(p,[{...i[0],gainDb:Infinity},i[1]],options));
 const hot=i.map(x=>({...x,sample:makeSample(440),gainDb:12,pan:0,region:{...x.region,volumeDb:0}}));
 assert.throws(()=>renderIndependentArrangement(p,hot,{...options,headroomDb:0}),/音割れ/);
});

test("two-song WAV honors opt-in original-beat rhythm and separate bass entrance",()=>{
 const r=renderIndependentArrangement(parts(),instruments(),{
  ...options,meterMapping:"preserve-beats",partOffsetBars:[0,1]
 });
 assert.equal(r.report.arrangement[0].meterMapping,"preserve-beats");
 assert.equal(r.report.arrangement[0].barRatio,1);
 assert.equal(r.report.arrangement[1].offsetBars,1);
 assert.equal(r.report.instruments[0].renderedNotes,2);
 assert.equal(r.report.instruments[1].renderedNotes,2);
 assert.equal(r.report.overloaded,false);
});

test("optional interval audit reports overlaps but never edits or changes the WAV",()=>{
 const a=renderIndependentArrangement(parts(),instruments(),options);
 const b=renderIndependentArrangement(parts(),instruments(),{...options,harmonyAudit:true});
 assert.deepEqual(b.wav,a.wav);
 assert.equal(a.report.harmonyAudit,null);
 assert.equal(b.report.harmonyAudit.sourceUnchanged,true);
 assert.ok(b.report.harmonyAudit.totalOverlaps>0);
 assert.equal(b.report.harmonyAudit.kind,"advisory-cross-part-interval-audit");
 assert.throws(()=>renderIndependentArrangement(parts(),instruments(),{...options,harmonyAudit:"yes"}));
});

test("MUSIC-100 produces two playable alternative WAVs with original source unchanged",()=>{
 const p=parts(),i=instruments(),before=structuredClone(p),samples=i.map(x=>x.sample.channels[0].slice());
 const opts={...options,seconds:10,meterMapping:"preserve-beats"};
 const result=renderIndependentEntrancePreviews(p,i,{...opts,candidateOffsetBars:[0,1]});
 assert.equal(result.previews.length,2);
 assert.equal(result.sourceUnchanged,true);
 assert.notDeepEqual(result.previews[0].wav,result.previews[1].wav);
 for(const preview of result.previews){
  assert.deepEqual(Array.from(preview.wav.slice(0,4)),[82,73,70,70]);
  assert.equal(preview.report.overloaded,false);
  assert.equal(preview.report.harmonyAudit.totalOverlaps,preview.comparison.totalOverlaps);
  assert.ok(preview.wav.subarray(44+10*sr*4).every(x=>x===0));
 }
 assert.deepEqual(result.previews[0].wav,renderIndependentArrangement(p,i,{
  ...opts,partOffsetBars:[0,0],harmonyAudit:true}).wav);
 assert.deepEqual(p,before);
 for(let n=0;n<i.length;n++)assert.deepEqual(i[n].sample.channels[0],samples[n]);
 assert.throws(()=>renderIndependentEntrancePreviews(p,i,{...opts,candidateOffsetBars:[0,1,2,3,4]}));
 assert.throws(()=>renderIndependentEntrancePreviews(p,i,{...opts,seconds:1,candidateOffsetBars:[0,1]}));
});
