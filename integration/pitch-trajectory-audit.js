// MUSIC-108: research-quality gate for existing pitch-shift experiments.
// This measures synthetic pitch trajectories, not voice quality or real latency.
import {pitchShiftLongWindowResearch} from "./long-window-pitch-research.js";
import {estimateMonophonicPitch} from "./offline-monophonic-pitch-estimator.js";
export function auditPitchTrajectory(pcm,{
 sampleRate=24000,correctionCents=35,windowMs=350,
 frameSamples=4096,stepSamples=2048,minHz=80,maxHz=1000,
 toleranceCents=20
}={}){
 if(!(pcm instanceof Float32Array)||!Number.isInteger(frameSamples)||
 frameSamples<1024||frameSamples>32768||pcm.length<frameSamples||
 !Number.isInteger(stepSamples)||stepSamples<256||stepSamples>frameSamples||
 !Number.isFinite(toleranceCents)||toleranceCents<=0||toleranceCents>100)
 throw Error("軌跡診断の設定が不正です");
 const shifted=pitchShiftLongWindowResearch(pcm,{sampleRate,correctionCents,windowMs});
 const frames=[];
 for(let start=0;start+frameSamples<=pcm.length;start+=stepSamples){
  const original=estimateMonophonicPitch(pcm.slice(start,start+frameSamples),{sampleRate,minHz,maxHz});
  const modified=estimateMonophonicPitch(shifted.pcm.slice(start,start+frameSamples),{sampleRate,minHz,maxHz});
  const delta=original.voiced&&modified.voiced?1200*Math.log2(modified.hz/original.hz):null;
  frames.push({start,originalHz:original.hz,modifiedHz:modified.hz,
   actualCents:delta,errorCents:delta===null?null:delta-correctionCents,
   withinTolerance:delta!==null&&Math.abs(delta-correctionCents)<=toleranceCents});
 }
 const valid=frames.filter(x=>x.errorCents!==null);
 const passed=valid.filter(x=>x.withinTolerance);
 return {requestedCents:correctionCents,windowMs,frameCount:frames.length,
  measurableCount:valid.length,passedCount:passed.length,
  passRate:frames.length?passed.length/frames.length:0,
  allFramesPass:frames.length>0&&passed.length===frames.length,
  frames,experimental:true,
  caveat:"Trajectory frequency check only. Transient, vibrato and voice naturalness require listening tests."};
}
