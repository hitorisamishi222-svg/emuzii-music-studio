// MUSIC-100: render explicit entrance alternatives as independently playable WAVs.
// No candidate is automatically selected, normalized or judged musically superior.
import {compareIndependentEntrances} from "./independent-entrance-options.js";
import {renderIndependentArrangement} from "./independent-arrangement-renderer.js";
export function renderIndependentEntrancePreviews(parts,instruments,{
 candidatePartIndex=1,candidateOffsetBars=[0,1],
 targetBpm=120,targetBeatsPerBar=4,meterMapping="preserve-beats",
 transposeSemitones=[],offsetBars=0,partOffsetBars=[],
 sampleRate=24000,seconds=10,headroomDb=6,masterTrimDb=0,silenceSeconds=2
}={}){
 if(!Array.isArray(candidateOffsetBars)||candidateOffsetBars.length>4)
  throw Error("音声プレビュー候補は最大4つです");
 const comparison=compareIndependentEntrances(parts,{candidatePartIndex,candidateOffsetBars,
  targetBpm,targetBeatsPerBar,meterMapping,transposeSemitones,offsetBars,partOffsetBars});
 const previews=comparison.candidates.map(candidate=>{
  const result=renderIndependentArrangement(parts,instruments,{targetBpm,targetBeatsPerBar,
   meterMapping,transposeSemitones,offsetBars,partOffsetBars:candidate.partOffsetBars,
   sampleRate,seconds,headroomDb,masterTrimDb,silenceSeconds,harmonyAudit:true});
  if(result.report.harmonyAudit.totalOverlaps!==candidate.totalOverlaps)
   throw Error("候補の音程分析と音声レポートが一致しません");
  return {candidateOffsetBars:candidate.candidateOffsetBars,
   partOffsetBars:candidate.partOffsetBars,
   wav:result.wav,report:result.report,
   comparison:{totalOverlaps:candidate.totalOverlaps,reviewCount:candidate.reviewCount,
    complete:candidate.complete}};
 });
 return {kind:"independent-entrance-audio-previews",previews,sourceUnchanged:true,
  caveat:"Listen to all alternatives. Delaying a part to avoid overlap is not inherently better music."};
}
