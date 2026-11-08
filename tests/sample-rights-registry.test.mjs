import test from "node:test";
import assert from "node:assert/strict";
import { validateSampleRecord, sampleUsageDecision, SAMPLE_RIGHTS_PURPOSES } from "../integration/sample-rights-registry.js";

// Synthetic fixture only. No source is verified and NO real sample is included.
const fixture=()=>({
 id:"fixture-001",title:"Synthetic test only",provider:"Test studio",
 kind:"nature",format:"sfz",sourceUrl:"https://example.invalid/source",
 licenseId:"TEST-FICTIONAL",licenseUrl:"https://example.invalid/license",
 reviewed:true,reviewedBy:"Human reviewer fixture",reviewedAt:"2026-11-08",termsUnclear:false,
 rights:{personalRender:true,commercialRender:true,redistributeSamples:false},
 attributionRequired:true,attributionText:"Fixture attribution"
});
test("commercial usage declaration does not imply redistribution of source samples",()=>{
 const record=fixture();
 assert.equal(validateSampleRecord(record).ok,true);
 assert.equal(sampleUsageDecision(record,"commercialRender").allowed,true);
 assert.equal(sampleUsageDecision(record,"redistributeSamples").allowed,false);
 assert.equal(sampleUsageDecision(record,"personalRender").allowed,true);
});
test("unknown or unreviewed licensing is rejected",()=>{
 for(const patch of [{reviewed:false},{termsUnclear:true},{reviewedBy:""},{reviewedAt:"2026-02-30"},{licenseUrl:"http://unsafe.invalid/license"},{rights:{personalRender:true}},{attributionText:""}]){
   const record={...fixture(),...patch};
   assert.equal(validateSampleRecord(record).ok,false,JSON.stringify(patch));
   assert.equal(sampleUsageDecision(record,"personalRender").allowed,false);
 }
});
test("usage intentions are explicit and cannot be inferred from a label",()=>{
 const record=fixture();
 record.licenseId="CC0"; // Changing the string does not grant more rights.
 assert.equal(sampleUsageDecision(record,"redistributeSamples").allowed,false);
 assert.equal(sampleUsageDecision(record,"inventedPurpose").allowed,false);
 assert.deepEqual(SAMPLE_RIGHTS_PURPOSES,["personalRender","commercialRender","redistributeSamples"]);
});
test("wrong data shape and unsafe provenance are refused",()=>{
 assert.equal(validateSampleRecord(null).ok,false);
 assert.equal(validateSampleRecord([]).ok,false);
 const r=fixture();
 r.sourceUrl="https://someuser:password@example.invalid/sample";
 assert.equal(validateSampleRecord(r).ok,false);
 const x=fixture();
 x.format="exe";
 assert.equal(validateSampleRecord(x).ok,false);
});
