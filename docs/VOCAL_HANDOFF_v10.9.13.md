# ASAHI Vocal v0.20.5 / MUSIC STUDIO v10.9.13 DEV

## 目的
録音を使わず、実際の別タブ起動から Vocal → Studio の戻り通信、ACK、子タブ終了までを実機で1回で確認できる診断を追加する。

## MUSIC STUDIO v10.9.13
- 既存の「🔗 連携診断」に加えて「🪟 実タブ往復診断」を追加。
- ボタン押下のユーザー操作中に `window.open("about:blank","_blank")` を実行し、ポップアップ許可の成否も診断対象にする。
- 診断用 `to-vocal` handoffへ以下を保存:
  - sourceStartSec: 3.25
  - offsetSeconds: -0.15
  - 日本語TAKE名
  - crossTabDiagnostic / diagnosticId
- 実際の Vocal 子タブだけを `event.source` で許可。
- Vocalから返った `.asahiproj` を通常の `handleAsahiReturnMessage()` / `consumeAsahiReturnToken()` 経路で取り込む。
- 戻り位置 3.10秒、CRC、SONG ID、TAKE名を検査。
- 診断開始前の全トラックについて、順序とオブジェクト参照が変化していないことを検査。
- 診断TAKEを検査後、autosaveタイマーを停止し、元のtracks / SONG ID / TAKE名 / offset / localStorage下書きを復元してからACK。
- ACK後、子タブが4秒以内に閉じたことを親タブ側で確認。
- 診断失敗時も元状態を復元し、診断用handoffを削除して子タブを閉じる。

## Vocal v0.20.5
- `crossTabDiagnostic` handoffを検出。
- 診断専用起動では前回中断した本物の録音の自動復旧をスキップ。
  - 通常起動の中断録音復旧は従来どおり維持。
- 診断用0.30秒WAVをメモリ上で生成し、通常TAKEへ保存せず `.asahiproj` を作成。
- 通常の `ASAHI_VOCAL_RETURN` で opener へ返却。
- ACKは `event.source === window.opener` と同一originで確認。
- 6秒以内にACKがなければFAILとして診断用 `to-studio` handoffを削除。
- ACK成功時のみ `window.close()`。
- URL上の `handoff` / `crossTabDiag` は読込後に除去。

## 配信済みコード検査
- 開発版 root: HTTP 200 / v10.9.13。
- app-v10.3.2.html: HTTP 200 / v10.9.13。
- Vocal: HTTP 200 / v0.20.5。
- Studio配信JavaScript: 構文PASS。
- Vocal配信JavaScript: 構文PASS。
- 実window.openコード: あり。
- 子タブ送信元照合: あり。
- Vocal normal return message: あり。
- ACK送信元照合: あり。
- 診断時の中断録音復旧スキップ: あり。
- 診断中は本物の rawVocalBlob を生成・変更しない。

## 実機で残る確認
「🪟 実タブ往復診断」をiPhone Safariで1回実行し、
1. Vocal別タブが開く
2. Vocalが自動で診断プロジェクトを返す
3. StudioがACKする
4. 元のガイド/他トラックが残る
5. Vocalタブが自動で閉じる
を確認する。

ポップアップブロック時は診断が明示的にFAIL表示する。

AndroidアプリはWebの実タブ診断対象外で、従来どおり `.asahiproj` ファイル受け渡し。

## 保護
本番URL / main は変更しない。すべて `feature/vocal-recorder-v1` 開発ブランチのみ。
