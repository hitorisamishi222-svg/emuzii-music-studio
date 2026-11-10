// MUSIC-093: Non-destructive musical beat-grid alignment for *note events*.
// This is NOT audio time-stretching, automatic key matching or mastering.
const finite=x=>typeof x==="number"&&Number.isFinite(x);
const integer=(x,min,max)=>Number.isInteger(x)&&x>=min&&x<=max;
const MAX_NOTES=2048;
function validatePart(part){
 if(!part||typeof part.name!=="string"||!part.name.trim()||part.name.length>64||
    !finite(part.bpm)||part.bpm<30||part.bpm>300||
    !integer(part.beatsPerBar,1,12)||
    !Array.isArray(part.notes)||part.notes.length>MAX_NOTES)
   throw Error("独立楽曲の拍子・テンポ・音符が不正です");
 for(const n of part.notes){
  if(!n||!finite(n.beat)||n.beat<0||n.beat>10000||
     !finite(n.durationBeats)||n.durationBeats<=0||n.durationBeats>128||
     !integer(n.midi,0,127)||!integer(n.velocity,0,127))
   throw Error("音符の拍位置・長さ・音高・強弱が不正です");
 }
}
export function alignIndependentNoteParts(parts,{
 targetBpm=120,targetBeatsPerBar=4,offsetBars=0,transposeSemitones=[],
 meterMapping="stretch-bars",partOffsetBars=[]
}={}){
 if(!Array.isArray(parts)||parts.length<2||parts.length>16||
    !finite(targetBpm)||targetBpm<30||targetBpm>300||
    !integer(targetBeatsPerBar,1,12)||!integer(offsetBars,0,256)||
    !["stretch-bars","preserve-beats"].includes(meterMapping)||
    !Array.isArray(partOffsetBars)||partOffsetBars.length>parts.length||
    !partOffsetBars.every(x=>integer(x,0,256))||
    !Array.isArray(transposeSemitones)||transposeSemitones.length>parts.length||
    !transposeSemitones.every(x=>integer(x,-24,24)))
   throw Error("融合先のテンポ・拍子・移調が不正です");
 const names=new Set(),out=[],report=[];
 for(let i=0;i<parts.length;i++){
  const part=parts[i];validatePart(part);
  if(names.has(part.name))throw Error("同名の楽曲パートが重複しています");
  names.add(part.name);
  // Map source bar fraction to destination bar fraction. E.g. 3/4 -> 4/4
  // stretches the note-event grid; this does not preserve absolute durations.
  const barRatio=meterMapping==="stretch-bars"?targetBeatsPerBar/part.beatsPerBar:1;
  const semitones=transposeSemitones[i]??0;
  const effectiveOffsetBars=offsetBars+(partOffsetBars[i]??0);
  const offsetBeats=effectiveOffsetBars*targetBeatsPerBar;
  const notes=part.notes.map(n=>{
   const midi=n.midi+semitones;
   if(!integer(midi,0,127))throw Error("移調後の音域がMIDI範囲外です");
   const beat=offsetBeats+n.beat*barRatio;
   const durationBeats=n.durationBeats*barRatio;
   const start=beat*60/targetBpm;
   const duration=durationBeats*60/targetBpm;
   if(!finite(start)||!finite(duration)||start+duration>3600)
    throw Error("融合後の音符が長すぎます");
   return {start,duration,midi,velocity:n.velocity};
  });
  out.push({name:part.name,notes});
  report.push({name:part.name,sourceBpm:part.bpm,sourceBeatsPerBar:part.beatsPerBar,
   targetBpm,targetBeatsPerBar,barRatio,transposeSemitones:semitones,
   noteCount:notes.length,offsetBars:effectiveOffsetBars,meterMapping,
   caution:"Note grid transformed only; harmony, accents and meter compatibility are not certified."});
 }
 return {parts:out,report,targetBpm,targetBeatsPerBar,
  kind:"non-destructive-note-grid-arrangement",
  sourceUnchanged:true};
}
