// Local text-command interpreter for deterministic outro edits.
// This is deliberately NOT a generative music model. Unrecognized text fails closed.
function normalize(input) {
  return String(input ?? "").normalize("NFKC").replace(/[\u3000\t\r\n]+/g, " ").trim();
}
const decimal = String.raw`(\d+(?:\.\d+)?)`;
const patterns = [
  {key:"fadeSeconds", re:new RegExp(String.raw`(?:最後(?:の|を)?|末尾(?:の|を)?|終わり(?:の|を)?)?\s*`+decimal+String.raw`\s*秒(?:間)?(?:を|で|かけて)?\s*(?:かけて)?\s*(?:ゆっくり)?\s*フェードアウト(?:して|する|させて|させる)?`, "gi")},
  {key:"fadeSeconds", re:new RegExp(String.raw`フェードアウト(?:を)?\s*`+decimal+String.raw`\s*秒(?:間)?(?:かけて|で)?`, "gi")},
  {key:"silenceSeconds", re:new RegExp(String.raw`(?:最後(?:に|へ)?|末尾(?:に|へ)?)?\s*`+decimal+String.raw`\s*秒(?:間)?(?:の)?(?:完全)?無音(?:を)?(?:入れて|入れる|追加して|追加する|つけて|つける|にして)?`, "gi")},
  {key:"silenceSeconds", re:new RegExp(String.raw`(?:最後(?:に|へ)?|末尾(?:に|へ)?)?\s*(?:完全)?無音(?:を)?\s*`+decimal+String.raw`\s*秒(?:間)?(?:入れて|入れる|追加して|追加する|にして)?`, "gi")}
];
const connectorRE = /^(?:(?:して|ください|お願い|してね|それから|そして|あと|と|＋|\+|&|。|、|,|\s)+)*$/;

export function planJapaneseOutroEdit(input) {
  const prompt = normalize(input);
  const errors = [], changes = {};
  if(!prompt) return {ok:false, changes:{}, errors:["編集指示を入力してください。"], summary:[]};
  let remainder=prompt;
  for (const {key,re} of patterns) {
    remainder=remainder.replace(re,(all,num)=>{
      const value=Number(num);
      if (!Number.isFinite(value)) errors.push("数値を読み取れません: "+all);
      else if (Object.hasOwn(changes,key) && changes[key]!==value) errors.push("同じ項目に異なる指定があります: "+key);
      else changes[key]=value;
      return " ";
    });
  }
  if(Object.hasOwn(changes,"fadeSeconds") && (changes.fadeSeconds<0.1 || changes.fadeSeconds>30)) {
    errors.push("フェードアウトは0.1〜30秒を指定してください。");
  }
  if(Object.hasOwn(changes,"silenceSeconds") && (changes.silenceSeconds<1 || changes.silenceSeconds>10)) {
    errors.push("完全無音は1〜10秒を指定してください。");
  }
  if(!connectorRE.test(remainder)) {
    errors.push("未対応の指示があります: "+remainder.trim().replace(/^[\s、。,]+|[\s、。,]+$/g,""));
  }
  if(Object.keys(changes).length===0) errors.push("対応できる操作が見つかりません（フェードアウト秒数／無音秒数）。");
  const summary=[];
  if(Object.hasOwn(changes,"fadeSeconds")) summary.push("最後の"+changes.fadeSeconds+"秒をフェードアウト");
  if(Object.hasOwn(changes,"silenceSeconds")) summary.push("末尾へ完全無音"+changes.silenceSeconds+"秒を追加");
  else summary.push("無音は既存の選択値を維持（既定2秒）");
  return {ok:errors.length===0,changes,errors,summary};
}
