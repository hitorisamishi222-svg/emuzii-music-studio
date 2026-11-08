// MUSIC-090: time-resolved timbre continuity. Comparing only one 100ms
// snapshot misses sudden differences at onset and after the note has bloomed.
// This is a source-preserving signal-level audit, NOT an audible quality verdict.
import {auditPianoTimbreSweep} from "./piano-timbre-sweep-audit.js";

export const DEFAULT_TIMBRE_WINDOWS=Object.freeze([
  Object.freeze({name:"attack",offsetSeconds:0.025}),
  Object.freeze({name:"body",offsetSeconds:0.130}),
  Object.freeze({name:"ending",offsetSeconds:0.320})
]);

export function auditPianoTimbreTimeWindows(pcm,sampleRate,notes,{
 windows=DEFAULT_TIMBRE_WINDOWS,warningDistance=0.20
}={}){
 if(!Array.isArray(windows)||windows.length<1||windows.length>5||
    !Number.isFinite(warningDistance)||warningDistance<=0||warningDistance>1)
   throw Error("時間別の音色監査設定が不正です");
 const names=new Set(),results=[];
 for(const window of windows){
   const name=window?.name,offsetSeconds=window?.offsetSeconds;
   if(typeof name!=="string"||!/^[-a-zA-Z0-9_]{1,24}$/.test(name)||
      names.has(name)||!Number.isFinite(offsetSeconds)||
      offsetSeconds<0.02||offsetSeconds>0.40)
     throw Error("解析する時間帯が不正です");
   names.add(name);
   const audit=auditPianoTimbreSweep(pcm,sampleRate,notes,{
     offsetSeconds,warningDistance
   });
   results.push({
     name,offsetSeconds,worst:audit.worstAdjacentChange,
     warningCount:audit.warningCount,warnings:audit.warnings,
     analyzedNotes:audit.analyzedNotes
   });
 }
 const worstOverall=results.reduce((best,x)=>
   x.worst.spectralDistance>best.worst.spectralDistance?x:best
 );
 return {
   windows:results,
   worstWindow:worstOverall.name,
   largestAdjacentDistance:worstOverall.worst.spectralDistance,
   warningCount:results.reduce((n,x)=>n+x.warningCount,0),
   kind:"multi-window-spectral-audit-not-listening",
   limits:"Three time slices and normalized FFT do not verify perceived timbre or absence of phase cancellation"
 };
}
