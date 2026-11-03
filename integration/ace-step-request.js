/* ASAHI ACE-Step 1.5 offline request and response contract.
 * No fetch, storage, audio modification, or automatic GPU submission.
 * Source: https://github.com/ace-step/ACE-Step-1.5/blob/main/docs/en/API.md
 */
(function(root){
  'use strict';
  function parseDuration(value){
    const raw=String(value??'').trim(),m=/^(\d{1,2}):([0-5]\d)$/.exec(raw);
    const seconds=m?Number(m[1])*60+Number(m[2]):/^\d{1,3}$/.test(raw)?Number(raw):NaN;
    if(!Number.isInteger(seconds)||seconds<10||seconds>600)throw Error('曲尺は10〜600秒（例 4:30）で指定してください');
    return seconds;
  }
  function buildDraft({prompt,lyrics,length,bpm,key,vocalLanguage='ja'}={}){
    const caption=String(prompt||'').trim();
    if(!caption)throw Error('曲設計を入力してください');
    if(caption.length>4000)throw Error('曲設計が長すぎます');
    const tempo=Number(bpm);
    if(!Number.isInteger(tempo)||tempo<30||tempo>300)throw Error('BPMは30〜300の整数で指定してください');
    const keyScale=String(key||'').trim();
    if(!keyScale)throw Error('KEYを入力してください');
    return Object.freeze({
      prompt:caption,lyrics:String(lyrics||'').trim()||'[inst]',
      bpm:tempo,key_scale:keyScale,audio_duration:parseDuration(length),
      vocal_language:vocalLanguage,audio_format:'wav',task_type:'text2music'
    });
  }
  function taskId(response){
    if(Number(response?.code)!==200||typeof response?.data?.task_id!=='string'||!response.data.task_id)throw Error('生成受付結果の形式が違います');
    return response.data.task_id;
  }
  function result(response,expectedId){
    if(Number(response?.code)!==200||!Array.isArray(response?.data))throw Error('生成状況の形式が違います');
    const entry=response.data.find(x=>x?.task_id===expectedId);
    if(!entry||![0,1,2].includes(Number(entry.status)))throw Error('対象タスクの状態が不明です');
    const status=Number(entry.status),files=[];
    if(status===1){
      let items;
      try{items=typeof entry.result==='string'?JSON.parse(entry.result):entry.result}catch{throw Error('音声情報の解析に失敗しました')}
      if(!Array.isArray(items))throw Error('音声情報が配列ではありません');
      for(const item of items){
        const file=String(item?.file||'');
        if(!file.startsWith('/v1/audio?'))continue;
        const u=new URL(file,'https://ace.invalid');
        if(u.pathname!=='/v1/audio')continue;
        const sourcePath=u.searchParams.get('path');
        if(!sourcePath)continue;
        files.push({sourcePath,proxyUrl:'/api/ace/v1/audio?audio_path='+encodeURIComponent(sourcePath)});
      }
    }
    return {status,finished:status!==0,files};
  }
  root.ASAHIAceStep=Object.freeze({buildDraft,parseDuration,taskId,result,version:'1.5-offline-contract'});
})(typeof globalThis==='object'?globalThis:this);
