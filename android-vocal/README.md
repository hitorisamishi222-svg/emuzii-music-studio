# ASAHI 歌入れサポート Androidアプリ（試作・v0.8）

Androidは専用WebViewアプリ、iPhoneは独立Web版。アプリにはネット接続不要の録音UIを同梱し、同じ機能・TAKE形式を共有します。

## 機能
- 端末内MP3/WAV読み込み、伴奏を聴きながらマイク録音
- 歌声原音・ミックスWAV・SONG ID/TAKEデータを記録
- ±3.00秒、0.05秒刻みのタイミング補正
- IndexedDBへの自動保存、.asahitakeバックアップ
- Android保存先選択に対応した大きなファイルの分割転送

## アプリの安全対策
- WebViewAssetLoaderでローカルHTMLをHTTPSオリジンとして提供
- マイクだけをユーザー許可後に利用。カメラ・画面キャプチャは不許可
- 外部ドメインへのWebView遷移は拒否。Web側データはサーバーへ自動送信しない
- ユーザー指定の保存先にのみWAV等を書き込む。アプリ内保存は端末データ消去で失われる可能性あり

## ビルド
GitHub Actionsの `Build Android Vocal APK` でデバッグAPKをビルドする構成。Android Studioで開く場合は `android-vocal` ディレクトリを開いてください。

**状況**：GitHubの開発ブランチにソースを作成。実機・録音・音ズレ・APKインストールの検証は未完了。署名済み配布版やPlayストア公開版ではありません。

`android-vocal/app/build.gradle` がルートの `vocal/index.html` をビルド時にアプリ内へコピーします。Web版とアプリ版の画面ソースは共通です。
