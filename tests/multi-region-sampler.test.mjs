import test from "node:test";
import assert from "node:assert/strict";
import {parseMultiRegionSfz,renderMultiRegionScore} from "../integration/multi-region-sampler.js";
import {createThirtySecondGuideScore} from "../integration/thirty-second-guide.js";
import {createTailSafeWav} from "../integration/audio-tail-finisher.js";

const sr=24000;
const makeSample=(frequency)=>{
  const a=new Float32Array(sr*2);
  for(let i=0;i<a.length;i++)a[i]=Math.sin(i*2*Math.PI*frequency/sr)*0.23;
  return {channels:[a],sampleRate:sr};
};
const twoZones=[
 "<region> sample=bass.wav lokey=0 hikey=59 pitch_keycenter=48 ampeg_attack=0.01",
 "<region> sample=melody.wav lokey=60 hikey=127 pitch_keycenter=60 ampeg_release=0.1"
].join("\n");
const input=()=>new Map([["bass.wav",makeSample(120)],["melody.wav",makeSample(660)]]);
const one=(midi,velocity=90)=>({start:0,duration:1,midi,velocity});

test("two distinct key zones map melody and bass to separate local WAV samples",()=>{
  const regions=parseMultiRegionSfz(twoZones);
  assert.equal(regions.length,2);
  const samples=input(),bassOriginal=samples.get("bass.wav").channels[0].slice();
  const score=createThirtySecondGuideScore();
  const a=renderMultiRegionScore(score,regions,samples),b=renderMultiRegionScore(score,regions,samples);
  assert.equal(a.renderedNotes,30);
  assert.equal(a.skippedNotes,0);
  // Melody contains one 57 MIDI note, which correctly selects the low region.
  assert.equal(a.regionUsage[0].renderedNotes,16);
  assert.equal(a.regionUsage[1].renderedNotes,14);
  assert.deepEqual(a.pcm,b.pcm);
  assert.deepEqual(samples.get("bass.wav").channels[0],bassOriginal);
  assert.ok(a.peak>0&&a.peak<1);
  const {wav,report}=createTailSafeWav([a.pcm],sr,{silenceSeconds:2});
  assert.equal(report.totalFrames,32*sr);
  assert.ok(wav.subarray(44+30*sr*2).every(x=>x===0));
});

test("velocity layers select only matching samples",()=>{
  const regions=parseMultiRegionSfz(
    "<region> sample=soft.wav key=69 lovel=0 hivel=80\n"+
    "<region> sample=hard.wav key=69 lovel=81 hivel=127"
  );
  const samples=new Map([["soft.wav",makeSample(100)],["hard.wav",makeSample(900)]]);
  const result=renderMultiRegionScore([one(69,40),{...one(69,110),start:1}],regions,samples,{seconds:3});
  assert.deepEqual(result.regionUsage.map(x=>x.renderedNotes),[1,1]);
  assert.equal(result.skippedNotes,0);
});

test("zone gaps are reported rather than silently mapped to a different sound",()=>{
  const regions=parseMultiRegionSfz("<region> sample=one.wav key=60");
  const r=renderMultiRegionScore([one(60),one(61)],regions,new Map([["one.wav",makeSample(300)]]),{seconds:2});
  assert.equal(r.renderedNotes,1);
  assert.equal(r.skippedNotes,1);
});

test("unsupported SFZ structures, overlaps, malicious paths, missing samples are refused",()=>{
  for(const sfz of [
    "<region> sample=a.wav key=60\n<region> sample=b.wav key=60",
    "<region> sample=a.wav lokey=0 hikey=60\n<region> sample=b.wav lokey=60 hikey=127",
    "<group> <region> sample=a.wav",
    "#include external.sfz\n<region> sample=a.wav",
    "<region> sample=../secrets.wav",
    "<region> sample=a.wav loop_mode=loop_continuous",
    "<region> sample=a.wav\n<region> sample=b.wav\n<control> path=unsafe",
    Array.from({length:17},(_,i)=>"<region> sample="+i+".wav").join("\n")
  ])assert.throws(()=>parseMultiRegionSfz(sfz),undefined,sfz.slice(0,70));
  const parsed=parseMultiRegionSfz(twoZones);
  assert.throws(()=>renderMultiRegionScore([one(60)],parsed,new Map([["melody.wav",makeSample(220)]])));
  assert.throws(()=>renderMultiRegionScore([one(60),{...one(63),start:-1}],parsed,input()));
});

test("programmatic overlap attempts are rejected independently from the parser",()=>{
 const regions=parseMultiRegionSfz(twoZones);
 regions[0].hiKey=64;
 assert.throws(()=>renderMultiRegionScore([one(60)],regions,input()));
});
