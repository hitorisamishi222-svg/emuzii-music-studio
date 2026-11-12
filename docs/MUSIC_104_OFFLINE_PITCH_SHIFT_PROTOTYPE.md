# MUSIC-104 — オフライン部分音程シフト試作

## 分析・手法確認
MUSIC-101〜103は補正量の判断まで。Androidリアルタイム処理へ進む前に、音声を変更するDSPの独立した安全試作が必要。今回は入力PCMを保持したまま、短時間Hann窓を重ねる実験的granular overlap-add方式を追加。処理長は入力と同じ、補正量は±100セント以下、無補正は完全バイパス、出力は[-1,1]へ制限。音声品質や自然さを保証する方式ではない。

## 実装
- `integration/offline-pitch-shift-prototype.js`：40ms窓（調整20〜80ms）、wet混合、非破壊Float32Array出力。latencySamplesは窓サイズ相当の**設計目安**であり実測遅延ではない。
- `tests/offline-pitch-shift-prototype.test.mjs`：無補正時の同一PCM、長さ維持、非破壊、範囲・異常入力拒否。
- 専用CI: https://github.com/hitorisamishi222-svg/emuzii-music-studio/actions/runs/43208426400

## 未合格
出力の実音高が指定セント数に変わること、自然な声質・ビブラート維持、歌唱実録音A/B、実測遅延、リアルタイム音声I/O、Android APK、AG03MK2・iPhone・ColorSing。これらの確認が済むまでライブ投入禁止。既存本番・音源・MUSIC-100を変更しない。
