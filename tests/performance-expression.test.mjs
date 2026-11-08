import test from "node:test";
import assert from "node:assert/strict";
import {prepareExpressiveScore,PERFORMANCE_STYLES} from "../integration/performance-expression.js";
import {renderSampledScore} from "../integration/local-sample-sampler.js";
import {parseMultiRegionSfz,renderMultiRegionScore} from "../integration/multi-region-sampler.js";
import {createThirtySecondGuideScore} from "../integration/thirty-second-guide.js";

const sampleRate=24000;
function tone(){
  const wave=new Float32Array(sampleRate*3);
  for(let i=0;i<wave.length;i++)wave[i]=Math.sin(2*Math.PI*220*i/sampleRate)*.24;
  return {channels:[wave],sampleRate};
}
const note=()=>({start:0,duration:1,midi:60,velocity:100});
const render=(notes)=>renderSampledScore(notes,tone(),{seconds:2,rootMidi:60,sampleRate});
const energy=(audio,from,to)=>{let sum=0;for(let i=Math.round(from*sampleRate);i<Math.round(to*sampleRate);i++)sum+=Math.abs(audio[i]);return sum;};
test("original score unchanged; legal articulation set and durations",()=>{
  assert.deepEqual(PERFORMANCE_STYLES,["neutral","staccato","legato","gentle"]);
  const original=[note()];
  const a=prepareExpressiveScore(original,{style:"staccato",seconds:2});
  assert.equal(original[0].duration,1);
  assert.equal(original[0].tailSeconds,undefined);
  assert.ok(a[0].duration>.5&&a[0].duration<.53);
  assert.equal(a[0].tailSeconds,.015);
  const b=prepareExpressiveScore(original,{style:"legato",seconds:2});
  assert.ok(b[0].duration>1);
  assert.equal(b[0].tailSeconds,.16);
  const c=prepareExpressiveScore(original,{style:"gentle",seconds:2});
  assert.ok(c[0].velocity<original[0].velocity);
});
test("post-note release produces a measurable tail and is silent after it",()=>{
  const src=tone(),snapshot=src.channels[0].slice();
  const noTail=renderSampledScore([note()],src,{seconds:2,rootMidi:60});
  const withTail=renderSampledScore([{...note(),tailSeconds:.35}],src,{seconds:2,rootMidi:60});
  assert.equal(energy(noTail.pcm,1.06,1.09),0);
  assert.ok(energy(withTail.pcm,1.06,1.09)>1);
  assert.equal(energy(withTail.pcm,1.37,1.39),0);
  assert.deepEqual(src.channels[0],snapshot);
});
test("short samples taper to silence instead of cutting an opted-in release tail",()=>{
  const shortSource=tone();
  shortSource.channels=[shortSource.channels[0].subarray(0,Math.round(.4*sampleRate))];
  const original=shortSource.channels[0].slice();
  const r=renderSampledScore([{...note(),tailSeconds:.5}],shortSource,{seconds:2,rootMidi:60});
  const finalRenderedFrame=shortSource.channels[0].length-2;
  assert.ok(r.peak>.01);
  assert.ok(energy(r.pcm,.30,.33)>1);
  assert.ok(energy(r.pcm,.397,.399)<energy(r.pcm,.375,.377));
  assert.equal(r.pcm[finalRenderedFrame],0);
  assert.deepEqual(shortSource.channels[0],original);
});

test("staccato and legato differ in note ending, while gentle is quieter",()=>{
  const base=render([note()]);
  const short=render(prepareExpressiveScore([note()],{style:"staccato",seconds:2}));
  const connected=render(prepareExpressiveScore([note()],{style:"legato",seconds:2}));
  const gentle=render(prepareExpressiveScore([note()],{style:"gentle",seconds:2}));
  assert.equal(energy(short.pcm,.78,.82),0);
  assert.ok(energy(base.pcm,.78,.82)>1);
  assert.ok(energy(connected.pcm,1.13,1.15)>1);
  assert.ok(gentle.peak<base.peak);
});
test("30s guide stays within 30s and renders unchanged source across key zones",()=>{
  const notes=createThirtySecondGuideScore();
  const before=JSON.stringify(notes);
  const transformed=prepareExpressiveScore(notes,{style:"legato",seconds:30});
  assert.ok(transformed.every(n=>n.start+n.duration<=30.000001));
  assert.equal(JSON.stringify(notes),before);
  const regions=parseMultiRegionSfz("<region> sample=bass.wav lokey=0 hikey=59 pitch_keycenter=48\n<region> sample=melody.wav lokey=60 hikey=127 pitch_keycenter=60");
  const input=new Map([["bass.wav",tone()],["melody.wav",tone()]]);
  const r=renderMultiRegionScore(transformed,regions,input,{sampleRate,seconds:30});
  assert.equal(r.renderedNotes,30);
  assert.equal(r.skippedNotes,0);
  assert.ok(r.peak>0&&r.peak<=1);
});
test("unknown styles, invalid envelopes and invalid notes fail closed",()=>{
  assert.throws(()=>prepareExpressiveScore([note()],{style:"real-violin"}));
  assert.throws(()=>prepareExpressiveScore([{...note(),duration:5}],{seconds:2}));
  assert.throws(()=>render([{...note(),tailSeconds:3}]));
  assert.throws(()=>render([{...note(),attackSeconds:-.1}]));
  assert.throws(()=>render([{...note(),releaseSeconds:Number.NaN}]));
  const regions=parseMultiRegionSfz("<region> sample=a.wav key=60");
  assert.throws(()=>renderMultiRegionScore([{...note(),midi:61,tailSeconds:9}],regions,new Map([["a.wav",tone()]]),{seconds:2}));
});
