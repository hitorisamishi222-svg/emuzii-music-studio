# MUSIC-096 — 実録音ピアノ2曲融合の小音量診断と任意ゲイン調整

2026-11-10。対象は既存開発ブランチ `feature/vocal-recorder-v1` のみ。公開中のmain・本番URL・楽曲原本は変更しない。

## ① 現状確認
MUSIC-095の公式CC0録音6音源をSHA256照合したChromium CIは **成功**。実録音ピアノ2曲（90BPM・3拍子のC4旋律、140BPM・4拍子のC3ベース）を共通120BPM・4拍子へ変換し、5秒演奏＋2秒無音のステレオWAVを出力できた。

しかしCIログで融合WAVのピークが `0.0029600607`（約 **-50.57 dBFS**）と判明。従来の「音割れしない」という合格だけでは**極端な小音量を見落とす**問題がある。低レベルの原因はサンプル自体のレベル、楽器側-12dB、ステム側-3/-6dB、マスターヘッドルーム-9dB等の積み重ねと考えられるが、主因は録音原本の詳細レベル解析なしに断定しない。

## ② 実装
- `integration/independent-stem-fusion.js` に、既定値ゼロでのみ作用する `masterTrimDb`（0〜+24dB）を追加。既存の音量は変更しない。
- `peakDbfs` と `quietPreview`（ピークが-30dBFS未満）の診断情報を返す。
- `integration/independent-arrangement-renderer.js` から同オプションを明示指定できるように接続。
- 音量調整後も過負荷・クリッピングするWAVの書き出しを拒否。元録音・元スコアは編集しない。
- `tests/independent-stem-fusion.test.mjs` に静かな素材の+24dB比較、既定の後方互換、音割れ拒否のテストを追加。
- `tests/real-piano-independent-arrangement-browser.test.mjs` に公式実録音の標準版と**明示的に+24dBの比較版**を追加し、2つのWAVとピークdBFS、無音、左右差、原本不変性を検査。Artifactの比較用ファイル名は `two-independent-songs-real-cc0-piano.wav` と `two-independent-songs-real-cc0-piano-trim-plus24db.wav`。

## ③ 検証と未合格
- Nodeの既存・追加テストは合格: https://github.com/hitorisamishi222-svg/emuzii-music-studio/actions/runs/42750760744
- 固定CC0実録音のChromium比較テスト: https://github.com/hitorisamishi222-svg/emuzii-music-studio/actions/runs/42750782289
- +24dB版でも人間の耳で音楽的に自然かは未判定。**ピーク-30dBFS警告は診断用の任意閾値であり、業界標準のマスタリング合格条件ではない**。
- MUSIC-077全体、調性・和声、別楽器、スマホ実機と耳による試聴は未完了。
