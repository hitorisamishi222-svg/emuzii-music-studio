// MUSIC-109: conservative vibrato/slide protection gate for OFFLINE analysis.
// Never infer the intended melody from detected notes. This module changes no PCM.
import {estimateMonophonicPitch} from "./offline-monophonic-pitch-estimator.js";
export function assessPitchMotionSafety(pcm,{
 sampleRate=24000,frameSamples=2048,stepSamples=512,
 minHz=80,maxHz=1000,minimumConfidence=.88,
 motionThresholdCents=18
}={}){
 if(!(pcm instanceof Float32Array)||pcm.length<frameSamples||
 !Number.isInteger(frameSamples)||frameSamples<512||frameSamples>8192||
 !Number.isInteger(stepSamples)||stepSamples<128||stepSamples>frameSamples||
 !Number.isFinite(motionThresholdCents)||motionThresholdCents<2||motionThresholdCents>100||
 !Number.isFinite(minimumConfidence)||minimumConfidence<0||minimumConfidence>1)
 throw Error("音程変動保護の設定が不正です");
 const frames=[];
 for(let start=0;start+frameSamples<=pcm.length;start+=stepSamples){
  const p=estimateMonophonicPitch(pcm.slice(start,start+frameSamples),{
   sampleRate,minHz,maxHz,minimumClarity:minimumConfidence});
  frames.push({start,hz:p.voiced?p.hz:null,confidence:p.confidence,voiced:p.voiced});
 }
 const voiced=frames.filter(f=>f.voiced);
 if(voiced.length<3||voiced.length<frames.length*.9)
  return {allowCorrection:false,reason:"uncertain-or-unvoiced",frames,changesCents:[],caveat:"No PCM altered."};
 const changesCents=[];
 for(let i=1;i<voiced.length;i++)
  changesCents.push(1200*Math.log2(voiced[i].hz/voiced[i-1].hz));
 const maxMotion=Math.max(0,...changesCents.map(Math.abs));
 const changing=maxMotion>motionThresholdCents;
 return {allowCorrection:!changing,reason:changing?"expressive-motion-protected":"stable-pitch-candidate",
  maxMotionCents:maxMotion,changesCents,frames,
  caveat:"Conservative research gate only. Stable pitch is not proof that a note should be corrected; a trusted reference is still required."};
}
