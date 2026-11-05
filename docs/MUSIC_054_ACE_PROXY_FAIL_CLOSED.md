# MUSIC-054 — ACE-Stepプロキシの追加保護（開発版）

## 目的
生成GPUへの不用意なアクセスや誤設定による転送を防止する。既存の曲・音声・録音・MIX・MASTERには手を入れない。

## 開発ブランチでの変更
- `api/ace/[...path].js` の許可された各エンドポイントに GET / POST のメソッド制限を追加。不許可メソッドを405で拒否。
- `ACESTEP_API_KEY` の未設定を503で拒否し、上流を呼ばない。
- `ACESTEP_API_URL` はHTTPSオリジン以外を拒否（ユーザー情報・クエリ・ハッシュ・追加パスを許可しない）。
- POST JSONはUTF-8で1MiBを超える場合413で拒否。上流へ送らない。
- 上流ネットワーク例外のエラーテキストを一般化し、内部詳細をレスポンスへ含めない。
- 既存の `audio_path` パラメータ変換、`X-Emuzii-Access` 認証、正常な小規模リクエストの動作は維持。

## 検証
`tests/ace-proxy-contract.test.mjs` に5件の新しいモック-only検査を追加:
1. 上流APIキー欠落で転送なし
2. HTTP URLで転送なし
3. 禁止メソッドで転送なし
4. 1MiBを超える生成リクエストで転送なし
5. 正常な小さいJSONはモック上流へ届く

GitHub Actions: https://github.com/hitorisamishi222-svg/emuzii-music-studio/actions/runs/42023658740 （SUCCESS）
テストのGPU URL/キー/音声は架空で、実GPUへアクセスしていない。

## 非対象・未完
実GPU接続、実曲生成、公開本番URL、iPhone/Android操作、人間の歌唱音質の受入は未確認のまま。MUSIC-040/050/060/070 のブロッカーは維持。
本番`main`と既存Vercel Productionは変更しない。実運用向けの認証と通信量・費用管理は外部接続前に別途確認が必要。
