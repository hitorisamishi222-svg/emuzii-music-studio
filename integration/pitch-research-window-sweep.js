// MUSIC-107: offline parameter sweep, diagnostic only, not a pass certificate.
import {pitchShiftLongWindowResearch} from "./long-window-pitch-research.js";
import {estimateMonophonicPitch} from "./offline-monophonic-pitch-estimator.js";
export function compareResearchWindowLengths(pcm,{
 sampleRate=24000,correctionCents=35,windowLengthsMs=[250,350,500,750],
 measurementSamples=4096,minHz=80,maxHz=1000
}={}){
 if(!(pcm instanceof Float32Array)||pcm.length<measurementSamples||
  !Array.isArray(windowLengthsMs)||windowLengthsMs.length<1||windowLengthsMs.length>8||
  !Number.isInteger(measurementSamples)||measurementSamples<512||measurementSamples>32768)
  throw Error("比較試験の設定が不正です");
 const center=Math.floor((pcm.length-measurementSamples)/2);
 const before=estimateMonophonicPitch(pcm.slice(center,center+measurementSamples),{sampleRate,minHz,maxHz});
 return {referenceVoiced:before.voiced,results:windowLengthsMs.map(windowMs=>{
  const output=pitchShiftLongWindowResearch(pcm,{sampleRate,correctionCents,windowMs});
  const after=estimateMonophonicPitch(output.pcm.slice(center,center+measurementSamples),{sampleRate,minHz,maxHz});
  const actualCents=before.voiced&&after.voiced?1200*Math.log2(after.hz/before.hz):null;
  const errorCents=actualCents===null?null:actualCents-correctionCents;
  return {windowMs,requestedCents:correctionCents,actualCents,errorCents,
   within20Cents:errorCents!==null&&Math.abs(errorCents)<=20,
   voiced:after.voiced,measuredConfidence:after.confidence};
 }),caveat:"Offline sustained-tone comparison only. Window length is not measured end-to-end latency; voice quality unverified."};
}
