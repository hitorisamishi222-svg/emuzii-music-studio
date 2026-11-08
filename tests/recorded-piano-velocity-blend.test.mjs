import test from "node:test";
import assert from "node:assert/strict";
import {createRecordedPianoSfz,RECORDED_PIANO_SAMPLES} from "../integration/recorded-piano-six-sample-map.js";
import {parseMultiRegionSfz,renderMultiRegionScore} from "../integration/multi-region-sampler.js";
import {calibrateRecordedPianoVelocity} from "../integration/recorded-piano-velocity-calibration.js";
import {recordedPianoBlendWeights,inspectRecordedPianoBlendPhase,renderRecordedPianoVelocityBlend} from "../integration/recorded-piano-velocity-blend.js";
import {createThirtySecondGuideScore} from "../integration/thirty-second-guide.js";
import {createTailSafeWav} from "../integration/audio-tail-finisher.js";

const sr=24000,regions=()=>parseMultiRegionSfz(createRecordedPianoSfz());
const source=(a,reverse=false)=>{
 const ch=new Float32Array(sr*3);
 for(let i=0;i<ch.length;i++)ch[i]=Math.sin(2*Math.PI*220*i/sr)*a*(reverse?-1:1);
 return {sampleRate:sr,channels:[ch]};
};
const sources=()=>new Map(RECORDED_PIANO_SAMPLES.map((s,i)=>[s.file,source(i%2===0?.12:.36)]));
const note=(velocity,start=0,midi=60)=>({start,duration:.45,midi,velocity});
const rms=(array,start,end)=>{
 const a=Math.round(start*sr),b=Math.round(end*sr);let sum=0;
 for(let i=a;i<b;i++)sum+=array[i]*array[i];
 return Math.sqrt(sum/(b-a));
};
test("crossfade weights are continuous at 80/81, bounded, and do not invent new layers",()=>{
 assert.deepEqual(recordedPianoBlendWeights(64),{low:1,high:0,blend:false});
 assert.deepEqual(recordedPianoBlendWeights(96),{low:0,high:1,blend:false});
 for(let v=0;v<=127;v++){
  const w=recordedPianoBlendWeights(v);
  assert.ok(w.low>=0&&w.high>=0&&w.low<=1&&w.high<=1);
  assert.ok(Math.abs(w.low+w.high-1)<1e-12);
 }
 const a=recordedPianoBlendWeights(80),b=recordedPianoBlendWeights(81);
 assert.equal(b.high-a.high,1/32);
 assert.throws(()=>recordedPianoBlendWeights(80,{start:96,end:64}));
});
test("linear crossfade reduces the 80/81 jump compared with hard switch and -6dB gain",()=>{
 const inp=sources(),base=regions(),cal=calibrateRecordedPianoVelocity(base,inp).regions;
 const ns=[note(80),note(81,1)];
 const raw=renderMultiRegionScore(ns,base,inp,{seconds:2});
 const gain=renderMultiRegionScore(ns,cal,inp,{seconds:2});
 const blended=renderRecordedPianoVelocityBlend(ns,cal,inp,{seconds:2});
 const jump=r=>20*Math.log10(rms(r.pcm,1.06,1.27)/rms(r.pcm,.06,.27));
 assert.ok(Math.abs(jump(gain))<Math.abs(jump(raw)));
 assert.ok(Math.abs(jump(blended))<Math.abs(jump(gain)));
 assert.equal(blended.renderedNotes,2);
 assert.equal(blended.blendedNotes,2);
 assert.equal(blended.skippedNotes,0);
 assert.equal(blended.overloaded,false);
 assert.equal(blended.regionUsage.filter(x=>x.voices>0).length,2);
});
test("30s score works with six sources, 32s real-zero tail, and retains original score",()=>{
 const src=sources(),before=src.get(RECORDED_PIANO_SAMPLES[0].file).channels[0].slice();
 const notes=createThirtySecondGuideScore(),snapshot=JSON.stringify(notes);
 const r=renderRecordedPianoVelocityBlend(notes,calibrateRecordedPianoVelocity(regions(),src).regions,src);
 assert.equal(r.renderedNotes,30);
 assert.equal(r.skippedNotes,0);
 assert.ok(r.blendedNotes>0);
 assert.ok(r.peak>0&&r.peak<1);
 assert.deepEqual(notes,JSON.parse(snapshot));
 assert.deepEqual(src.get(RECORDED_PIANO_SAMPLES[0].file).channels[0],before);
 const finished=createTailSafeWav([r.pcm],sr,{silenceSeconds:2}).wav;
 assert.equal(new DataView(finished.buffer).getUint32(40,true),32*sr*2);
 assert.ok(finished.subarray(44+30*sr*2).every(x=>x===0));
});
test("notes outside recorded range are skipped and malformed score is blocked",()=>{
 const inp=sources();
 const r=renderRecordedPianoVelocityBlend([note(80,0,20),note(81,1,99),note(80,2,60)],regions(),inp,{seconds:3});
 assert.equal(r.renderedNotes,1);
 assert.equal(r.skippedNotes,2);
 const bad=regions();bad[0].loKey=0;
 assert.throws(()=>renderRecordedPianoVelocityBlend([note(90)],bad,inp,{seconds:2}));
 assert.throws(()=>renderRecordedPianoVelocityBlend([{...note(90),gainMultiplier:2}],regions(),inp,{seconds:2}));
 assert.throws(()=>renderRecordedPianoVelocityBlend([{...note(90),tailSeconds:5}],regions(),inp,{seconds:2}));
 assert.throws(()=>renderRecordedPianoVelocityBlend([note(90)],regions(),inp,{start:96,end:64,seconds:2}));
 inp.delete(RECORDED_PIANO_SAMPLES[0].file);
 assert.throws(()=>renderRecordedPianoVelocityBlend([note(90)],regions(),inp,{seconds:2}));
});
test("phase indicator warns on opposite-polarity recordings without altering either",()=>{
 const same=inspectRecordedPianoBlendPhase(source(.2),source(.3));
 const opposite=inspectRecordedPianoBlendPhase(source(.2),source(.3,true));
 assert.ok(same.correlation>.99);
 assert.equal(same.oppositePhaseRisk,false);
 assert.ok(opposite.correlation<-.99);
 assert.equal(opposite.oppositePhaseRisk,true);
 assert.throws(()=>inspectRecordedPianoBlendPhase(source(0),source(.3)));
});
