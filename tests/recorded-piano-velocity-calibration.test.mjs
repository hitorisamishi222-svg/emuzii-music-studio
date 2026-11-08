import test from "node:test";
import assert from "node:assert/strict";
import {calibrateRecordedPianoVelocity,sampleWindowRms} from "../integration/recorded-piano-velocity-calibration.js";
import {RECORDED_PIANO_SAMPLES,createRecordedPianoSfz} from "../integration/recorded-piano-six-sample-map.js";
import {parseMultiRegionSfz,renderMultiRegionScore} from "../integration/multi-region-sampler.js";
const sr=24000;
const sample=amplitude=>{
 const signal=new Float32Array(sr);
 for(let i=0;i<signal.length;i++)signal[i]=amplitude*Math.sin(2*Math.PI*220*i/sr);
 return {sampleRate:sr,channels:[signal]};
};
const sources=()=>new Map(RECORDED_PIANO_SAMPLES.map((s,i)=>[s.file,sample(i%2===0?.10:.30)]));
const pairNotes=[
 {start:0,duration:.25,midi:48,velocity:80},
 {start:.5,duration:.25,midi:48,velocity:81}
];
const energy=(pcm,start,end)=>{
 let sum=0;
 for(let i=Math.round(start*sr);i<Math.round(end*sr);i++)sum+=pcm[i]*pcm[i];
 return Math.sqrt(sum/(Math.round((end-start)*sr)));
};
test("attack-window RMS on stereo is deterministic and source-preserving",()=>{
 const a=sample(.2),copy=a.channels[0].slice();
 const low=sampleWindowRms(a),high=sampleWindowRms(sample(.4));
 assert.ok(high/low>1.99&&high/low<2.01);
 assert.deepEqual(a.channels[0],copy);
 assert.throws(()=>sampleWindowRms({...a,channels:[new Float32Array(20)]}));
 assert.throws(()=>sampleWindowRms(sample(0)));
});
test("calibration reduces the abrupt 80-to-81 velocity output gain jump",()=>{
 const regions=parseMultiRegionSfz(createRecordedPianoSfz());
 const original=regions.map(r=>({...r})),inputs=sources();
 const first=inputs.get(RECORDED_PIANO_SAMPLES[0].file).channels[0].slice();
 const {regions:adjusted,report}=calibrateRecordedPianoVelocity(regions,inputs);
 assert.equal(report.length,3);
 for(const row of report){
   assert.ok(row.measuredJumpDb>9);
   assert.ok(row.appliedDb<=0&&row.appliedDb>=-6);
   assert.ok(Math.abs(row.residualDb)<Math.abs(row.measuredJumpDb));
 }
 assert.deepEqual(regions,original);
 assert.deepEqual(inputs.get(RECORDED_PIANO_SAMPLES[0].file).channels[0],first);
 const uncorrected=renderMultiRegionScore(pairNotes,regions,inputs,{seconds:2,sampleRate:sr});
 const corrected=renderMultiRegionScore(pairNotes,adjusted,inputs,{seconds:2,sampleRate:sr});
 const before=20*Math.log10(energy(uncorrected.pcm,.55,.68)/energy(uncorrected.pcm,.05,.18));
 const after=20*Math.log10(energy(corrected.pcm,.55,.68)/energy(corrected.pcm,.05,.18));
 assert.ok(Math.abs(after)<Math.abs(before));
 assert.ok(Math.abs(before)>9);
 assert.equal(corrected.overloaded,false);
});
test("calibration clamps gain and rejects modified/missing preset",()=>{
 const regions=parseMultiRegionSfz(createRecordedPianoSfz());
 const r=calibrateRecordedPianoVelocity(regions,sources(),{maxCorrectionDb:3});
 assert.ok(r.report.every(x=>Math.abs(x.appliedDb)<=3.00001));
 const modified=regions.map(x=>({...x}));
 modified[0].loKey=32;
 assert.throws(()=>calibrateRecordedPianoVelocity(modified,sources()));
 const missing=sources();missing.delete(RECORDED_PIANO_SAMPLES[0].file);
 assert.throws(()=>calibrateRecordedPianoVelocity(regions,missing));
 assert.throws(()=>calibrateRecordedPianoVelocity(regions,sources(),{maxCorrectionDb:30}));
});
