# MUSIC-098 — 独立2曲の重なり音程を非破壊で監査

## 分析→方法確認
MUSIC-097まででテンポ・拍子・各曲の開始位置は制御できるが、2曲の音符が同時に鳴るときの音程関係は可視化できなかった。調性の自動推測や「不協和だから修正」を最初から実行すると、意図した緊張感や表現を破壊する恐れがある。**まず、重なる音の区間と半音差を列挙するだけ**を採用。

## 実装
- `integration/independent-harmony-audit.js`: 各独立曲のノートイベントが同時に鳴る区間を検出。曲名、元ノート位置、開始時刻、重なり秒数、半音差、音程名を記録。
- 短2度・長2度・増4度・短7度・長7度の音程クラスは `review` 表示するが、音楽的に不正とは判定しない。
- `maxFindings` を超えた場合、全重なり数を数え続けて `truncated:true` と表示。結果の一部だけで問題なしと誤認させない。
- `renderIndependentArrangement(...,{harmonyAudit:true})` を明示指定するとWAVの報告JSONに監査結果を添付。既定は無効。音符やWAVを一切変更しない。

## 検証
Node CI（重なり・音程ラベル・開始位置の違い・入力不変・監査あり/なしでWAVバイト一致）：
https://github.com/hitorisamishi222-svg/emuzii-music-studio/actions/runs/42921985782

実録音CC0ピアノの2曲WAVへの監査接続（別CI）：
https://github.com/hitorisamishi222-svg/emuzii-music-studio/actions/runs/42922005321

## 限界
和音・調性の自動判定、文脈に沿った不協和の判断、音色の相互マスキング、編曲の自動提案、実耳試聴は未完了。元の楽曲・本番・mainは不変更。
