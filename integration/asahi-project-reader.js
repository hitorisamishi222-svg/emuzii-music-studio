/* ASAHI Vocal Project Reader v1.0
 * Reusable importer for ASAHI Vocal Recorder v0.12+ .asahiproj packages.
 * ASAHIProjectReader.read(file) returns {manifest,metadata,vocalBlob,backingBlob}.
 * No storage writes, server uploads, or destructive changes.
 */
(function(root){
  'use strict';
  const HEADER='ASAHI-PROJECT-V1\n', E=new TextEncoder(), D=new TextDecoder();
  const MAGIC=E.encode(HEADER),MAX=240*1024*1024;
  const TABLE=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);t[n]=c>>>0}return t})();
  async function crc32(blob){let c=0xffffffff;const step=256*1024;for(let start=0;start<blob.size;start+=step){const bytes=new Uint8Array(await blob.slice(start,start+step).arrayBuffer());for(let i=0;i<bytes.length;i++)c=TABLE[(c^bytes[i])&255]^(c>>>8);if(start&&start%(step*8)===0)await new Promise(done=>setTimeout(done,0))}return ((c^0xffffffff)>>>0).toString(16).padStart(8,'0')}
  async function read(file){
    if(!file||!Number.isSafeInteger(file.size)||file.size<MAGIC.length+6||file.size>MAX)throw Error('ASAHIプロジェクトのファイルサイズが不正です');
    const prefix=new Uint8Array(await file.slice(0,MAGIC.length+4).arrayBuffer());
    if(!MAGIC.every((n,i)=>prefix[i]===n))throw Error('未対応のASAHIプロジェクト形式です');
    const size=new DataView(prefix.buffer).getUint32(MAGIC.length,true);
    if(size<2||size>65536)throw Error('プロジェクトの管理情報が不正です');
    let pos=MAGIC.length+4;
    const manifest=JSON.parse(D.decode(await file.slice(pos,pos+size).arrayBuffer()));pos+=size;
    if(manifest.schema!=='asahi-vocal-project-v1'||manifest.metadata?.schema!=='asahi-vocal-take-v1')throw Error('プロジェクトのバージョンが未対応です');
    const metadata=manifest.metadata;
    if(!Number.isFinite(metadata.offsetSeconds)||metadata.offsetSeconds < -3||metadata.offsetSeconds>3)throw Error('補正値が不正です');
    if(![null,'mic','mix','backing'].includes(metadata.recordingMode??null))throw Error('録音モードが不正です');
    const tracks=[];
    for(const entry of [manifest.vocal,manifest.backing]){
      if(entry==null){tracks.push(null);continue}
      if(!Number.isSafeInteger(entry.size)||entry.size<=0||entry.size>MAX||!(/^[a-f0-9]{8}$/.test(entry.crc32)))throw Error('音声データ情報が不正です');
      if(pos+entry.size>file.size)throw Error('音声データが途中で切れています');
      const blob=file.slice(pos,pos+entry.size,String(entry.mimeType||'application/octet-stream'));
      if(await crc32(blob)!==entry.crc32)throw Error('音声データの破損を検出しました');
      tracks.push(blob);pos+=entry.size;
    }
    if(pos!==file.size)throw Error('プロジェクトの余分なデータを検出しました');
    if(!tracks[0]&&!tracks[1])throw Error('歌声と伴奏がありません');
    return {manifest,metadata,vocalBlob:tracks[0],backingBlob:tracks[1]};
  }
  root.ASAHIProjectReader=Object.freeze({read,version:'1.0.0'});
})(typeof globalThis==='object'?globalThis:this);
