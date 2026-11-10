// MUSIC-094: render separately composed note events with local recorded samples,
// then mix their independent PCM stems. No automatic musical compatibility claims.
import {alignIndependentNoteParts} from "./independent-note-grid-aligner.js";
import {renderSampledScore} from "./local-sample-sampler.js";
import {exportFusedStemsWav} from "./independent-stem-fusion.js";

const finite=x=>typeof x==="number"&&Number.isFinite(x);
export function renderIndependentArrangement(parts,instruments,{
 targetBpm=120,targetBeatsPerBar=4,transposeSemitones=[],offsetBars=0,
 sampleRate=24000,seconds=30,headroomDb=6,masterTrimDb=0,silenceSeconds=2
}={}){
 if(!Array.isArray(parts)||!Array.isArray(instruments)||instruments.length!==parts.length||
    !Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>48000||
    !finite(seconds)||seconds<=0||seconds>60)
  throw Error("独立楽曲と楽器の対応が不正です");
 const aligned=alignIndependentNoteParts(parts,{
  targetBpm,targetBeatsPerBar,transposeSemitones,offsetBars
 });
 const stems=[],instrumentReports=[];
 for(let i=0;i<aligned.parts.length;i++){
  const instrument=instruments[i],part=aligned.parts[i];
  if(!instrument||!instrument.sample||!instrument.region||
     !finite(instrument.gainDb)||instrument.gainDb< -60||instrument.gainDb>12||
     !finite(instrument.pan)||instrument.pan< -1||instrument.pan>1)
   throw Error("各曲の楽器・音量・定位が不正です");
  const last=part.notes.reduce((m,n)=>Math.max(m,n.start+n.duration),0);
  if(last>seconds+0.00001)throw Error("音符が指定演奏時間を超えています");
  // The underlying sampler can intentionally truncate a note when its source
  // recording ends. In a composed arrangement that would silently remove music.
  const sample=instrument.sample,region=instrument.region;
  if(!Array.isArray(sample.channels)||!sample.channels[0]||
     !Number.isInteger(sample.sampleRate)||sample.sampleRate<8000)
   throw Error("録音サンプル形式が不正です");
  for(const note of part.notes){
   const rate=Math.pow(2,(note.midi-(region.rootMidi??60))/12)*sample.sampleRate/sampleRate;
   const needed=Math.round(note.duration*sampleRate)*rate+1;
   if(sample.channels[0].length<needed)
    throw Error("録音サンプルが短く音符を最後まで演奏できません");
  }
  const render=renderSampledScore(part.notes,instrument.sample,{
   ...instrument.region,sampleRate,seconds
  });
  if(render.skippedNotes>0||render.renderedNotes!==part.notes.length)
   throw Error("音域外または短い録音のため演奏できない音符があります");
  if(render.overloaded)throw Error("楽器単体の音割れが検出されました");
  stems.push({name:part.name,pcm:render.pcm,sampleRate,
   gainDb:instrument.gainDb,pan:instrument.pan});
  instrumentReports.push({name:part.name,renderedNotes:render.renderedNotes,
   sourcePeak:render.peak,sampleFile:instrument.region.sample??null});
 }
 const mixed=exportFusedStemsWav(stems,{sampleRate,seconds,headroomDb,masterTrimDb,silenceSeconds});
 return {wav:mixed.wav,report:{
  ...mixed.report,sourceUnchanged:true,
  arrangement:aligned.report,instruments:instrumentReports,
  kind:"local-sample-two-composition-arrangement",
  caution:"Beat grid is aligned, but harmony, key, acoustic timbre and musical naturalness require listening."
 }};
}
