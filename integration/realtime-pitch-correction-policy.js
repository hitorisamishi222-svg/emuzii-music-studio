// MUSIC-101: pure planning gate for natural, selective pitch correction.
// This module never processes audio and never assumes a nearest note is a mistake.
export const PITCH_MODES=Object.freeze({
 natural:Object.freeze({thresholdCents:65,maxCorrectionCents:35,minConfidence:0.90}),
 standard:Object.freeze({thresholdCents:50,maxCorrectionCents:60,minConfidence:0.88}),
 powerful:Object.freeze({thresholdCents:35,maxCorrectionCents:100,minConfidence:0.85})
});
export function planSelectivePitchCorrection({
 measuredHz,referenceHz,confidence,mode="natural",voiced=true,
 maxCorrectionCents,thresholdCents
}={}){
 const profile=PITCH_MODES[mode];
 if(!profile)throw Error("補正モードが不正です");
 for(const value of [measuredHz,referenceHz,confidence])
  if(typeof value!=="number"||!Number.isFinite(value))throw Error("音程測定値が不正です");
 if(measuredHz<=0||referenceHz<=0||confidence<0||confidence>1||typeof voiced!=="boolean")
  throw Error("音程測定範囲が不正です");
 const threshold=thresholdCents??profile.thresholdCents;
 const limit=maxCorrectionCents??profile.maxCorrectionCents;
 if(!Number.isFinite(threshold)||threshold<10||threshold>200||
    !Number.isFinite(limit)||limit<0||limit>200)
  throw Error("補正設定が不正です");
 const deviationCents=1200*Math.log2(measuredHz/referenceHz);
 const trusted=voiced&&confidence>=profile.minConfidence;
 const active=trusted&&Math.abs(deviationCents)>threshold;
 const correctionCents=active?-Math.sign(deviationCents)*Math.min(Math.abs(deviationCents)-threshold,limit):0;
 return {mode,deviationCents,correctionCents,active,confidence,
  reason:!voiced?"unvoiced":!trusted?"low-confidence":!active?"within-natural-range":"candidate",
  note:"This is a control suggestion only; reference pitch must be supplied and independently validated. No real-time audio processing or latency guarantee."};
}
