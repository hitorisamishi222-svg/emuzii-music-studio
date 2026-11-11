# MUSIC-099 — 独立曲の開始位置を非破壊で比較する候補生成

## 1. 現状分析
MUSIC-098の重なり音程監査はNode、固定CC0ピアノ実録音、管理表CIがすべて合格。
- Node: https://github.com/hitorisamishi222-svg/emuzii-music-studio/actions/runs/42921985782
- CC0実録音: https://github.com/hitorisamishi222-svg/emuzii-music-studio/actions/runs/42922005321
- 管理表: https://github.com/hitorisamishi222-svg/emuzii-music-studio/actions/runs/42922104268

ただし「音程の注意箇所がある」というレポートだけでは、編曲上の選択肢が示されない。

## 2. やることと方法の妥当性
自動移調・コード変更は曲の意図を破壊する恐れがある。まず、既存の各曲の音符を変更せず、**曲Bが何小節後から入るか**の複数候補を計算し、重なりの件数と要確認音程件数を並べて比較する。**件数が少ないほど音楽的に優れているというランキングはしない**。単に遅らせれば衝突が減るため、ゼロ件を「最良」とするのは誤り。

## 3. 実装
- `integration/independent-entrance-options.js` に `compareIndependentEntrances`。
- 明示した最大16個の候補小節に対して、既存の `alignIndependentNoteParts` と `inspectSimultaneousIntervals` を利用。入力データは不変。
- 候補ごとの総重なり数、要確認音程数、分析結果の打切り有無を報告。出力は診断JSONのみ。
- `tests/independent-entrance-options.test.mjs` で元データ保持、決定論、候補0/1/2小節、異常入力を検証。
- 既存のステム融合CIへ追加。

## 4. 完了条件と限界
CI: https://github.com/hitorisamishi222-svg/emuzii-music-studio/actions/runs/42947867525

CI合格後に開発管理表へMUSIC-099をdoneとして追加する。候補の耳による比較、音楽的な優劣、長編曲、別楽器は未実施。本番・main・音源原本は変更しない。
