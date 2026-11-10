// MUSIC-098: advisory-only overlap/interval analysis for already aligned note events.
// Does not claim to identify musical dissonance or automatically change pitches.
const valid=x=>typeof x==="number"&&Number.isFinite(x);
const names=["unison","minor-second","major-second","minor-third","major-third","perfect-fourth","tritone","perfect-fifth","minor-sixth","major-sixth","minor-seventh","major-seventh"];
export function inspectSimultaneousIntervals(aligned,{maxFindings=512}={}){
 if(!aligned||!Array.isArray(aligned.parts)||aligned.parts.length<2||aligned.parts.length>16||
    !Number.isInteger(maxFindings)||maxFindings<1||maxFindings>4096)
  throw Error("和声分析の入力が不正です");
 const events=[];
 for(let i=0;i<aligned.parts.length;i++){
  const part=aligned.parts[i];
  if(!part||typeof part.name!=="string"||!Array.isArray(part.notes)||part.notes.length>2048)
   throw Error("楽曲パートが不正です");
  for(let j=0;j<part.notes.length;j++){
   const n=part.notes[j];
   if(!n||!valid(n.start)||n.start<0||!valid(n.duration)||n.duration<=0||
      !Number.isInteger(n.midi)||n.midi<0||n.midi>127)
    throw Error("音符イベントが不正です");
   events.push({part:i,index:j,start:n.start,end:n.start+n.duration,midi:n.midi});
  }
 }
 events.sort((a,b)=>a.start-b.start||a.part-b.part||a.index-b.index);
 const active=[],findings=[];let overlaps=0,truncated=false;
 for(const event of events){
  for(let k=active.length-1;k>=0;k--)if(active[k].end<=event.start)active.splice(k,1);
  for(const prev of active){
   if(prev.part===event.part)continue;
   const seconds=Math.min(prev.end,event.end)-Math.max(prev.start,event.start);
   if(seconds<=0)continue;
   overlaps++;
   if(findings.length>=maxFindings){truncated=true;continue}
   const semitones=Math.abs(prev.midi-event.midi),pitchClass=semitones%12;
   findings.push({partA:aligned.parts[prev.part].name,partB:aligned.parts[event.part].name,
    noteA:prev.index,noteB:event.index,
    start:Math.max(prev.start,event.start),seconds,semitones,pitchClass,
    interval:names[pitchClass],
    attention:[1,2,6,10,11].includes(pitchClass)?"review":"neutral",
    caution:"Interval label only. Context, voicing, rhythm and timbre determine musical effect."});
  }
  active.push(event);
 }
 return {kind:"advisory-cross-part-interval-audit",totalOverlaps:overlaps,
  findings,truncated,sourceUnchanged:true,
  caveat:"Not a chord recognizer, key detector, dissonance judge or automatic harmonizer."};
}
