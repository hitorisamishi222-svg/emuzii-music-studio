import test from "node:test";
import assert from "node:assert/strict";
import {RECORDED_PIANO_SAMPLES,RECORDED_PIANO_UPSTREAM,createRecordedPianoSfz} from "../integration/recorded-piano-six-sample-map.js";
import {parseMultiRegionSfz,renderMultiRegionScore} from "../integration/multi-region-sampler.js";
import {createThirtySecondGuideScore} from "../integration/thirty-second-guide.js";
import {createTailSafeWav} from "../integration/audio-tail-finisher.js";
const sr=24000;
const fakeSample=(frequency)=>{
 const pcm=new Float32Array(sr*3);
 for(let i=0;i<pcm.length;i++)pcm[i]=Math.sin(2*Math.PI*frequency*i/sr)*.12;
 return {sampleRate:sr,channels:[pcm]};
};
test("six pinned CC0 source hashes are valid and distinct",()=>{
 assert.equal(RECORDED_PIANO_SAMPLES.length,6);
 assert.equal(RECORDED_PIANO_UPSTREAM.license,"CC0-1.0");
 assert.deepEqual([...new Set(RECORDED_PIANO_SAMPLES.map(s=>s.pitch))],["C3","C4","C5"]);
 assert.deepEqual([...new Set(RECORDED_PIANO_SAMPLES.map(s=>s.velocityLayer))],["Vel01","Vel03"]);
 assert.equal(new Set(RECORDED_PIANO_SAMPLES.map(s=>s.file)).size,6);
 for(const s of RECORDED_PIANO_SAMPLES)assert.match(s.sha256,/^[a-f0-9]{64}$/);
});
test("six SFZ regions select one local source per note and are valid without universal SFZ claims",()=>{
 const regions=parseMultiRegionSfz(createRecordedPianoSfz());
 assert.equal(regions.length,6);
 const samples=new Map(RECORDED_PIANO_SAMPLES.map((s,i)=>[s.file,fakeSample(125+i*65)]));
 const probe=RECORDED_PIANO_SAMPLES.map((s,i)=>({
   start:i*2,duration:1,midi:s.rootMidi,velocity:s.loVel===0?48:112
 }));
 const result=renderMultiRegionScore(probe,regions,samples,{sampleRate:sr,seconds:14});
 assert.equal(result.renderedNotes,6);
 assert.equal(result.skippedNotes,0);
 assert.deepEqual(result.regionUsage.map(x=>x.renderedNotes),[1,1,1,1,1,1]);
 assert.ok(result.peak>.001&&result.peak<1);
});
test("30-second score selects a plausible mix of real-piano source zones, stays deterministic",()=>{
 const regions=parseMultiRegionSfz(createRecordedPianoSfz());
 const samples=new Map(RECORDED_PIANO_SAMPLES.map((s,i)=>[s.file,fakeSample(125+i*65)]));
 const score=createThirtySecondGuideScore();
 const a=renderMultiRegionScore(score,regions,samples),b=renderMultiRegionScore(score,regions,samples);
 assert.equal(a.renderedNotes,30);
 assert.equal(a.skippedNotes,0);
 assert.ok(a.regionUsage.filter(z=>z.renderedNotes>0).length>=4);
 assert.deepEqual(a.pcm,b.pcm);
 const wav=createTailSafeWav([a.pcm],sr,{silenceSeconds:2}).wav;
 assert.equal(new DataView(wav.buffer).getUint32(40,true),32*sr*2);
 assert.ok(wav.subarray(44+30*sr*2).every(v=>v===0));
});
