import test from "node:test";
import assert from "node:assert/strict";
import {fuseIndependentStems,exportFusedStemsWav} from "../integration/independent-stem-fusion.js";
const sr=24000,seconds=2,frames=sr*seconds;
const tone=(frequency,amplitude=.2)=>{
 const pcm=new Float32Array(frames);
 for(let i=0;i<frames;i++)pcm[i]=amplitude*Math.sin(2*Math.PI*frequency*i/sr);
 return pcm;
};
const stems=()=>[
 {name:"composition-A-melody",pcm:tone(440),gainDb:0,pan:-.65,sampleRate:sr},
 {name:"composition-B-bass",pcm:tone(110),gainDb:-3,pan:.65,sampleRate:sr}
];
test("two separately composed PCM tracks fuse to deterministic stereo without editing originals",()=>{
 const input=stems(),saved=input.map(x=>x.pcm.slice());
 const a=fuseIndependentStems(input,{sampleRate:sr,seconds});
 const b=fuseIndependentStems(input,{sampleRate:sr,seconds});
 assert.equal(a.stemCount,2);
 assert.equal(a.channels.length,2);
 assert.equal(a.channels[0].length,frames);
 assert.equal(a.overloaded,false);
 assert.ok(a.peak>0&&a.peak<1);
 assert.notDeepEqual(a.channels[0],a.channels[1]);
 assert.deepEqual(a.channels[0],b.channels[0]);
 assert.deepEqual(a.channels[1],b.channels[1]);
 for(let i=0;i<input.length;i++)assert.deepEqual(input[i].pcm,saved[i]);
});
test("WAV is 2-channel 16-bit with 2s of literal silence, distinct left/right",()=>{
 const {wav,report}=exportFusedStemsWav(stems(),{sampleRate:sr,seconds});
 assert.equal(report.channels,2);
 assert.equal(report.stemCount,2);
 assert.equal(report.totalFrames,frames+2*sr);
 assert.deepEqual(Array.from(wav.subarray(0,4)),[82,73,70,70]);
 const v=new DataView(wav.buffer,wav.byteOffset,wav.byteLength);
 assert.equal(v.getUint16(22,true),2);
 assert.equal(v.getUint32(24,true),sr);
 assert.equal(v.getUint32(40,true),(frames+2*sr)*4);
 assert.ok(wav.subarray(44+frames*4).every(x=>x===0));
 let different=false;
 for(let i=44;i<44+frames*4;i+=4){
  if(v.getInt16(i,true)!==v.getInt16(i+2,true)){different=true;break;}
 }
 assert.equal(different,true);
});
test("no automatic normalization or silent clipping; overloaded export rejected",()=>{
 const huge=[
 {name:"A",pcm:tone(440,1),gainDb:12,pan:0},
 {name:"B",pcm:tone(440,1),gainDb:12,pan:0}
 ];
 const result=fuseIndependentStems(huge,{sampleRate:sr,seconds,headroomDb:0});
 assert.ok(result.overloaded);
 assert.ok(result.peak>1);
 assert.throws(()=>exportFusedStemsWav(huge,{sampleRate:sr,seconds,headroomDb:0}),/音割れ/);
});
test("rejects duplicate tracks, mismatched length, invalid pan and NaN PCM",()=>{
 const a=stems();
 assert.throws(()=>fuseIndependentStems([a[0],{...a[0]}],{sampleRate:sr,seconds}));
 assert.throws(()=>fuseIndependentStems([a[0],{...a[1],pcm:new Float32Array(20)}],{sampleRate:sr,seconds}));
 assert.throws(()=>fuseIndependentStems([a[0],{...a[1],pan:2}],{sampleRate:sr,seconds}));
 assert.throws(()=>fuseIndependentStems([a[0],{...a[1],gainDb:Infinity}],{sampleRate:sr,seconds}));
 assert.throws(()=>fuseIndependentStems([a[0],{...a[1],sampleRate:44100}],{sampleRate:sr,seconds}));
 const corrupt=tone(110);corrupt[20]=NaN;
 assert.throws(()=>fuseIndependentStems([a[0],{...a[1],pcm:corrupt}],{sampleRate:sr,seconds}));
 assert.throws(()=>fuseIndependentStems([a[0]],{sampleRate:sr,seconds}));
});

test("master trim is opt-in, improves a quiet preview and refuses clipping",()=>{
 const quiet=stems().map(x=>({...x,pcm:x.pcm.map(v=>v*.01)}));
 const a=fuseIndependentStems(quiet,{sampleRate:sr,seconds});
 const b=fuseIndependentStems(quiet,{sampleRate:sr,seconds,masterTrimDb:24});
 assert.equal(a.masterTrimDb,0);
 assert.equal(a.quietPreview,true);
 assert.ok(b.peak>a.peak*15&&b.peak<a.peak*16);
 assert.ok(b.peakDbfs>a.peakDbfs+23.99);
 assert.ok(b.peakDbfs<a.peakDbfs+24.01);
 assert.equal(b.overloaded,false);
 assert.throws(()=>fuseIndependentStems(quiet,{sampleRate:sr,seconds,masterTrimDb:25}));
 const loud=stems().map(x=>({...x,pcm:x.pcm.map(v=>v*5),gainDb:12,pan:0}));
 assert.throws(()=>exportFusedStemsWav(loud,{sampleRate:sr,seconds,headroomDb:0,masterTrimDb:24}),/音割れ/);
});
