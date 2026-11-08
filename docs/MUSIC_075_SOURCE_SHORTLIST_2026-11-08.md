# MUSIC-075 — 無料実楽器サンプル候補の一次調査（2026-11-08）

> 配布元の公式ページに掲載された許諾条件の一次調査。音声ファイルの個別取得・実音色の聴感確認・ライセンス原文の同梱確認・実機検証を終えた証拠ではありません。自動ダウンロードや本番同梱はしていません。

## 公式ソース

| 候補 | 公式出典 | 公表条件と特徴 | 次の実証 |
| --- | --- | --- | --- |
| VSCO 2 Community Edition | https://versilian-studios.com/vsco-community/ | 公式にCC0。SFZ/生WAV。大規模版のほか50音・256音の小容量試用パック。 | 最優先。小容量パックから1音を取り、来歴・品質診断・実聴。 |
| VCSL | https://versilian-studios.com/vcsl/ | 公式にCC0。オーケストラ・民族楽器・特殊音。約5GBの大規模版。 | 音色を個別選択し低メモリ・複数奏法を確認。 |
| Philharmonia sound samples | https://philharmonia.co.uk/resources/sound-samples/ | 商用の完成作品へ使用可。ただしサンプル単体・サンプラーとしての再配布は禁止。 | 完成曲用途の候補に限定し、配布アプリの音色には自動採用しない。 |
| Meta Open Sound | https://github.com/facebookincubator/Meta-open-sound | 公開リポジトリは楽器音をCC0、Oculus Audio PackをCC BY 4.0と記載。パックごとにライセンスが異なる。 | 個別パックのLICENSE、サンプル名、出典を突き合わせる。 |

## ASAHI MUSICへの接続条件

1. 実際に使用する音源ファイルの名前、出典、ライセンス原文、確認日を記録。別パックの許諾を推定流用しない。
2. integration/sample-rights-registry.js で、個人制作・商用完成曲・音源サンプル再配布の権利を別々に確認する。不明点は許可しない。
3. integration/sample-quality-audit.js で、RMS、ピーク、冒頭・末尾の静音、DCオフセット、飽和候補を数値診断。機械的な解析は聴感品質の自動証明ではない。
4. tools/local-sampler.html で権利確認済みのWAVを選択し、30秒ガイドを作る。入力音声は上書きしない。
5. 著作権者による配布制限がある素材、とりわけPhilharmoniaの音源は、完成曲への利用と配布ソフトへの同梱を区別する。

## 進捗

- 公式ソースで許諾条件の一次確認・試作候補の特定：済み。
- 端末内の音質診断コード、合成データによる検査：実装済み。
- 実楽器サンプル本体の入手、サンプル単位の来歴照合、実聴、iOS/Android：未検証。
