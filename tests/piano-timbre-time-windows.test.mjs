import test from "node:test";
import assert from "node:assert/strict";
import {auditPianoTimbreTimeWindows,DEFAULT_TIMBRE_WINDOWS} from "../integration/piano-timbre-time-windows.js";
import {createPianoVelocitySweepScore} from "../integration/piano-velocity-sweep-audit.js";
const sr=24000;
const notes=()=>createPianoVelocitySweepScore(60,{first:79,last:81});
function makePcm({attackChange=false,endingChange=false}={}){
  const score=notes(),pcm=new Float32Array(sr*3);
  for(let n=0;n<score.length;n++){
    const base=Math.round(score[n].start*sr);
    for(let i=0;i<Math.round(.46*sr);i++){
      const secs=i/sr;
      const freq=n===1&&attackChange&&secs<.12?1600:
        n===2&&endingChange&&secs>=.305?1600:440;
      pcm[base+i]=.18*Math.sin(2*Math.PI*freq*secs);
    }
  }
  return pcm;
}
test("stable tones have no false discontinuity in attack body and ending windows",()=>{
 const pcm=makePcm(),original=pcm.slice(),r=auditPianoTimbreTimeWindows(pcm,sr,notes());
 assert.equal(r.windows.length,3);
 assert.deepEqual(r.windows.map(x=>x.name),["attack","body","ending"]);
 assert.equal(r.warningCount,0);
 assert.ok(r.largestAdjacentDistance<.001);
 assert.deepEqual(pcm,original);
});
test("attack-only timbre discontinuity is detected at onset, not in body",()=>{
 const r=auditPianoTimbreTimeWindows(makePcm({attackChange:true}),sr,notes());
 assert.ok(r.windows[0].warningCount>0);
 assert.equal(r.windows[1].warningCount,0);
 assert.equal(r.windows[2].warningCount,0);
 assert.equal(r.worstWindow,"attack");
});
test("ending-only timbre discontinuity is detected late in the note",()=>{
 const r=auditPianoTimbreTimeWindows(makePcm({endingChange:true}),sr,notes());
 assert.equal(r.windows[0].warningCount,0);
 assert.equal(r.windows[1].warningCount,0);
 assert.ok(r.windows[2].warningCount>0);
 assert.equal(r.worstWindow,"ending");
});
test("reject repeated windows, out of bounds and insufficient note duration",()=>{
 assert.throws(()=>auditPianoTimbreTimeWindows(makePcm(),sr,notes(),{windows:[]}));
 assert.throws(()=>auditPianoTimbreTimeWindows(makePcm(),sr,notes(),{
   windows:[{name:"attack",offsetSeconds:.1},{name:"attack",offsetSeconds:.2}]
 }));
 assert.throws(()=>auditPianoTimbreTimeWindows(makePcm(),sr,notes(),{
   windows:[{name:"bad",offsetSeconds:.42}]
 }));
 const bad=notes().map(n=>({...n,duration:.36}));
 assert.throws(()=>auditPianoTimbreTimeWindows(makePcm(),sr,bad));
 assert.deepEqual(DEFAULT_TIMBRE_WINDOWS.map(x=>x.offsetSeconds),[.025,.13,.32]);
});
