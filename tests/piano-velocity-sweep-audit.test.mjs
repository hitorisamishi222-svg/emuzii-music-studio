import test from "node:test";
import assert from "node:assert/strict";
import {createPianoVelocitySweepScore,auditPianoVelocitySweep} from "../integration/piano-velocity-sweep-audit.js";
import {parseMultiRegionSfz} from "../integration/multi-region-sampler.js";
import {createRecordedPianoSfz,RECORDED_PIANO_SAMPLES} from "../integration/recorded-piano-six-sample-map.js";
import {calibrateRecordedPianoVelocity} from "../integration/recorded-piano-velocity-calibration.js";
import {renderRecordedPianoVelocityBlend} from "../integration/recorded-piano-velocity-blend.js";
import {createTailSafeWav} from "../integration/audio-tail-finisher.js";
const sr=24000;
const synth=(amp,negative=false)=>{
 const ch=new Float32Array(sr*2);
 for(let i=0;i<ch.length;i++)ch[i]=amp*(negative?-1:1)*Math.sin(i*2*Math.PI*240/sr);
 return {sampleRate:sr,channels:[ch]};
};
test("33 consecutive velocity notes fit one short listenable WAV",()=>{
 const notes=createPianoVelocitySweepScore(60);
 assert.equal(notes.length,33);
 assert.equal(notes[0].velocity,64);
 assert.equal(notes.at(-1).velocity,96);
 assert.ok(notes.at(-1).start+notes.at(-1).duration<22);
 assert.deepEqual(notes,createPianoVelocitySweepScore(60));
});
test("RMS audit reports adjacent level differences and identifies dips",()=>{
 const notes=createPianoVelocitySweepScore(60,{first:78,last:82});
 const pcm=new Float32Array(sr*4);
 const factors=[1,1.1,.9,1.2,1.3];
 for(let k=0;k<notes.length;k++){
  const start=Math.round(notes[k].start*sr);
  for(let i=0;i<Math.round(.45*sr);i++)pcm[start+i]=factors[k]*.1*Math.sin(i*2*Math.PI*220/sr);
 }
 const r=auditPianoVelocitySweep(pcm,sr,notes);
 assert.equal(r.velocities,5);
 assert.equal(r.adjacent.length,4);
 assert.equal(r.regressionCount,1);
 assert.deepEqual(r.regressions.map(x=>[x.from,x.to]),[[79,80]]);
 assert.equal(r.overloaded,false);
 assert.ok(r.worstStep.deltaDb< -1);
});
test("large dynamics must remain finite and samples/scores unmodified",()=>{
 const samples=new Map(RECORDED_PIANO_SAMPLES.map((s,i)=>[s.file,synth(i%2===0?.08:.35)]));
 const regions=calibrateRecordedPianoVelocity(parseMultiRegionSfz(createRecordedPianoSfz()),samples).regions;
 const score=createPianoVelocitySweepScore(60);
 const original=JSON.stringify(score);
 const audio=renderRecordedPianoVelocityBlend(score,regions,samples,{seconds:22.2});
 assert.equal(audio.renderedNotes,33);
 assert.equal(audio.skippedNotes,0);
 const audit=auditPianoVelocitySweep(audio.pcm,sr,score);
 assert.equal(audit.levels.length,33);
 assert.ok(audit.peak>0&&audit.peak<1);
 assert.equal(JSON.stringify(score),original);
 const wav=createTailSafeWav([audio.pcm],sr,{silenceSeconds:2}).wav;
 assert.equal(new DataView(wav.buffer).getUint32(40,true),Math.ceil(24.2*sr)*2);
});
test("reject mismatched score, short audio, NAN and illegal window settings",()=>{
 assert.throws(()=>createPianoVelocitySweepScore(60,{spacingSeconds:.25}));
 const notes=createPianoVelocitySweepScore(60,{first:70,last:71});
 assert.throws(()=>auditPianoVelocitySweep(new Float32Array(1000),sr,notes));
 assert.throws(()=>auditPianoVelocitySweep(new Float32Array(sr*3),sr,notes,{measureToSeconds:.4}));
 const pcm=new Float32Array(sr*3);pcm[100]=NaN;
 assert.throws(()=>auditPianoVelocitySweep(pcm,sr,notes));
 assert.throws(()=>auditPianoVelocitySweep(new Float32Array(sr*3),sr,notes));
});
