// MUSIC-103: connect offline pitch estimate to selective correction planning.
// This is NOT an audio pitch shifter. Never infer intended notes from nearest semitone.
import {estimateMonophonicPitch} from "./offline-monophonic-pitch-estimator.js";
import {planSelectivePitchCorrection} from "./realtime-pitch-correction-policy.js";

export function analyzeOfflineVocalFrame(pcm,{
 sampleRate=24000,referenceHz=null,mode="natural",minHz=80,maxHz=1000,
 minimumRms=0.008,minimumClarity=0.82
}={}){
 const detected=estimateMonophonicPitch(pcm,{sampleRate,minHz,maxHz,minimumRms,minimumClarity});
 if(referenceHz===null)return {detected,correction:null,applied:false,
  reason:"no-reference",caveat:"Without a trusted target melody, correction must remain disabled."};
 if(typeof referenceHz!=="number"||!Number.isFinite(referenceHz)||referenceHz<=0)
  throw Error("参照音程が不正です");
 if(!detected.voiced||detected.hz===null)return {detected,correction:null,applied:false,
  reason:detected.reason,caveat:"Unvoiced or uncertain input must not be pitch-corrected."};
 const correction=planSelectivePitchCorrection({
  measuredHz:detected.hz,referenceHz,confidence:detected.confidence,mode,voiced:detected.voiced
 });
 return {detected,correction,applied:false,reason:correction.reason,
  caveat:"Advisory-only correction amount. PCM is unchanged. Real-time DSP and voice preservation are not yet implemented."};
}
