(() => {
  "use strict";

  const VERSION = "10.4.0";
  const DB_NAME = "emuzii_reference_library_v1";
  const DB_VERSION = 1;
  const STORE = "songs";
  const META_KEY = "emuzii_accumulation_v1";
  const $ = (id) => document.getElementById(id);
  const core = window.emuziiCore || {};
  const state = core.state || (window.emuziiState104 = window.emuziiState104 || {accum101:{items:[]}});

  let dbPromise = null;
  let lastLyricFile = null;

  function status(text){
    try { if (typeof core.setStatus === "function") core.setStatus(text); }
    catch (_) {}
  }

  function escapeHtml(value){
    return String(value ?? "")
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/\"/g,"&quot;")
      .replace(/'/g,"&#39;");
  }

  function openDb(){
    if (!window.indexedDB) return Promise.reject(new Error("IndexedDB unsupported"));
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve,reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, {keyPath:"id"});
          store.createIndex("createdAt","createdAt",{unique:false});
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("IndexedDB open failed"));
    });
    return dbPromise;
  }

  async function dbPut(record){
    const db = await openDb();
    return new Promise((resolve,reject) => {
      const tx = db.transaction(STORE,"readwrite");
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error("IndexedDB write failed"));
      tx.onabort = () => reject(tx.error || new Error("IndexedDB write aborted"));
    });
  }

  async function dbGet(id){
    const db = await openDb();
    return new Promise((resolve,reject) => {
      const req = db.transaction(STORE,"readonly").objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error || new Error("IndexedDB read failed"));
    });
  }

  async function dbAll(){
    const db = await openDb();
    return new Promise((resolve,reject) => {
      const req = db.transaction(STORE,"readonly").objectStore(STORE).getAll();
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
      req.onerror = () => reject(req.error || new Error("IndexedDB read failed"));
    });
  }

  function persistMetadataMirror(){
    try {
      const clean = (state.accum101?.items || []).map(({audioBlob, ...x}) => x);
      localStorage.setItem(META_KEY, JSON.stringify(clean));
    } catch (_) {}
  }

  function ensurePanels(){
    const lyricPanel = $("lyricCheck103Panel");
    if (lyricPanel && !$("lyricToAccum104")) {
      const row = document.createElement("div");
      row.className = "row wrap";
      row.style.marginTop = "8px";
      row.innerHTML = '<button id="lyricToAccum104" class="btn">＋ この音源を蓄積へ渡す</button><span id="lyricBridge104" class="muted">同じ音源を選び直さず使えます。</span>';
      const audio = $("lyricPlayer103");
      if (audio) audio.insertAdjacentElement("afterend", row); else lyricPanel.appendChild(row);
    }

    const accumPanel = $("accum101Panel");
    if (accumPanel && !$("accumStorage104")) {
      const box = document.createElement("div");
      box.id = "accumStorage104";
      box.className = "arrangement";
      box.style.marginTop = "8px";
      box.innerHTML = '<b>REFERENCE LIBRARY v10.4</b> ｜ 保存方式を確認中…';
      const statusBox = $("accum101Status");
      if (statusBox) statusBox.insertAdjacentElement("beforebegin", box); else accumPanel.appendChild(box);
    }
  }

  function currentAccumFile(){
    return state.accum102File || $("accumAudio102")?.files?.[0] || lastLyricFile || state.lyric103?.file || null;
  }

  async function sendLyricToAccum(){
    const file = state.lyric103?.file || $("lyricAudio103")?.files?.[0] || lastLyricFile;
    if (!file) { status("先に歌詞チェックの音源を選んでください"); return; }
    lastLyricFile = file;
    state.accum102File = file;
    if (typeof core.accumAudio102Change === "function") {
      await core.accumAudio102Change({target:{files:[file]}});
    } else {
      state.accum102FileName = file.name || "audio";
      state.accum102FileBytes = file.size || 0;
    }
    const title = $("accumTitle101");
    if (title && !title.value) title.value = (file.name || "曲").replace(/\.[^.]+$/," ").trim();
    const bridge = $("lyricBridge104");
    if (bridge) bridge.textContent = `蓄積へ受け渡し済み: ${file.name || "音源"}`;
    $("accum101Panel")?.scrollIntoView({behavior:"smooth", block:"start"});
    status(`「${file.name || "音源"}」を蓄積システムへ渡しました`);
  }

  async function saveReference(event){
    event?.preventDefault?.();
    event?.stopImmediatePropagation?.();

    const items = state.accum101?.items || [];
    const before = items.length;
    const file = currentAccumFile();
    if (file) state.accum102File = file;

    if (typeof core.saveAccum101 === "function") {
      core.saveAccum101();
    } else {
      if (!file) { status("先に蓄積する音源を選んでください"); return; }
      const item = {
        id:"A"+Date.now(), createdAt:new Date().toISOString(),
        title:$("accumTitle101")?.value.trim() || file.name || "無題",
        sourceFile:file.name || null, sourceBytes:file.size || 0,
        rating:Number($("accumRating101")?.value || 5),
        likes:{
          chorus:!!$("accumChorus101")?.checked,
          tone:!!$("accumTone101")?.checked,
          interlude:!!$("accumInterlude101")?.checked,
          vocalBad:!!$("accumVocalBad101")?.checked
        },
        features:{duration:state.accum102Buffer?.duration || 0,noteCount:0}
      };
      state.accum101 = state.accum101 || {items:[]};
      state.accum101.items.push(item);
    }

    if ((state.accum101?.items || []).length <= before) return;
    const item = state.accum101.items[state.accum101.items.length - 1];
    item.referenceLibraryVersion = VERSION;

    try {
      await dbPut({...item, hasAudio:!!file, audioType:file?.type || null, audioBlob:file || null});
      item.hasAudio = !!file;
      item.storage = file ? "IndexedDB + audio" : "IndexedDB metadata";
      persistMetadataMirror();
      renderReferenceList();
      const st = $("accum101Status");
      if (st) st.textContent = `蓄積完了：${item.title} ｜ ★${item.rating} ｜ ${file ? "音源本体も端末保存" : "特徴・評価を保存"}`;
      status(`「${item.title}」をREFERENCE LIBRARYへ蓄積しました`);
    } catch (err) {
      item.hasAudio = false;
      item.storage = "localStorage fallback";
      persistMetadataMirror();
      renderReferenceList();
      const st = $("accum101Status");
      if (st) st.textContent = `蓄積完了：${item.title} ｜ メタデータ保存（音源本体の保存は失敗）`;
      status(`蓄積はしましたが音源本体の端末保存に失敗しました：${err?.message || "IndexedDB error"}`);
    }
  }

  async function restoreReference(id){
    try {
      const rec = await dbGet(id);
      if (!rec) { status("蓄積データが見つかりません"); return; }
      if (!rec.audioBlob) { status("この記録には音源本体が保存されていません"); return; }
      let file;
      try {
        file = new File([rec.audioBlob], rec.sourceFile || `${rec.title || "reference"}.mp3`, {type:rec.audioType || rec.audioBlob.type || "audio/mpeg"});
      } catch (_) {
        file = rec.audioBlob;
        try { Object.defineProperty(file,"name",{value:rec.sourceFile || `${rec.title || "reference"}.mp3`}); } catch (_) {}
      }
      state.accum102File = file;
      if (typeof core.accumAudio102Change === "function") await core.accumAudio102Change({target:{files:[file]}});
      if (typeof core.lyricAudio103Change === "function") core.lyricAudio103Change({target:{files:[file]}});
      const title = $("accumTitle101"); if (title) title.value = rec.title || rec.sourceFile || "";
      const rating = $("accumRating101"); if (rating && rec.rating) rating.value = String(rec.rating);
      const likes = rec.likes || {};
      if ($("accumChorus101")) $("accumChorus101").checked = !!likes.chorus;
      if ($("accumTone101")) $("accumTone101").checked = !!likes.tone;
      if ($("accumInterlude101")) $("accumInterlude101").checked = !!likes.interlude;
      if ($("accumVocalBad101")) $("accumVocalBad101").checked = !!likes.vocalBad;
      status(`「${rec.title || "蓄積曲"}」を再利用用に読み込みました`);
    } catch (err) {
      status(`蓄積曲を読み込めませんでした：${err?.message || "read error"}`);
    }
  }

  function renderReferenceList(){
    const items = state.accum101?.items || [];
    const list = $("accum101List");
    if (!list) return;
    if (!items.length) { list.innerHTML = "まだ蓄積していません。"; return; }
    list.innerHTML = items.slice(-10).reverse().map(x => {
      const audio = x.hasAudio ? "🎵 音源保存済" : "🗂 評価・特徴";
      return `<div style="padding:7px 0;border-bottom:1px solid rgba(128,128,128,.18)"><b>${escapeHtml(x.title || "無題")}</b> ★${Number(x.rating || 0)} ｜ ${Number(x.features?.duration || 0).toFixed(1)}秒 ｜ ${audio}${x.hasAudio ? ` <button class="btn" data-ref104="${escapeHtml(x.id)}" style="padding:4px 8px;margin-left:6px">再利用</button>` : ""}</div>`;
    }).join("");
  }

  async function loadReferenceLibrary(){
    ensurePanels();
    const storage = $("accumStorage104");
    try {
      const records = await dbAll();
      const current = state.accum101?.items || [];
      const map = new Map(current.map(x => [x.id,x]));
      for (const rec of records) {
        const meta = {...rec}; delete meta.audioBlob;
        meta.hasAudio = !!rec.audioBlob;
        map.set(meta.id, {...(map.get(meta.id)||{}), ...meta});
      }
      state.accum101 = state.accum101 || {items:[]};
      state.accum101.items = [...map.values()].sort((a,b)=>String(a.createdAt||"").localeCompare(String(b.createdAt||"")));

      for (const item of state.accum101.items) {
        if (!records.some(r=>r.id===item.id)) {
          try { await dbPut({...item, hasAudio:false, audioBlob:null}); } catch (_) {}
        }
      }
      persistMetadataMirror();
      renderReferenceList();
      if (storage) storage.innerHTML = `<b>REFERENCE LIBRARY v${VERSION}</b> ｜ IndexedDB有効 ｜ ${state.accum101.items.length}曲 ｜ 新規登録は音源本体も保存`;
    } catch (err) {
      renderReferenceList();
      if (storage) storage.innerHTML = `<b>REFERENCE LIBRARY v${VERSION}</b> ｜ localStorage互換モード ｜ 音源本体の永続保存は利用不可`;
    }
  }

  function install(){
    ensurePanels();

    const lyricInput = $("lyricAudio103");
    if (lyricInput && !lyricInput.dataset.ref104) {
      lyricInput.dataset.ref104 = "1";
      lyricInput.addEventListener("change", e => {
        const f = e.target.files?.[0];
        if (f) lastLyricFile = f;
      });
    }

    const accumInput = $("accumAudio102");
    if (accumInput && !accumInput.dataset.ref104) {
      accumInput.dataset.ref104 = "1";
      accumInput.addEventListener("change", e => {
        const f = e.target.files?.[0];
        if (f) state.accum102File = f;
      });
    }

    const bridge = $("lyricToAccum104");
    if (bridge && !bridge.dataset.bound104) {
      bridge.dataset.bound104 = "1";
      bridge.addEventListener("click", sendLyricToAccum);
    }

    const save = $("saveAccum101");
    if (save && !save.dataset.refCapture104) {
      save.dataset.refCapture104 = "1";
      save.addEventListener("click", saveReference, {capture:true});
    }

    const list = $("accum101List");
    if (list && !list.dataset.ref104) {
      list.dataset.ref104 = "1";
      list.addEventListener("click", e => {
        const btn = e.target.closest?.("[data-ref104]");
        if (btn) restoreReference(btn.dataset.ref104);
      });
    }

    const importInput = $("importAccumFile101");
    if (importInput && !importInput.dataset.ref104) {
      importInput.dataset.ref104 = "1";
      importInput.addEventListener("change", () => setTimeout(loadReferenceLibrary, 120));
    }

    loadReferenceLibrary();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, {once:true});
  else install();

  window.emuziiReferenceLibrary = {version:VERSION, reload:loadReferenceLibrary, restore:restoreReference};
})();
