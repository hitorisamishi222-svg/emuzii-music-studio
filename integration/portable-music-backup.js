/* ASAHI MUSIC portable backup v1 — entirely offline.
 * Length-delimited manifest (CRC32) followed by raw audio Blobs (CRC32 each).
 * Does not edit songs, access network, or save to IndexedDB.
 */
(function(root){
  'use strict';
  const schema='asahi-music-portable-v1';
  const encoder=new TextEncoder(), decoder=new TextDecoder('utf-8',{fatal:true});
  const magic=encoder.encode('ASAHI-MUSIC-BACKUP-V1\n');
  const maxManifest=16*1024*1024, maxAudio=250, maxTrack=250, chunk=1024*1024;
  const table=Array.from({length:256},(_,i)=>{
    let n=i;
    for(let j=0;j<8;j++)n=(n&1)?(0xedb88320^(n>>>1)):(n>>>1);
    return n>>>0;
  });
  const fail=reason=>{throw Error('作品バックアップが不正です: '+reason)};
  function checksumBytes(bytes,state=0xffffffff){
    let n=state;
    for(const v of bytes)n=table[(n^v)&255]^(n>>>8);
    return n>>>0;
  }
  function hex(n){return (n>>>0).toString(16).padStart(8,'0')}
  async function crc32(blob){
    if(!(blob instanceof Blob))fail('音声データの形式');
    let n=0xffffffff;
    for(let offset=0;offset<blob.size;offset+=chunk){
      n=checksumBytes(new Uint8Array(await blob.slice(offset,offset+chunk).arrayBuffer()),n);
    }
    return hex(n^0xffffffff);
  }
  const manifestCrc=bytes=>hex(checksumBytes(bytes)^0xffffffff);
  function validateProject(project){
    if(!project||typeof project!=='object'||Array.isArray(project))fail('作品情報がありません');
    if(!Array.isArray(project.tracks)||project.tracks.length>maxTrack)fail('トラック一覧');
    const refs=new Set();
    for(const t of project.tracks){
      if(!t||typeof t!=='object'||typeof t.id!=='string'||!t.id)fail('トラックID');
      if(t.blobId!=null){
        if(typeof t.blobId!=='string'||!t.blobId||t.blobId.length>256||refs.has(t.blobId))fail('音源参照');
        refs.add(t.blobId);
      }
    }
    return refs;
  }
  async function create({project,audio=[]}={}){
    const refs=validateProject(project);
    if(!Array.isArray(audio)||audio.length>maxAudio||refs.size!==audio.length)fail('音声の数が一致しません');
    const byId=new Map(),parts=[];
    for(const row of audio){
      if(!row||typeof row.id!=='string'||!refs.has(row.id)||byId.has(row.id))fail('音声IDの重複・欠損');
      if(!(row.blob instanceof Blob)||row.blob.size<=0||!Number.isSafeInteger(row.blob.size))fail('音声Blob');
      const entry={id:row.id,size:row.blob.size,type:row.blob.type||'application/octet-stream',crc32:await crc32(row.blob)};
      byId.set(row.id,entry);
      parts.push(row.blob);
    }
    const manifest={schema,project,audio:audio.map(x=>byId.get(x.id))};
    const bytes=encoder.encode(JSON.stringify(manifest));
    if(bytes.length<2||bytes.length>maxManifest)fail('作品管理情報のサイズ');
    const header=new Uint8Array(8),view=new DataView(header.buffer);
    view.setUint32(0,bytes.length,true);
    view.setUint32(4,Number.parseInt(manifestCrc(bytes),16),true);
    return new Blob([magic,header,bytes,...parts],{type:'application/octet-stream'});
  }
  async function read(file){
    if(!(file instanceof Blob)||file.size<magic.length+10)fail('ファイルが短すぎます');
    const prefix=new Uint8Array(await file.slice(0,magic.length+8).arrayBuffer());
    if(magic.some((v,i)=>prefix[i]!==v))fail('未対応のファイル形式');
    const head=new DataView(prefix.buffer,prefix.byteOffset+magic.length,8);
    const length=head.getUint32(0,true),expected=head.getUint32(4,true);
    if(length<2||length>maxManifest||file.size<magic.length+8+length)fail('管理情報の長さ');
    const bytes=new Uint8Array(await file.slice(magic.length+8,magic.length+8+length).arrayBuffer());
    if((checksumBytes(bytes)^0xffffffff)>>>0!==expected)fail('管理情報のCRC');
    let m;
    try{m=JSON.parse(decoder.decode(bytes))}catch{fail('管理情報のJSON')}
    if(m?.schema!==schema)fail('バージョン');
    const refs=validateProject(m.project);
    if(!Array.isArray(m.audio)||m.audio.length>maxAudio||m.audio.length!==refs.size)fail('音声管理情報');
    let pos=magic.length+8+length;
    const blobs=new Map();
    for(const a of m.audio){
      if(!a||typeof a.id!=='string'||!refs.has(a.id)||blobs.has(a.id))fail('音声ID');
      if(!Number.isSafeInteger(a.size)||a.size<=0||a.size>2147483648)fail('音声サイズ');
      if(typeof a.crc32!=='string'||!/^[0-9a-f]{8}$/.test(a.crc32))fail('音声CRC');
      if(typeof a.type!=='string'||a.type.length>120)fail('音声形式');
      if(pos+a.size>file.size)fail('音声ファイルが途中で切れています');
      const blob=file.slice(pos,pos+a.size,a.type);
      if(await crc32(blob)!==a.crc32)fail('音声「'+a.id+'」のCRCが一致しません');
      blobs.set(a.id,blob);
      pos+=a.size;
    }
    if(pos!==file.size)fail('末尾に余分なデータがあります');
    return {project:m.project,blobs};
  }
  root.ASAHIMusicBackup=Object.freeze({create,read,crc32,version:schema});
})(typeof globalThis==='object'?globalThis:this);
