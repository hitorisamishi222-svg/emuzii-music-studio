import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const app=fs.readFileSync(new URL('../app-v10.3.2.html',import.meta.url),'utf8');
function section(start,end){const a=app.indexOf(start),b=app.indexOf(end,a+start.length);assert.ok(a>=0&&b>a);return app.slice(a,b)}
test('advanced export is clearly labeled as settings JSON without audio',()=>{
  assert.match(app,/💾 編集設定JSON保存/);
  assert.match(app,/📂 編集設定JSON読込/);
  assert.match(app,/歌声・伴奏・録音などの音源は含みません/);
  assert.match(app,/音源は「保存」→「編集状態を保存」/);
});
test('settings JSON serializer does not falsely claim to include track blobs',()=>{
  const s=section('function v8ProjectData(){','function saveV8ProjectFile(){');
  assert.match(s,/format:"emuzii_PROJECT"/);
  assert.doesNotMatch(s,/\btracks\s*:/);
  assert.doesNotMatch(s,/\bblob\s*:/);
  assert.match(app,/編集設定JSONを保存しました（音源は含みません）/);
});
test('local project save still persists audio blobs and does not depend on settings JSON',()=>{
  const s=section('async function persistTrackBlob(t){','function scheduleAutoSave(');
  assert.match(s,/idbPut\("blobs",\{id:blobId,blob:t\.blob\}\)/);
  assert.match(s,/async function persistProject\(id/);
  assert.match(s,/音源を含めて端末に保存しました/);
  assert.doesNotMatch(s,/v8ProjectData\(/);
});
test('broken audio backup refuses restore before changing current tracks',async()=>{
  const s=section('async function restoreProjectRecord(p,','async function saveProject(){');
  const existing=[{id:'current',name:'Live take',gain:1}];
  const state={tracks:existing};
  const restore=(new Function('idbGet','decodeBlob','state','setStatus','DB_NAME',s+';return restoreProjectRecord;'))(
    async()=>null,async()=>null,state,()=>{},'piyoko-music-v45'
  );
  const project={tracks:[{id:'bad',name:'Missing WAV',type:'vocal',blobId:'asset:not-found'}]};
  await assert.rejects(()=>restore(project),/見つかりません/);
  assert.equal(state.tracks,existing,'The existing track array must not be replaced');
  await assert.rejects(()=>restore({}),/一覧が不正/);
  assert.equal(state.tracks,existing);
});
test('failed audio decode refuses restore before editing current work',async()=>{
  const s=section('async function restoreProjectRecord(p,','async function saveProject(){');
  const existing=[{id:'current'}],state={tracks:existing};
  const restore=(new Function('idbGet','decodeBlob','state','setStatus','DB_NAME',s+';return restoreProjectRecord;'))(
    async()=>({blob:new Blob([Uint8Array.from([1,2,3])])}),async()=>null,state,()=>{},'piyoko-music-v45'
  );
  await assert.rejects(()=>restore({tracks:[{id:'bad',blobId:'asset:bad'}]}),/復号できません/);
  assert.equal(state.tracks,existing);
});
test('settings JSON import does not overwrite the original audio tracks',()=>{
  const s=section('async function loadV8ProjectFromFile(file){','function ptMedian(');
  assert.doesNotMatch(s,/state\.tracks\s*=/);
  assert.match(s,/編集設定JSONを復元しました（音源は変更しません）/);
});
