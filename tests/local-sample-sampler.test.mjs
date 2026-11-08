import test from "node:test";
import assert from "node:assert/strict";
import {parseSingleRegionSfz,renderSampledScore} from "../integration/local-sample-sampler.js";
import {createTailSafeWav} from "../integration/audio-tail-finisher.js";

const rate=24000;
function generatedSource(seconds=2){
 const s=new Float32Array(rate*seconds);
 for(let i=0;i<s.length;i++)s[i]=Math.sin(2*Math.PI*440*i/rate)*.45;
 return {channels:[s],sampleRate:rate};
}
const n=(midi=69,velocity=90)=>({start:0,duration:.4,midi,velocity});
test("single-region SFZ reads local WAV name and expression bounds",()=>{
 const p=parseSingleRegionSfz("<region> sample=harp.wav key=69 lovel=50 hivel=120 volume=-3 ampeg_attack=0.02 ampeg_release=0.12");
 assert.deepEqual(p,{sample:"harp.wav",loKey:69,hiKey:69,rootMidi:69,loVel:50,hiVel:120,volumeDb:-3,attackSeconds:.02,releaseSeconds:.12});
 const r=renderSampledScore([n()],generatedSource(),{...p,sampleRate:rate,seconds:1});
 assert.equal(r.kind,"local-sample-render"); assert.equal(r.renderedNotes,1);
 assert.equal(r.overloaded,false);
});
test("bounded SFZ accepts local OGG previews but not paths, URLs, or unknown formats",()=>{
 const ogg=parseSingleRegionSfz("<region> sample=INSPiano_Vel03_C4_01.ogg key=60");
 assert.equal(ogg.sample,"INSPiano_Vel03_C4_01.ogg");
 for(const path of ["../C4.ogg","/tmp/C4.ogg","https://example.org/C4.ogg","C4.mp3","folder\\\\C4.ogg"]){
  assert.throws(()=>parseSingleRegionSfz("<region> sample="+path));
 }
});

test("sample re-pitch is faster and duration shortens without looping",()=>{
 const src=generatedSource(1);
 const base=renderSampledScore([n(69)],src,{sampleRate:rate,seconds:1,rootMidi:69,attackSeconds:0,releaseSeconds:0});
 const octave=renderSampledScore([n(81)],src,{sampleRate:rate,seconds:1,rootMidi:69,attackSeconds:0,releaseSeconds:0});
 const zeroCross=ch=>{let x=0;for(let i=1;i<ch.length/3;i++)if(ch[i-1]<0&&ch[i]>=0)x++;return x;};
 assert.ok(zeroCross(octave.pcm)>zeroCross(base.pcm)*1.8);
 assert.equal(base.sourceUnchanged,true);
});
test("note dynamics, region key/velocity limits and deterministic output",()=>{
 const src=generatedSource();
 const low=renderSampledScore([n(69,40)],src,{seconds:1,rootMidi:69});
 const high=renderSampledScore([n(69,100)],src,{seconds:1,rootMidi:69});
 assert.ok(high.peak>low.peak*2);
 assert.deepEqual(high.pcm,renderSampledScore([n(69,100)],src,{seconds:1,rootMidi:69}).pcm);
 const gated=renderSampledScore([n(60,110),n(69,20)],src,{seconds:1,rootMidi:69,loKey:69,loVel:40});
 assert.equal(gated.renderedNotes,0); assert.equal(gated.skippedNotes,2);
});
test("WAV output is valid with no source mutation and exactly two seconds of PCM silence",()=>{
 const src=generatedSource();
 const original=src.channels[0].slice();
 const result=renderSampledScore([n()],src,{sampleRate:rate,seconds:1,rootMidi:69});
 const {wav,report}=createTailSafeWav([result.pcm],rate,{silenceSeconds:2});
 const v=new DataView(wav.buffer,wav.byteOffset,wav.byteLength);
 assert.equal(v.getUint32(24,true),rate);
 assert.equal(report.totalFrames,rate*3);
 assert.ok(wav.subarray(44+rate*2).every(x=>x===0));
 assert.deepEqual(src.channels[0],original);
});
test("rejects unsafe SFZ paths, unknown opcodes, multiple regions, malformed data",()=>{
 for(const text of [
  "<region> sample=../secret.wav", "<region> sample=https://example.org/sample.wav",
  "<region> sample=demo.wav loop_mode=loop_continuous",
  "<group> sample=demo.wav <region> sample=demo.wav",
  "<region> sample=demo.wav lokey=80 hikey=50",
  "<region> sample=demo.wav sample=other.wav",
  "<region> sample=demo.wav ampeg_release=999"
 ]) assert.throws(()=>parseSingleRegionSfz(text),undefined,text);
 assert.throws(()=>renderSampledScore([n()],{channels:[],sampleRate:rate}));
 assert.throws(()=>renderSampledScore([{...n(),velocity:200}],generatedSource()));
 assert.throws(()=>renderSampledScore([n()],generatedSource(),{sampleRate:rate,seconds:100}));
});
