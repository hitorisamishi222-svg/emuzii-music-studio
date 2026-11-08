// Instrument/sample-source rights gate for the development library.
// Policy validation only: metadata is NOT evidence that the license is genuine.
const approvedPurposes = Object.freeze({
  personalRender: "personalRender",
  commercialRender: "commercialRender",
  redistributeSamples: "redistributeSamples"
});
const permittedKinds = new Set(["instrument","japanese-instrument","nature","special"]);
const permittedFormats = new Set(["sf2","sfz","wav","flac","aiff","other"]);

function httpsUrl(value) {
  if(typeof value!=="string"||!value.trim()) return false;
  try {const u=new URL(value);return u.protocol==="https:" && !!u.hostname && !u.username && !u.password}
  catch{return false}
}
function utcDate(value) {
  if(typeof value!=="string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const d=new Date(value+"T00:00:00Z");
  return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0,10)===value;
}
const allRights=Object.keys(approvedPurposes);

/**
 * A registry record does not grant rights: humans must verify the source and terms.
 * A positive check means only that a manually reviewed declaration meets this policy.
 */
export function validateSampleRecord(input) {
  const errors=[];
  const p=(input&&typeof input==="object"&&!Array.isArray(input))?input:{};
  const requiredText=["id","title","provider","licenseId","reviewedBy"];
  for(const k of requiredText) {
    if(typeof p[k]!=="string"||!p[k].trim()||p[k].trim().length>180)errors.push(k+": 有効な文字列が必要です");
  }
  if(!permittedKinds.has(p.kind))errors.push("kind: 対応しない音源種別");
  if(!permittedFormats.has(p.format))errors.push("format: 対応しないファイル形式");
  if(!httpsUrl(p.sourceUrl))errors.push("sourceUrl: HTTPSの正規出典が必要です");
  if(!httpsUrl(p.licenseUrl))errors.push("licenseUrl: HTTPSのライセンス本文URLが必要です");
  if(!utcDate(p.reviewedAt))errors.push("reviewedAt: YYYY-MM-DDの確認日が必要です");
  if(p.reviewed!==true)errors.push("reviewed: 人による確認済みでなければ利用できません");
  if(!p.rights||typeof p.rights!=="object"||Array.isArray(p.rights))errors.push("rights: 個別の利用許可が必要です");
  else for(const k of allRights)if(typeof p.rights[k]!=="boolean")errors.push("rights."+k+": true/falseを個別に指定してください");
  if(p.attributionRequired===true && (typeof p.attributionText!=="string" || !p.attributionText.trim()))errors.push("attributionText: 必要なクレジットがありません");
  if(p.attributionRequired!==true && p.attributionRequired!==false)errors.push("attributionRequired: true/falseの指定が必要です");
  // Prohibit unknown/right-shifted license scope. Unknown terms must be resolved manually.
  if(p.termsUnclear!==false)errors.push("termsUnclear: 不明点は人が解決するまで利用不可");
  return {ok:errors.length===0,errors};
}
export function sampleUsageDecision(record,purpose) {
  const validated=validateSampleRecord(record);
  if(!Object.hasOwn(approvedPurposes,purpose)) return {allowed:false,reasons:["未定義の利用目的"]};
  if(!validated.ok)return {allowed:false,reasons:validated.errors};
  if(record.rights[purpose]!==true) return {allowed:false,reasons:["この用途の利用許可は確認されていません: "+purpose]};
  // Commercial output permission does not imply sample-file redistribution permission.
  if(purpose==="redistributeSamples" && record.rights.redistributeSamples!==true) {
    return {allowed:false,reasons:["音源サンプルの再配布権限なし"]};
  }
  return {allowed:true,reasons:[],notice:"ライセンス情報が実際に正しいことは人が確認してください"};
}
export const SAMPLE_RIGHTS_PURPOSES=Object.freeze([...allRights]);
