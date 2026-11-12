# MUSIC-102 — オフライン単音ピッチ推定の初期試作

## 分析
MUSIC-101は補正判断だけであり、測定した歌声の周波数がない。Androidの実機経路・DSPをいきなり実装すると、音程誤検出と接続遅延の原因を切り分けられない。

## 方法の確認
まず入力済みモノラルPCMに対する基本周波数の**候補**を検出する。平均値を除去し、正規化自己相関の周期ピークから周波数を推定。無音、低信頼度、異常値を拒否。実歌唱・伴奏混入・倍音・オクターブ誤判定は別途検証する。これはAndroid低遅延音声I/Oでも音声補正DSPでもない。

## 実装
- `integration/offline-monophonic-pitch-estimator.js`：最大262144サンプル、8〜96kHz、80〜1000Hz既定。入力不変。周波数・信頼度・RMS・有声音判定を返す。
- `tests/offline-monophonic-pitch-estimator.test.mjs`：110/220/440/660Hzの合成単音、無音、異常値、元PCM保護。
- `.github/workflows/test-realtime-pitch-policy.yml`：MUSIC-101の補正判断テストと併せて、この範囲のみテスト。

CI: https://github.com/hitorisamishi222-svg/emuzii-music-studio/actions/runs/43204025809

## 未完了
実歌声での評価、倍音・しゃくり・ビブラートの保護、リアルタイム音声入出力、補正DSP、音量制御、Android APK、AG03MK2→iPhone→ColorSingの接続と遅延測定。これらは未検証。既存MUSIC-100・本番・音源原本は変更しない。
