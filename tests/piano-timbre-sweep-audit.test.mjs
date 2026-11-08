import test from "node:test";
import assert from "node:assert/strict";
import {auditPianoTimbreSweep} from "../integration/piano-timbre-sweep-audit.js";
import {createPianoVelocitySweepScore} from "../integration/piano-velocity-sweep-audit.js";
import {createRecordedPianoSfz,RECORDED_PIANO_SAMPLES} from "../integration/recorded-piano-six-sample-map.js";
import {parseMultiRegionSfz} from "../integration/multi-region-sampler.js";
import {calibrateRecordedPianoVelocity} from "../integration/recorded-piano-velocity-calibration.js";
import {renderRecordedPianoVelocityBlend} from "../integration/recorded-piano-velocity-blend.js";
const sampleRate=24000;
const makeScore=()=>createPianoVelocitySweepScore(60,{first:79,last:81});
function makePcm(score,tones){
 const pcm=new Float32Array(4*sampleRate);
 score.forEach((n,i)=>{
  const first=Math.round(n.start*sampleRate);
  const freq=tones[i];
  for(let k=0;k<Math.round(.45*sampleRate);k++){
   pcm[first+k]=.2*Math.sin(2*Math.PI*freq*k/sampleRate);
  }
 });
 return pcm;
}
test("fixed-frequency wave produces near-zero adjacent spectral distance",()=>{
 const score=makeScore(),pcm=makePcm(score,[440,440,440]),original=pcm.slice();
 const r=auditPianoTimbreSweep(pcm,sampleRate,score);
 assert.equal(r.analyzedNotes,3);
 assert.equal(r.warningCount,0);
 assert.ok(r.worstAdjacentChange.spectralDistance<.0001);
 assert.ok(r.snapshots.every(x=>Math.abs(x.centroidHz-440)<15));
 assert.deepEqual(pcm,original);
});
test("changing a harmonic from 440 Hz to 1600 Hz is detectable despite matched overall RMS",()=>{
 const score=makeScore(),pcm=makePcm(score,[440,440,1600]);
 const r=auditPianoTimbreSweep(pcm,sampleRate,score);
 assert.ok(r.worstAdjacentChange.spectralDistance>.8);
 assert.equal(r.warningCount,1);
 assert.deepEqual(r.warnings.map(x=>[x.from,x.to]),[[80,81]]);
 assert.ok(r.snapshots[2].centroidHz>r.snapshots[1].centroidHz+1000);
});
test("out of range, NaN and invalid spectral windows fail closed",()=>{
 const score=makeScore(),pcm=makePcm(score,[440,440,440]);
 assert.throws(()=>auditPianoTimbreSweep(pcm.subarray(0,1000),sampleRate,score));
 assert.throws(()=>auditPianoTimbreSweep(pcm,sampleRate,score,{offsetSeconds:0}));
 assert.throws(()=>auditPianoTimbreSweep(pcm,sampleRate,score,{warningDistance:2}));
 const copy=pcm.slice();copy[3000]=NaN;assert.throws(()=>auditPianoTimbreSweep(copy,sampleRate,score));
 const broken=score.map(x=>({...x}));broken[2].velocity=84;
 assert.throws(()=>auditPianoTimbreSweep(pcm,sampleRate,broken));
});
test("full synthetic 33-step CC0-map render produces finite spectral changes and keeps original samples",()=>{
 const samples=new Map(RECORDED_PIANO_SAMPLES.map((s,i)=>{
   const ch=new Float32Array(sampleRate*2);
   const freq=i%2?880:220;
   for(let k=0;k<ch.length;k++)ch[k]=.15*Math.sin(2*Math.PI*freq*k/sampleRate);
   return [s.file,{sampleRate,channels:[ch]}];
 }));
 const original=samples.get(RECORDED_PIANO_SAMPLES[0].file).channels[0].slice();
 const regions=calibrateRecordedPianoVelocity(parseMultiRegionSfz(createRecordedPianoSfz()),samples).regions;
 const notes=createPianoVelocitySweepScore(60);
 const rendered=renderRecordedPianoVelocityBlend(notes,regions,samples,{seconds:22.2});
 const q=auditPianoTimbreSweep(rendered.pcm,sampleRate,notes);
 assert.equal(q.analyzedNotes,33);
 assert.equal(q.adjacent.length,32);
 assert.ok(Number.isFinite(q.worstAdjacentChange.spectralDistance));
 assert.ok(q.worstAdjacentChange.spectralDistance>0);
 assert.deepEqual(samples.get(RECORDED_PIANO_SAMPLES[0].file).channels[0],original);
});
