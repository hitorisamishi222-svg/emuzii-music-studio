import test from "node:test";
import assert from "node:assert/strict";
import {analyzeOfflineVocalFrame} from "../integration/offline-vocal-correction-analysis.js";
const sr=24000;
const sine=(hz,amp=.3)=>Float32Array.from({length:4096},(_,i)=>amp*Math.sin(2*Math.PI*hz*i/sr));
test("trusted reference allows advisory-only correction but leaves audio unchanged",()=>{
 const pcm=sine(440*Math.pow(2,200/1200)),before=pcm.slice();
 const result=analyzeOfflineVocalFrame(pcm,{referenceHz:440});
 assert.equal(result.detected.voiced,true,JSON.stringify(result));
 assert.equal(result.correction.active,true);
 assert.ok(result.correction.correctionCents<0);
 assert.ok(result.correction.correctionCents>=-35);
 assert.equal(result.applied,false);
 assert.deepEqual(pcm,before);
});
test("no target note, silence and small deviations never create applied correction",()=>{
 const pcm=sine(440);
 const noReference=analyzeOfflineVocalFrame(pcm);
 assert.equal(noReference.reason,"no-reference");
 assert.equal(noReference.correction,null);
 assert.equal(noReference.applied,false);
 const silence=analyzeOfflineVocalFrame(new Float32Array(4096),{referenceHz:440});
 assert.equal(silence.reason,"silence");
 assert.equal(silence.correction,null);
 const near=analyzeOfflineVocalFrame(sine(440*Math.pow(2,25/1200)),{referenceHz:440});
 assert.equal(near.correction.correctionCents,0);
 assert.equal(near.applied,false);
 assert.throws(()=>analyzeOfflineVocalFrame(pcm,{referenceHz:-1}));
});
