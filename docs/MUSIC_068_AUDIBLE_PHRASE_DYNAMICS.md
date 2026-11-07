# MUSIC-068 — 実WAV上のハミング・フレーズ強弱の回帰検証

## 実装・検証内容
- 開発ブランチ `feature/vocal-recorder-v1` の `tests/master-multitrack-browser.test.mjs` で、実Chromiumの音声エンジンから44.1kHz WAVを生成する自動検証を追加した。
- 同じA4（MIDI 69）、音長0.34秒、ベロシティ0.8、トラック音量0.85で、3音フレーズを2組（5秒チャンク境界の前後）と単独音1つの計7音を配置する。
- フレーズ中央のRMSが両端より3.5%以上大きいこと、先頭が単独音比約0.95、中央が約1.045の許容範囲に収まることを実WAVのサンプルで検証する。
- 2秒/4秒/7秒の休符RMSは0.0005未満。分割境界後でも強弱の山が維持されることを確認する。
- 初回の追加コミットで既存ブラウザテストとのJavaScript変数名衝突が発生したが、直後の修正で解消した。

## 確認できた証拠
- コード追加: https://github.com/hitorisamishi222-svg/emuzii-music-studio/commit/eb0f94b13bebfc1f424236f77be1dec785e47e9d
- 変数名衝突の修正: https://github.com/hitorisamishi222-svg/emuzii-music-studio/commit/6bdd07274d28dd0fee7c41d898eced6f14601566
- 修正後の開発CI（Vocal Bridge / Browser / MASTER）: **success**  
  https://github.com/hitorisamishi222-svg/emuzii-music-studio/actions/runs/42210342956

## 範囲と制限
これは合成ガイド音から作ったWAVを数値検証した結果であり、ユーザーの実楽曲を人が聴いて品質を認めたことではない。
iPhone/Android実機録音、ACE-Stepの実GPU生成、公開本番への反映は実施していない。
既存音源・SONG ID・保存形式・`main`・本番URLは変更しない。
