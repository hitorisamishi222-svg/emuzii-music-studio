import test from "node:test";
import assert from "node:assert/strict";
import {PITCH_MODES,planSelectivePitchCorrection} from "../integration/realtime-pitch-correction-policy.js";
const hzForCents=c=>440*Math.pow(2,c/1200);
test("natural mode preserves small deviations and refuses uncertain/unvoiced signals",()=>{
 const base={measuredHz:hzForCents(30),referenceHz:440,confidence:.99};
 assert.equal(planSelectivePitchCorrection(base).correctionCents,0);
 assert.equal(planSelectivePitchCorrection({...base,measuredHz:hzForCents(130),confidence:.5}).reason,"low-confidence");
 assert.equal(planSelectivePitchCorrection({...base,measuredHz:hzForCents(130),voiced:false}).reason,"unvoiced");
});
test("large sharp and flat notes only receive capped partial correction",()=>{
 const base={referenceHz:440,confidence:.99};
 const sharp=planSelectivePitchCorrection({...base,measuredHz:hzForCents(200)});
 const flat=planSelectivePitchCorrection({...base,measuredHz:hzForCents(-200)});
 assert.equal(sharp.correctionCents,-35);
 assert.equal(flat.correctionCents,35);
 assert.equal(sharp.active,true);
 assert.equal(planSelectivePitchCorrection({...base,measuredHz:hzForCents(200),mode:"standard"}).correctionCents,-60);
 assert.equal(planSelectivePitchCorrection({...base,measuredHz:hzForCents(200),mode:"powerful"}).correctionCents,-100);
 assert.equal(PITCH_MODES.natural.thresholdCents,65);
});
test("rejects invalid mode, confidence, frequency and unsafe configuration",()=>{
 const base={measuredHz:440,referenceHz:440,confidence:.99};
 for(const invalid of [{mode:"auto"},{measuredHz:0},{referenceHz:0},{confidence:2},{thresholdCents:0},{maxCorrectionCents:500},{voiced:"yes"}])
  assert.throws(()=>planSelectivePitchCorrection({...base,...invalid}));
});
