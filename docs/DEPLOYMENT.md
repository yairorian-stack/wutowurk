# 確認用サイトの公開

2026年10月21日、依頼者から「確認用に公開してよい」と承認あり。有料契約は行っていない。

## GitHubへ配置済み

- リポジトリ: `yairorian-stack/wutowurk`（公開リポジトリであることを確認）
- 公開用ブランチ: `gh-pages`
- コミット: `fc65179bccf8544a6a70d7298e0694c7e6cee230`
- ファイル: `index.html`, `.nojekyll`, `robots.txt`, `THIRD_PARTY_NOTICES.txt`
- mainブランチは変更していない。作業中のNext.jsソースは既存チェックアウトに保持。

自己完結型のサンプル用HTML。個人情報・秘密情報・認証キー・実データを含めない。画面操作と保存はブラウザー内で完結し、共有DBや本番認証はない。検索エンジン向けにnoindexとrobots.txtを設定しているが、アクセス制限ではない。第三者ライブラリのライセンスは同梱した。

その後、依頼者の画面でGitHub Pagesが「Your site is live」、公開元が `gh-pages` / `/(root)` であることを確認した。今回の売上・日報・出納帳サンプルも同じブランチへの更新で反映する。`npm run build:pages` で `out-pages/` に公開物を再生成する。公開URLでの新画面は `https://yairorian-stack.github.io/wutowurk/#/daily`。最新の公開物のコミットはリモートの `gh-pages` HEAD を正とする。

自己評価の入力画面は `https://yairorian-stack.github.io/wutowurk/#/self-evaluation`。公開物は未記入のフォームと制度案のみを含み、利用者が入力した氏名・評価・振り返りは公開ファイルへ組み込まない。

## GitHub側の設定（初回のみ・現在は設定済み）

管理者が https://github.com/yairorian-stack/wutowurk/settings/pages を開き、次のように設定する。

1. Build and deployment → Source: `Deploy from a branch`
2. Branch: `gh-pages`、フォルダー: `/(root)`
3. `Save`

確認用サイトのURL: https://yairorian-stack.github.io/wutowurk/

現在のクラウド環境では `api.github.com` と `yairorian-stack.github.io` への通信がネットワークポリシーで拒否されている。APIによるPages設定変更と外部の公開URLの応答検証は未実行。Git push成功およびgithub.com上の公開用ブランチのファイル表示は確認済み。URLを閲覧可能と断定しない。

この環境から管理・公開確認を再開する場合は、環境設定の既存カスタム許可先を保持して `api.github.com` と `yairorian-stack.github.io` を追加する。設定反映後にAPI権限・Pages状態・公開URLの応答を実測する。Git認証の成功だけでAPIの管理権限があるとは扱わない。
