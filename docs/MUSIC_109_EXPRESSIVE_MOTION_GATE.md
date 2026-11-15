# MUSIC-109 — 歌声表現の保護ゲート

## 三重思考
1. 現状：MUSIC-108の長窓研究版は持続単音22/22合格だが、ビブラートは-35セント12/22、+35セント11/22で不合格。
2. 方法：無理に変換せず、音程が揺れる区間と無音を安全側に保護する。音程推定は意図した旋律を確定できないので、安定音でも参照旋律がなければ補正しない。
3. 実装・確認：`integration/pitch-motion-safety-gate.js` と `tests/pitch-motion-safety-gate.test.mjs` を開発ブランチに追加、専用CIで確認。

## 実測（24kHz、1秒合成音声）
| 入力 | 判定 | 補正許可 |
|---|---|---|
| 220Hz持続音 | stable-pitch-candidate | true（候補のみ） |
| 5Hz合成ビブラート | expressive-motion-protected | false |
| 無音 | uncertain-or-unvoiced | false |

GitHub Actions: https://github.com/hitorisamishi222-svg/emuzii-music-studio/actions/runs/43696353571

## 未確認・次工程
- テスト合格は上記3種類の合成入力に限定。実歌声・子音・しゃくり・呼吸音・伴奏混在・倍音・誤検出率は未検証。
- このゲートはオフラインの判断専用。実際のPCMを変更しない。Android実時間処理やColorSing接続は未実装。
- 次は「参照音程必須」条件と表現保護ゲートを補正計画へ安全に接続し、表現区間のバイパス・無音・安定音の回帰テストを追加する。実歌声評価までライブ投入禁止。
