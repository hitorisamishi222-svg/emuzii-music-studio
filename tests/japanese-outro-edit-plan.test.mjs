import test from "node:test";
import assert from "node:assert/strict";
import {planJapaneseOutroEdit} from "../integration/japanese-outro-edit-plan.js";

test("two Japanese operations become a deterministic reviewable plan",()=>{
  const r=planJapaneseOutroEdit("最後の8秒をフェードアウトして、2秒無音にして");
  assert.equal(r.ok,true,JSON.stringify(r));
  assert.deepEqual(r.changes,{fadeSeconds:8,silenceSeconds:2});
  assert.match(r.summary.join(" / "),/8秒.*2秒/);
});
test("reverse phrasing and fullwidth digits",()=>{
  const r=planJapaneseOutroEdit("フェードアウトを４秒、無音を３秒");
  assert.equal(r.ok,true,JSON.stringify(r));
  assert.deepEqual(r.changes,{fadeSeconds:4,silenceSeconds:3});
});
test("style instructions are never silently converted into destructive edits",()=>{
  const r=planJapaneseOutroEdit("ピアノを静かにして、最後の8秒をフェードアウトして");
  assert.equal(r.ok,false);
  assert.match(r.errors.join(" / "),/未対応/);
  assert.equal(r.changes.fadeSeconds,8);
});
test("a poetic request does not pretend to generate missing audio",()=>{
  const r=planJapaneseOutroEdit("最後の歌詞を復元し、余韻をもっと神秘的に");
  assert.equal(r.ok,false);
  assert.match(r.errors.join(" / "),/未対応/);
});
test("conflicting commands and impossible seconds are rejected",()=>{
  assert.equal(planJapaneseOutroEdit("2秒無音、4秒無音").ok,false);
  assert.equal(planJapaneseOutroEdit("最後の31秒をフェードアウト").ok,false);
  assert.equal(planJapaneseOutroEdit("0.5秒無音").ok,false);
});
test("empty prompt and plausible single edits",()=>{
  assert.equal(planJapaneseOutroEdit("").ok,false);
  const a=planJapaneseOutroEdit("最後の6秒をフェードアウト");
  assert.equal(a.ok,true,JSON.stringify(a));
  assert.deepEqual(a.changes,{fadeSeconds:6});
  assert.match(a.summary.join(),/既定2秒/);
});
