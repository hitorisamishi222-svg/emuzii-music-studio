// MUSIC-099: Compare explicit entrance options without changing either composition.
// Counts are heuristic review prompts, NOT a musical quality score.
import {alignIndependentNoteParts} from "./independent-note-grid-aligner.js";
import {inspectSimultaneousIntervals} from "./independent-harmony-audit.js";

export function compareIndependentEntrances(parts,{
 targetBpm=120,targetBeatsPerBar=4,meterMapping="preserve-beats",
 transposeSemitones=[],offsetBars=0,partOffsetBars=[],
 candidatePartIndex=1,candidateOffsetBars=[0,1,2,4]
}={}){
 if(!Array.isArray(parts)||parts.length<2||parts.length>16||
    !Number.isInteger(candidatePartIndex)||candidatePartIndex<0||candidatePartIndex>=parts.length||
    !Array.isArray(candidateOffsetBars)||candidateOffsetBars.length<1||candidateOffsetBars.length>16||
    !candidateOffsetBars.every(x=>Number.isInteger(x)&&x>=0&&x<=256)||
    new Set(candidateOffsetBars).size!==candidateOffsetBars.length)
  throw Error("曲の入り位置比較の指定が不正です");
 const candidates=candidateOffsetBars.map(candidate=>{
  const offsets=Array.from({length:parts.length},(_,i)=>partOffsetBars[i]??0);
  offsets[candidatePartIndex]=candidate;
  const aligned=alignIndependentNoteParts(parts,{targetBpm,targetBeatsPerBar,meterMapping,
   transposeSemitones,offsetBars,partOffsetBars:offsets});
  const audit=inspectSimultaneousIntervals(aligned,{maxFindings:4096});
  // A truncated report cannot be used for interval-class comparisons.
  const reviewCount=audit.findings.filter(x=>x.attention==="review").length;
  return {partOffsetBars:offsets,candidateOffsetBars:candidate,
   totalOverlaps:audit.totalOverlaps,reviewCount,
   truncated:audit.truncated,complete:!audit.truncated,
   warning:audit.truncated?"Review counts incomplete; do not rank":null};
 });
 return {kind:"non-destructive-entrance-options",candidatePartIndex,candidates,
  sourceUnchanged:true,
  caveat:"Less overlap or fewer flagged intervals is not necessarily better music. Silent avoidance is not an improvement; compare by ear."};
}
