// MUSIC-105: numerical pitch-shift audit. No subjective sound-quality claims.
import {estimateMonophonicPitch} from "./offline-monophonic-pitch-estimator.js";
import {pitchShiftOfflinePrototype} from "./offline-pitch-shift-prototype.js";
export function auditOfflinePitchShift(pcm,{
 sampleRate=24000,correctionCents=35,grainMs=40,
 minHz=80,maxHz=1000,windowSamples=4096
}={}){
 if(!Number.isInteger(windowSamples)||windowSamples<512||windowSamples>32768||
  !(pcm instanceof Float32Array)||pcm.length<windowSamples)
  throw Error("診断窓が不正です");
 const processed=pitchShiftOfflinePrototype(pcm,{sampleRate,correctionCents,grainMs,wet:1});
 const start=Math.floor((pcm.length-windowSamples)/2);
 const before=estimateMonophonicPitch(pcm.slice(start,start+windowSamples),{sampleRate,minHz,maxHz});
 const after=estimateMonophonicPitch(processed.pcm.slice(start,start+windowSamples),{sampleRate,minHz,maxHz});
 const actualCents=before.voiced&&after.voiced?1200*Math.log2(after.hz/before.hz):null;
 const errorCents=actualCents===null?null:actualCents-correctionCents;
 return {requestedCents:correctionCents,actualCents,errorCents,
  measurable:errorCents!==null,within20Cents:errorCents!==null&&Math.abs(errorCents)<=20,
  before,after,sourceUnchanged:true,
  caveat:"An objective frequency diagnostic only. A pass does not prove natural voice, vibrato or acceptable latency."};
}
