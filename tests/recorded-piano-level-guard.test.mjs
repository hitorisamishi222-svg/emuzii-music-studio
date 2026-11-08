import test from "node:test";
import assert from "node:assert/strict";
import {createRecordedPianoSfz,RECORDED_PIANO_SAMPLES} from "../integration/recorded-piano-six-sample-map.js";
import {parseMultiRegionSfz} from "../integration/multi-region-sampler.js";
import {calibrateRecordedPianoVelocity} from "../integration/recorded-piano-velocity-calibration.js";
import {planRecordedPianoLevelGuard,renderRecordedPianoVelocityBlend} from "../integration/recorded-piano-velocity-blend.js";
import {createPianoVelocitySweepScore,auditPianoVelocitySweep} from "../integration/piano-velocity-sweep-audit.js";
const sr=24000;
function makeInputs(){
 return new Map(RECORDED_PIANO_SAMPLES.map((s,i)=>{
   const a=new Float32Array(sr);
   const high=i%2===1;
   for(let j=0;j<a.length;j++){
     const t=j/sr;
     a[j]=high?.36*(-.33*Math.sin(2*Math.PI*220*t)+.944*Math.sin(2*Math.PI*330*t)):.12*Math.sin(2*Math.PI*220*t);
   }
   return [s.file,{channels:[a],sampleRate:sr}];
 }));
}
const settings=(sources)=>calibrateRecordedPianoVelocity(parseMultiRegionSfz(createRecordedPianoSfz()),sources).regions;
test("attenuation plan prevents predicted low-to-high level reversal without boosting gain",()=>{
 const sources=makeInputs(),regions=settings(sources);
 const unchanged=sources.get(RECORDED_PIANO_SAMPLES[0].file).channels[0].slice();
 const plan=planRecordedPianoLevelGuard(regions,sources);
 assert.equal(plan.pairs.length,3);
 assert.ok(plan.pairs[0].adjustedVelocityCount>0);
 for(const p of plan.pairs){
   assert.ok(p.maxReductionDb<=6);
   for(let v=64;v<=96;v++)assert.ok(p.factors.get(v)>0&&p.factors.get(v)<=1);
 }
 assert.deepEqual(sources.get(RECORDED_PIANO_SAMPLES[0].file).channels[0],unchanged);
});
test("33-step recorded-piano output uses the guard to reduce measured level reversals",()=>{
 const samples=makeInputs(),regions=settings(samples),notes=createPianoVelocitySweepScore(60);
 const raw=renderRecordedPianoVelocityBlend(notes,regions,samples,{seconds:22.2});
 const guarded=renderRecordedPianoVelocityBlend(notes,regions,samples,{seconds:22.2,levelGuard:true});
 const a=auditPianoVelocitySweep(raw.pcm,sr,notes);
 const b=auditPianoVelocitySweep(guarded.pcm,sr,notes);
 assert.ok(a.regressionCount>=1);
 assert.ok(b.regressionCount<=a.regressionCount);
 assert.ok(b.worstStep.deltaDb>=a.worstStep.deltaDb);
 assert.equal(guarded.levelGuardApplied,true);
 assert.equal(raw.levelGuardApplied,false);
 assert.equal(guarded.guardReport.length,3);
 assert.equal(guarded.overloaded,false);
 for(let i=0;i<raw.pcm.length;i++)assert.ok(Math.abs(guarded.pcm[i])<=Math.abs(raw.pcm[i])+1e-5);
});
test("guard rejects missing sample, malformed preset and unsafe requested attenuation",()=>{
 const src=makeInputs(),reg=settings(src);
 assert.throws(()=>planRecordedPianoLevelGuard(reg,src,{maxAttenuationDb:0}));
 const modified=reg.map(x=>({...x}));modified[0].sample="fake.ogg";
 assert.throws(()=>planRecordedPianoLevelGuard(modified,src));
 const missing=makeInputs();missing.delete(RECORDED_PIANO_SAMPLES[0].file);
 assert.throws(()=>renderRecordedPianoVelocityBlend([{start:0,duration:.3,midi:60,velocity:80}],reg,missing,{seconds:1,levelGuard:true}));
 assert.throws(()=>renderRecordedPianoVelocityBlend([{start:0,duration:.3,midi:60,velocity:80}],reg,src,{seconds:1,levelGuard:"yes"}));
});
