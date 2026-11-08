// Deterministic performance shaping for the offline sample renderer.
// Does not synthesize an instrument, add recordings or change the original score.
export const PERFORMANCE_STYLES=Object.freeze(["neutral","staccato","legato","gentle"]);

export function prepareExpressiveScore(notes,{style="neutral",seconds=30}={}){
  if(!PERFORMANCE_STYLES.includes(style))throw Error("未対応の演奏表現です");
  if(!Number.isFinite(seconds)||seconds<=0||seconds>60||!Array.isArray(notes)||notes.length>2048)throw Error("楽譜または長さが不正です");
  return notes.map((note)=>{
    if(!note||![note.start,note.duration,note.midi,note.velocity].every(Number.isFinite)||
       note.start<0||note.duration<=0||note.start+note.duration>seconds+0.00001||
       !Number.isInteger(note.midi)||note.midi<0||note.midi>127||
       !Number.isInteger(note.velocity)||note.velocity<0||note.velocity>127)throw Error("音符情報が不正です");
    // To preserve the input, all edits return new note objects.
    const n={...note};
    if(style==="staccato"){
      n.duration=Math.min(note.duration*0.52,seconds-note.start);
      n.attackSeconds=0.007;
      n.tailSeconds=0.015;
    }else if(style==="legato"){
      n.duration=Math.min(note.duration*1.08,seconds-note.start);
      n.attackSeconds=0.017;
      n.tailSeconds=0.16;
    }else if(style==="gentle"){
      n.velocity=Math.round(note.velocity*0.76);
      n.attackSeconds=0.07;
      n.tailSeconds=0.22;
    }
    return n;
  });
}
