# MUSIC-083 — 実録音ピアノ音源の固定検証（2026-11-08）

## 目的と重要な区別
従来の開発試験は正弦波の**人工的な音**で、実際の楽器サンプルの再生実績ではなかった。今回の検証では、Meta Open Soundに含まれる**録音ピアノC4（中央値の強さ）**のOGGプレビュー音源を、Chromiumで本当にデコードして、1音試聴用WAVおよび30秒のガイド演奏WAVを出力する。

これだけで本物のピアノの演奏品質・奏法・iPhone実機を合格にしてはならない。

## 再現可能な入手先とライセンス
- 著作物名: Meta Open Sound / Meta Piano
- 配布元: Meta Platforms Inc., https://github.com/facebookincubator/Meta-open-sound
- 上流コミット（固定）: `251c0be57d5d1b3242b91f53e0cde62ab1cb42d9`
- 個別音源: `systems/instruments/meta-piano/ogg/INSPiano_Vel03_C4_01.ogg`
- 公式ライセンス: `systems/instruments/meta-piano/LICENSE`, CC0 1.0 Universal。マニフェストにも `"license": "CC0-1.0"`、352サンプル、WAVソース48 kHz/24 bitと記載。
- OGGの公式SHA-256: `f6df379bfb60e074fdb640eb33298a3150960b9c27fa9247740036fb8d9b55d6`
- LICENSEの公式SHA-256: `a2010f343487d3f7618affe54f789f5487602331c0a8d03f49e9a7c547cf0499`
- manifest.jsonの公式SHA-256: `d6414ab35d2920b00714e86a919a14ac547136db711c5ecfea2d74acf405a527`
- ソースパス: https://raw.githubusercontent.com/facebookincubator/Meta-open-sound/251c0be57d5d1b3242b91f53e0cde62ab1cb42d9/systems/instruments/meta-piano/
- これはWeb用**OGGプレビュー**であり、最高品質の24-bit PCM WAV本体を取得したものではない。SFZ本格対応も未完了。

## 実施内容
1. `.github/workflows/test-real-piano-cc0.yml` が固定コミットから特定のOGG、LICENSE、manifestを取得し、SHA-256を3つ照合。外部にあるサンプル本体は既存リポジトリへ自動コミットしない。
2. `tools/local-sampler.html` にOGGの単独プレビュー読込を追加。SFZでの複数音源マッピングは従来どおりWAVのみ。
3. `tests/real-piano-cc0-browser.test.mjs` がChromiumで実録音OGGを開き、単音と30秒30音ガイドをWAVへ変換。32秒で最後の2秒が真のゼロPCMであることを検査し、解析結果を記録。
4. CI生成物として `asahi-recorded-cc0-piano-guide` にWAVとaudit.jsonを14日間保存。期限内にGitHub Actionsから入手すれば実際に聴感チェックできる。**録音サンプルの生成後の実聴は自動テストとは別工程。**

## ライセンス運用
- Meta公式配布のCC0であることを上流の個別LICENSEとmanifestから確認できるが、この自動テストで**事業用としての音源ライブラリ同梱・本番リリースを承認したことにはならない**。
- `integration/sample-rights-registry.js` の「レビュー済み」等の製品リリースゲートを偽装・自動承認しない。
- UIが勝手にインターネットからサンプルをダウンロードする機能はない。音源の取得は開発用CIの**固定の1ファイルだけ**に限定する。

## 試験の限界
- 公式ハッシュが正しいこと、ブラウザが読み込めること、WAV変換ができることは**信号処理とソフトの検証**。
- **サンプル自体の音質・楽曲全体の芸術的な自然さ・実楽器特有の奏法**は、聴覚評価まで自動では保証できない。
- 本番 `main` とVercel URL、音源原本、既存SONG ID/TAKEは一切変更しない。
