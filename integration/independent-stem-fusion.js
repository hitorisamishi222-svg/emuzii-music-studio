// MUSIC-092: independent instrumental stems mixed into one stereo arrangement.
// Local PCM only; no source mutation, mastering, resampling or external API.
// An overload is reported and export is refused rather than silently clipped.
import {createTailSafeWav} from "./audio-tail-finisher.js";

const finite=x=>typeof x==="number"&&Number.isFinite(x);
const MAX_TRACKS=16;
const isValidName=x=>typeof x==="string"&&x.length>=1&&x.length<=64&&
 !/[\u0000-\u001f]/.test(x);

export function fuseIndependentStems(stems,{sampleRate=24000,seconds=30,headroomDb=6}={}){
 if(!Array.isArray(stems)||stems.length<2||stems.length>MAX_TRACKS||
    !Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>48000||
    !finite(seconds)||seconds<=0||seconds>60||
    !finite(headroomDb)||headroomDb<0||headroomDb>24)
   throw Error("独立ステムの合成設定が不正です");
 const frames=Math.ceil(seconds*sampleRate);
 const left=new Float32Array(frames),right=new Float32Array(frames);
 const names=new Set(),report=[];
 const masterGain=Math.pow(10,-headroomDb/20);
 // Equal-power panning with center normalized to unity for a mono reference:
 // center is -3dB per side, not a hard left/right gain boost.
 for(const stem of stems){
  if(!stem||!isValidName(stem.name)||names.has(stem.name)||
     !(stem.pcm instanceof Float32Array)||stem.pcm.length!==frames||
     (stem.sampleRate!==undefined&&stem.sampleRate!==sampleRate)||
     !finite(stem.gainDb)||stem.gainDb< -60||stem.gainDb>12||
     !finite(stem.pan)||stem.pan< -1||stem.pan>1||
     !stem.pcm.every(finite))
    throw Error("ステム形式・名前・ゲイン・定位・長さが不正です");
  names.add(stem.name);
  const amp=Math.pow(10,stem.gainDb/20);
  const angle=(stem.pan+1)*Math.PI/4;
  const lg=Math.cos(angle)*amp*masterGain,rg=Math.sin(angle)*amp*masterGain;
  let peak=0,energy=0;
  for(let i=0;i<frames;i++){
   const v=stem.pcm[i];
   left[i]+=v*lg;right[i]+=v*rg;
   peak=Math.max(peak,Math.abs(v));energy+=v*v;
  }
  report.push({name:stem.name,gainDb:stem.gainDb,pan:stem.pan,
   sourcePeak:peak,sourceRms:Math.sqrt(energy/frames)});
 }
 let peak=0,clippedFrames=0;
 for(let i=0;i<frames;i++){
  const p=Math.max(Math.abs(left[i]),Math.abs(right[i]));
  peak=Math.max(peak,p);
  if(p>1)clippedFrames++;
 }
 return {channels:[left,right],sampleRate,seconds,stemCount:stems.length,
  stemReport:report,peak,clippedFrames,overloaded:clippedFrames>0,
  headroomDb,kind:"non-destructive-independent-stem-stereo-mix",
  sourceUnchanged:true};
}

export function exportFusedStemsWav(stems,options={}){
 const result=fuseIndependentStems(stems,options);
 if(result.overloaded)throw Error("ステム合成で音割れの危険があるため書き出しを拒否しました");
 const {wav,report}=createTailSafeWav(result.channels,result.sampleRate,{
  silenceSeconds:options.silenceSeconds??2
 });
 return {wav,report:{...result,channels:2,pcmIncluded:false,
  ending:report.endingAssessment,silenceSeconds:report.silenceSeconds,
  totalFrames:report.totalFrames}};
}
