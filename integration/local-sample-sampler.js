// ASAHI sampler v0.1: local WAV PCM → deterministic pitched notes.
// A deliberately small subset of SFZ is supported. Not a general SFZ/SF2 player.
// No copyrighted sample data, downloads or network access in this module.
const finite=n=>typeof n==="number"&&Number.isFinite(n);
const whole=(n,min,max)=>Number.isInteger(n)&&n>=min&&n<=max;
const accepted=new Set(["sample","key","lokey","hikey","pitch_keycenter","lovel","hivel","volume","ampeg_attack","ampeg_release"]);

export function parseSingleRegionSfz(source) {
  if(typeof source!=="string"||source.length>20000)throw Error("SFZテキストは20KB以内にしてください");
  // Only one <region>; no imports, group inheritance, comments or expression tricks.
  const clean=source.replace(/\/\/[^\n]*/g," ").trim();
  const tags=clean.match(/<[^>]*>/g)||[];
  if(tags.length!==1||tags[0].toLowerCase()!=="<region>")throw Error("この試作はSFZの<region>1個のみ対応です");
  const payload=clean.replace(/<region>/i," ").trim();
  const matches=[...payload.matchAll(/([a-z_]+)=([^\s]+)/gi)];
  const remaining=payload.replace(/([a-z_]+)=([^\s]+)/gi," ").trim();
  if(remaining)throw Error("解釈できないSFZ記法: "+remaining.slice(0,60));
  const values={};
  for(const [,nameRaw,value] of matches){
    const key=nameRaw.toLowerCase();
    if(!accepted.has(key))throw Error("未対応のSFZオプコード: "+key);
    if(Object.hasOwn(values,key))throw Error("重複SFZオプコード: "+key);
    values[key]=value;
  }
  const sample=values.sample;
  if(typeof sample!=="string" || !/^[\w\-().]+\.(?:wav|ogg)$/i.test(sample)||sample===".."||sample.startsWith(".")) {
    throw Error("安全な単一WAV/OGGファイル名をsampleに指定してください（パス指定不可）");
  }
  const n=(key,def,min,max)=>{
    if(values[key]===undefined)return def;
    if(!/^-?\d+(?:\.\d+)?$/.test(values[key]))throw Error(key+": 数値が必要です");
    const v=Number(values[key]);
    if(!finite(v)||v<min||v>max)throw Error(key+": 許容範囲外");
    return v;
  };
  const key=values.key===undefined?null:n("key",null,0,127);
  const lo=n("lokey",key??0,0,127),hi=n("hikey",key??127,0,127);
  const center=n("pitch_keycenter",key??60,0,127);
  const lowVel=n("lovel",0,0,127),highVel=n("hivel",127,0,127);
  if(![lo,hi,center,lowVel,highVel].every(Number.isInteger)||lo>hi||lowVel>highVel)throw Error("キー範囲・ベロシティ範囲が不正です");
  return {
    sample,loKey:lo,hiKey:hi,rootMidi:center,loVel:lowVel,hiVel:highVel,
    volumeDb:n("volume",0,-60,0),
    attackSeconds:n("ampeg_attack",0.015,0,10),
    releaseSeconds:n("ampeg_release",0.09,0,10)
  };
}
export function renderSampledScore(notes,sample,{
  sampleRate=24000,seconds=30,rootMidi=60,loKey=0,hiKey=127,
  loVel=0,hiVel=127,volumeDb=0,attackSeconds=0.015,releaseSeconds=0.09
}={}) {
  if(!Array.isArray(notes)||notes.length>2048)throw Error("音符の配列が不正です");
  if(!sample||!Array.isArray(sample.channels)||sample.channels.length<1||sample.channels.length>2||
     !sample.channels.every(ch=>ch instanceof Float32Array&&ch.length===sample.channels[0].length)||
     sample.channels[0].length<2||!whole(sample.sampleRate,8000,192000))throw Error("WAVデコード済みサンプルが不正です");
  if(!whole(sampleRate,8000,48000)||!finite(seconds)||seconds<=0||seconds>60||!whole(rootMidi,0,127)||
    !whole(loKey,0,127)||!whole(hiKey,0,127)||loKey>hiKey||!whole(loVel,0,127)||!whole(hiVel,0,127)||loVel>hiVel||
    !finite(volumeDb)||volumeDb< -60||volumeDb>0||
    !finite(attackSeconds)||attackSeconds<0||attackSeconds>10||
    !finite(releaseSeconds)||releaseSeconds<0||releaseSeconds>10)throw Error("レンダリング設定が不正です");
  const pcm=new Float32Array(Math.ceil(seconds*sampleRate));
  const gainDb=Math.pow(10,volumeDb/20);
  let renderedNotes=0,skippedNotes=0;
  for(const note of notes){
    if(!note||![note.start,note.duration,note.midi,note.velocity].every(finite)||note.start<0||
       note.duration<=0||note.start+note.duration>seconds+0.00001||!whole(note.midi,0,127)||!whole(note.velocity,0,127))throw Error("音符情報が不正です");
    if(note.midi<loKey||note.midi>hiKey||note.velocity<loVel||note.velocity>hiVel){skippedNotes++;continue;}
    const attack=note.attackSeconds??attackSeconds;
    const release=note.releaseSeconds??releaseSeconds;
    const tail=note.tailSeconds??0;
    if(!finite(attack)||attack<0||attack>10||!finite(release)||release<0||release>10||
       !finite(tail)||tail<0||tail>2)throw Error("音符のアタック・リリース・余韻指定が不正です");
    const rate=Math.pow(2,(note.midi-rootMidi)/12)*sample.sampleRate/sampleRate;
    const start=Math.round(note.start*sampleRate),requestedFrames=Math.round(note.duration*sampleRate);
    const tailFrames=Math.round(tail*sampleRate);
    const targetFrames=requestedFrames+tailFrames;
    const playableFrames=Math.min(targetFrames,Math.max(0,Math.floor((sample.channels[0].length-1)/rate)));
    if(playableFrames<1){skippedNotes++;continue;}
    const attackFrames=Math.round(attack*sampleRate),releaseFrames=Math.round(release*sampleRate);
    // A sample shorter than the requested note+tail can end abruptly. Only
    // new opt-in tails receive this source-edge taper; legacy PCM is unchanged.
    const sourceCutEarly=tailFrames>0 && playableFrames<targetFrames;
    const edgeFrames=sourceCutEarly?Math.min(playableFrames,Math.max(2,Math.round(sampleRate*.01))):0;
    const velocityGain=(note.velocity/127)*gainDb;
    for(let i=0;i<playableFrames&&start+i<pcm.length;i++){
      const srcPos=i*rate,idx=Math.floor(srcPos),frac=srcPos-idx;
      let value=0;
      for(const ch of sample.channels)value+=ch[idx]*(1-frac)+ch[idx+1]*frac;
      value/=sample.channels.length;
      const a=attackFrames?Math.min(1,i/attackFrames):1;
      // With an opted-in tail, release starts at note-off. Without one, retain
      // the legacy inside-the-note fade. A short source cannot be magically looped.
      const r=tailFrames
        ?(i<requestedFrames?1:Math.max(0,1-(i-requestedFrames+1)/Math.max(1,tailFrames)))
        :(releaseFrames?Math.min(1,(playableFrames-1-i)/releaseFrames):1);
      const edge=edgeFrames?Math.min(1,(playableFrames-1-i)/Math.max(1,edgeFrames-1)):1;
      pcm[start+i]+=value*velocityGain*Math.max(0,Math.min(a,r,edge));
    }
    renderedNotes++;
  }
  let peak=0;
  for(let i=0;i<pcm.length;i++)peak=Math.max(peak,Math.abs(pcm[i]));
  // Never silently normalize or clip. An overload must be explicitly visible.
  return {pcm,sampleRate,seconds,renderedNotes,skippedNotes,peak,overloaded:peak>1,kind:"local-sample-render",sourceUnchanged:true};
}
