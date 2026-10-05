(() => {
  "use strict";
  const $=id=>document.getElementById(id);
  let items=[];
  try{const x=JSON.parse(localStorage.getItem("emuzii_accumulation_v1")||"[]");if(Array.isArray(x))items=x}catch(_){ }
  const state={accum101:{items},lyric103:{file:null,url:null,prepared:false},accum102File:null,accum102FileName:"",accum102FileBytes:0,accum102Buffer:null};
  function setStatus(t){const e=$("status");if(e)e.textContent=t;}
  async function decode(file){
    try{
      const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return null;
      const ac=new AC();if(ac.state==="suspended")await ac.resume();
      const ab=await file.arrayBuffer();
      const b=await new Promise((res,rej)=>{const p=ac.decodeAudioData(ab.slice(0),res,rej);if(p&&typeof p.then==="function")p.then(res).catch(rej)});
      try{await ac.close()}catch(_){ }
      return b;
    }catch(_){return null}
  }
  async function accumAudio102Change(e){
    const file=e?.target?.files?.[0];if(!file)return;
    state.accum102File=file;state.accum102FileName=file.name||"audio";state.accum102FileBytes=file.size||0;
    const t=$("accumTitle101");if(t&&!t.value)t.value=(file.name||"曲").replace(/\.[^.]+$/,'');
    const f=$("accumFile102");if(f)f.textContent=`読込中: ${file.name||"音源"}`;
    const b=await decode(file);state.accum102Buffer=b;
    if(f)f.textContent=`選択中: ${file.name||"音源"}${b?` ｜ ${b.duration.toFixed(1)}秒`:""}`;
    setStatus(`蓄積用音源を読み込みました：${file.name||"音源"}`);
  }
  function lyricAudio103Change(e){
    const file=e?.target?.files?.[0];if(!file)return;
    if(state.lyric103.url)URL.revokeObjectURL(state.lyric103.url);
    state.lyric103.file=file;state.lyric103.url=URL.createObjectURL(file);
    const n=$("lyricAudioName103");if(n)n.textContent=`選択中: ${file.name||"音源"}`;
    const p=$("lyricPlayer103");if(p)p.src=state.lyric103.url;
    setStatus(`歌詞照合用音源を読み込みました：${file.name||"音源"}`);
  }
  window.emuziiCore={state,setStatus,accumAudio102Change,lyricAudio103Change};
})();
