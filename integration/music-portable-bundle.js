/* ASAHI MUSIC portable project bundle v1.
 * Local-only, preserving original Blob bytes with SHA-256 verification.
 * No network/storage access or automatic import. */
(function(root){
  'use strict';
  const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
  const magic=encoder.encode('ASAHI-MUSIC-BUNDLE-V1\n');
  const MAX_MANIFEST=8*1024*1024,MAX_ASSETS=250,MAX_SINGLE=200*1024*1024,MAX_TOTAL=750*1024*1024;
  const fail=message=>{throw Error('作品バックアップ: '+message)};
  const validId=id=>typeof id==='string'&&id.length>0&&id.length<=256;
  const hex=bytes=>Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');
  async function sha256(blob){
    if(!root.crypto?.subtle)fail('SHA-256を使える安全な環境が必要です');
    return hex(await root.crypto.subtle.digest('SHA-256',await blob.arrayBuffer()));
  }
  function refs(project){
    if(!project||typeof project!=='object'||!Array.isArray(project.tracks)||project.tracks.length>250)fail('プロジェクト一覧が不正です');
    const ids=new Set(),assets=new Set();
    for(const track of project.tracks){
      if(!track||!validId(track.id)||ids.has(track.id))fail('トラックIDが不正または重複しています');
      ids.add(track.id);
      if(track.blobId!=null){
        if(!validId(track.blobId))fail('音源の参照先が不正です');
        assets.add(track.blobId);
      }
    }
    return assets;
  }
  function validateIndex(index,wanted){
    if(!Array.isArray(index)||index.length>MAX_ASSETS||index.length!==wanted.size)fail('音源一覧とトラック参照が一致しません');
    const seen=new Set();let total=0;
    for(const item of index){
      if(!item||!validId(item.id)||seen.has(item.id)||!wanted.has(item.id))fail('音源IDが重複または不正です');
      if(!Number.isSafeInteger(item.size)||item.size<0||item.size>MAX_SINGLE)fail('音源の容量が上限外です');
      if(typeof item.sha256!=='string'||!/^[a-f0-9]{64}$/.test(item.sha256))fail('音源の検査値が不正です');
      if(typeof item.mime!=='string'||item.mime.length>200)fail('音源形式が不正です');
      seen.add(item.id);total+=item.size;
      if(total>MAX_TOTAL)fail('合計音源容量が上限を超えています');
    }
    return total;
  }
  async function pack({project,assets}={}){
    const wanted=refs(project);
    if(!Array.isArray(assets)||assets.length!==wanted.size)fail('必要な音源が揃っていません');
    const blobs=[],index=[],seen=new Set();
    for(const a of assets){
      if(!a||!validId(a.id)||seen.has(a.id)||!wanted.has(a.id)||!(a.blob instanceof Blob))fail('音源の内容が不正です');
      seen.add(a.id);
      const blob=a.blob;
      if(blob.size>MAX_SINGLE)fail('1音源の上限は200MBです');
      index.push({id:a.id,size:blob.size,mime:blob.type||'',sha256:await sha256(blob)});
      blobs.push(blob);
    }
    validateIndex(index,wanted);
    const manifest=encoder.encode(JSON.stringify({format:'asahi-music-bundle-v1',project,assets:index}));
    if(manifest.length>MAX_MANIFEST)fail('作品情報が大きすぎます');
    const size=new Uint8Array(4);new DataView(size.buffer).setUint32(0,manifest.length,true);
    return new Blob([magic,size,manifest,...blobs],{type:'application/octet-stream'});
  }
  async function unpack(file){
    if(!(file instanceof Blob)||file.size<magic.length+4)fail('ファイル形式が違います');
    const prefix=new Uint8Array(await file.slice(0,magic.length+4).arrayBuffer());
    if(!magic.every((n,i)=>prefix[i]===n))fail('対応していないファイルです');
    const length=new DataView(prefix.buffer).getUint32(magic.length,true);
    if(length<=0||length>MAX_MANIFEST||file.size<magic.length+4+length)fail('作品情報が破損しています');
    let manifest;
    try{manifest=JSON.parse(decoder.decode(await file.slice(magic.length+4,magic.length+4+length).arrayBuffer()))}
    catch{fail('作品情報を読み込めません')}
    if(manifest?.format!=='asahi-music-bundle-v1')fail('未対応のバージョンです');
    const wanted=refs(manifest.project);
    const total=validateIndex(manifest.assets,wanted);
    const start=magic.length+4+length;
    if(file.size!==start+total)fail('音源の長さが不正です');
    const assets=[];let offset=start;
    for(const entry of manifest.assets){
      const blob=file.slice(offset,offset+entry.size,entry.mime);
      if((await sha256(blob))!==entry.sha256)fail('音源の検査値が一致しません: '+entry.id);
      assets.push({id:entry.id,blob});offset+=entry.size;
    }
    return {project:manifest.project,assets};
  }
  root.ASAHIMusicBundle=Object.freeze({pack,unpack,version:'1',maxSingleBytes:MAX_SINGLE,maxTotalBytes:MAX_TOTAL});
})(typeof globalThis==='object'?globalThis:this);
