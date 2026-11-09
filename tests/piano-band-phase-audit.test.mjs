import test from "node:test";
import assert from "node:assert/strict";
import {auditRecordedPianoBandPhase} from "../integration/piano-band-phase-audit.js";
import {RECORDED_PIANO_SAMPLES,createRecordedPianoSfz} from "../integration/recorded-piano-six-sample-map.js";
import {recordedPianoBlendWeights,renderRecordedPianoVelocityBlend} from "../integration/recorded-piano-velocity-blend.js";
import {parseMultiRegionSfz} from "../integration/multi-region-sampler.js";
import {calibrateRecordedPianoVelocity} from "../integration/recorded-piano-velocity-calibration.js";
import {createPianoVelocitySweepScore,auditPianoVelocitySweep} from "../integration/piano-velocity-sweep-audit.js";
const sr=24000;
const oscillator=(freq,amp=.14,phase=0)=>{
 const ch=new Float32Array(sr*2);
 for(let i=0;i<ch.length;i++)ch[i]=amp*Math.sin(2*Math.PI*freq*i/sr+phase);
 return {sampleRate:sr,channels:[ch]};
};
function fixture({c5HighFrequency=440,c5HighPhase=0}={}){
 const samples=new Map(RECORDED_PIANO_SAMPLES.map((x,i)=>[
  x.file,oscillator(x.pitch==="C5"?(i%2?c5HighFrequency:440):220+i*20,.14,x.pitch==="C5"&&i%2?c5HighPhase:0)
 ]));
 return {samples,regions:parseMultiRegionSfz(createRecordedPianoSfz())};
}
test("opposite phase is distinguished from different source timbre across three windows",()=>{
 const inverse=fixture({c5HighPhase:Math.PI});
 const a=auditRecordedPianoBandPhase(inverse.regions,inverse.samples,{velocities:[64,65,80,81,96]});
 assert.equal(a.windows.length,3);
 assert.equal(a.pitch,"C5");
 assert.ok(a.windows.every(w=>w.sourceSpectralDistance<.005));
 const b=a.windows[1].modes.find(x=>x.curve==="linear");
 assert.ok(b.points.find(p=>p.velocity===80).phaseInteractionDb<-20);
 assert.ok(b.points.find(p=>p.velocity===80).strongCancellationBands>=1);
 assert.equal(b.points.find(p=>p.velocity===64).strongCancellationBands,0);
 const distinct=fixture({c5HighFrequency:1760});
 const c=auditRecordedPianoBandPhase(distinct.regions,distinct.samples,{velocities:[80]});
 assert.ok(c.windows.every(w=>w.sourceSpectralDistance>.8));
 assert.ok(c.windows.every(w=>Math.abs(w.modes[0].points[0].phaseInteractionDb)<.5));
});
test("smoothstep has near-zero 64->65 high-layer weight; linear default is stable",()=>{
 const x=recordedPianoBlendWeights(65),y=recordedPianoBlendWeights(65,{curve:"smoothstep"});
 assert.ok(y.high>0&&y.high<x.high);
 assert.deepEqual(x,recordedPianoBlendWeights(65,{curve:"linear"}));
 assert.deepEqual(recordedPianoBlendWeights(64,{curve:"smoothstep"}),{low:1,high:0,blend:false});
 assert.deepEqual(recordedPianoBlendWeights(96,{curve:"smoothstep"}),{low:0,high:1,blend:false});
 assert.throws(()=>recordedPianoBlendWeights(65,{curve:"fast"}));
});
test("smoothstep candidate is non-destructive, deterministic and distinct from the default",()=>{
 const {samples,regions}=fixture({c5HighFrequency:880,c5HighPhase:.5});
 const adjusted=calibrateRecordedPianoVelocity(regions,samples).regions;
 const input=samples.get(RECORDED_PIANO_SAMPLES[4].file).channels[0].slice();
 const notes=createPianoVelocitySweepScore(72);
 const linear=renderRecordedPianoVelocityBlend(notes,adjusted,samples,{seconds:22.2,levelGuard:true});
 const smooth=renderRecordedPianoVelocityBlend(notes,adjusted,samples,{
  seconds:22.2,levelGuard:true,blendCurve:"smoothstep"
 });
 assert.equal(smooth.blendCurve,"smoothstep");
 assert.equal(linear.blendCurve,"linear");
 assert.equal(linear.renderedNotes,33);
 assert.equal(smooth.renderedNotes,33);
 assert.equal(smooth.overloaded,false);
 assert.notDeepEqual(linear.pcm,smooth.pcm);
 const again=renderRecordedPianoVelocityBlend(notes,adjusted,samples,{seconds:22.2,levelGuard:true,blendCurve:"smoothstep"});
 assert.deepEqual(smooth.pcm,again.pcm);
 assert.deepEqual(samples.get(RECORDED_PIANO_SAMPLES[4].file).channels[0],input);
 const rawAudit=auditPianoVelocitySweep(linear.pcm,sr,notes);
 const candAudit=auditPianoVelocitySweep(smooth.pcm,sr,notes);
 assert.equal(rawAudit.velocities,33);
 assert.equal(candAudit.velocities,33);
});
test("invalid regions, missing WAV, bad time windows and sample mismatch are rejected",()=>{
 const {samples,regions}=fixture();
 assert.throws(()=>auditRecordedPianoBandPhase(regions,samples,{pitch:"C9"}));
 assert.throws(()=>auditRecordedPianoBandPhase(regions,samples,{velocities:[-1]}));
 assert.throws(()=>auditRecordedPianoBandPhase(regions,samples,{curves:["cubic"]}));
 assert.throws(()=>auditRecordedPianoBandPhase(regions,samples,{windows:[{name:"bad?",seconds:.2}]}));
 assert.throws(()=>auditRecordedPianoBandPhase(regions,samples,{windows:[{name:"late",seconds:2}]}));
 const missing=new Map(samples);missing.delete(RECORDED_PIANO_SAMPLES[5].file);
 assert.throws(()=>auditRecordedPianoBandPhase(regions,missing));
 const corrupt=new Map(samples);
 corrupt.set(RECORDED_PIANO_SAMPLES[5].file,{sampleRate:sr/2,channels:[new Float32Array(sr)]});
 assert.throws(()=>auditRecordedPianoBandPhase(regions,corrupt));
});
