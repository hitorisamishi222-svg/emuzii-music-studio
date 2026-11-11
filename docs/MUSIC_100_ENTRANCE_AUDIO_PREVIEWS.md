# MUSIC-100 — 入り位置候補をそれぞれWAVで聴き比べる

## 分析
MUSIC-099は曲Bの入り位置を変えた時の重なり音程を比較できるが、数字だけでは実際の音楽の良し悪しが判断できない。MUSIC-099のNode CIと管理表CIは合格。
- https://github.com/hitorisamishi222-svg/emuzii-music-studio/actions/runs/42947867525
- https://github.com/hitorisamishi222-svg/emuzii-music-studio/actions/runs/42947939712

## 方法の妥当性
既存の比較計算と録音サンプル合成を再利用して、**明示した最大4候補をそれぞれ独立したWAVとして生成**する。音程が重なる件数が少ない候補を自動採用しない。音量自動正規化や勝手な移調もしない。音楽的判断は試聴者に残す。

## 実装
- `integration/independent-entrance-preview-renderer.js` に `renderIndependentEntrancePreviews`。
- 候補ごとに元の曲を保ったまま、`renderIndependentArrangement` を使用してステレオWAV＋末尾無音を出力。
- WAVのレポートには `harmonyAudit:true` の音程監査を含め、候補比較の重なり件数との整合を検証。
- 最大4候補。録音不足・音割れ・音符の時間超過は既存レンダラと同じくエラー。
- `tests/independent-arrangement-renderer.test.mjs` で2種類のWAVが異なること、元音符・音源不変、末尾無音、候補数・時間超過の拒否を確認。

## CIと残課題
CI: https://github.com/hitorisamishi222-svg/emuzii-music-studio/actions/runs/42993703274

これは合成エンジンの機能であり、ユーザーがスマホからWAVを直接再生できる公開ページではない。実録音ピアノのこの候補モード、音楽的な自然さ、スマホ実機確認は未完了。本番・mainは変更しない。
