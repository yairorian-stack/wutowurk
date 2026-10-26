# Googleログイン・事前登録アドレスによる少人数試験

## 現在の状態

氏名・メールアドレスの入力 → Googleログイン → 非公開のDB許可リスト照合 → 店舗・役職に応じた社内画面表示を実装しています。旧メールOTPの送信・検証APIは410で閉じ、DBの旧登録RPCの利用権限も追加マイグレーションで撤回します。

Supabaseプロジェクト作成、最初の登録テーブルSQL実行、Gmail SMTP保存は所有者の共有画面で確認しました。招待メール送信は失敗したままで、原因は未特定です。今回のGoogle方式はこのメール送信を使いません。実環境のGoogle OAuth、追加SQL適用、Node.js公開先、実アカウントでのログインは未確認・未接続です。

試験対象の2名と所属は依頼者が指定済みです。実名・メールはリポジトリ外の非公開設定ファイルにだけ保存しています。初期メンバー、役職、店舗を名前の自己申告から決めたり、最初のログイン者を管理者にすることはありません。

## 公開までの設定順序

### 1. Google OAuthクライアントを所有者のアカウントで用意

Google Cloud Consoleで会社が管理するプロジェクトを選びます。未作成の場合は所有者が作成してください。Google Auth Platformのアプリ名・連絡先を設定し、利用者タイプをExternal、少人数検証ではTestingとして、指定した2名をテストユーザーに登録します。WorkspaceのInternalを使う場合は、その組織のアカウントだけに制限されるので個人Gmailは対象にできません。

Credentials（認証情報）でOAuth Client IDの種類をWeb applicationにし、Authorized redirect URIsへ **対象SupabaseプロジェクトURL + `/auth/v1/callback`** を完全一致で登録します。ポータルの `/auth/callback` とは別のURLです。申請する範囲はopenid・email・profileだけで、Drive・Gmailの権限は不要です。

Client IDとClient secretは、SupabaseのAuthentication → Sign In / Providers → Googleの専用設定欄へ直接入力します。secretをチャット、Git、スクリーンショット、Next.js環境変数へ貼り付けないでください。Googleプロバイダーを有効にし、nonce検証を無効化しないでください。メール/他社OAuthログインは無効にし、Googleだけを有効にします。

これは外部アカウントの所有者による初回設定が必要です。作成済みのpublishableキーだけで代理設定はできません。

### 2. 許可リストとDB権限を適用

最初の `202610250001_membership.sql` は再実行しないでください。既存テーブル・監査記録を消す処理は不要です。

追加するファイルは `supabase/migrations/202610260001_google_allowlist.sql` です。非公開の2名分の登録設定を含む実行用ファイルを別途用意しています。**まだ実環境で実行していません。** マイグレーションと登録設定の実行は一度だけ行い、エラー時は原因を確認してから続行します。

許可リストにだけ、メール・氏名・役職・権限・店舗を事前登録します。Googleから戻った本人確認済みアドレスとGoogle identityの検証済みアドレスが一致し、Google OAuthのセッションであり、許可リストが有効な場合だけ承認済みメンバーを作成します。既存の停止済みメンバーを再有効化しません。既存の承認済みメンバーの役職・店舗をログインのたびに上書きしません。

初期登録後にスタッフを増やす場合も、プロジェクト所有者が非公開の許可リストへ追加します。一般スタッフや店舗管理者は一覧を読み取ったり、自分を追加・昇格したりできません。既存の全社管理者向け承認画面だけでは新規アドレスの許可リスト登録はできません。

### 3. Node.jsホストへ公開

GitHub Pagesはサーバー認証を実行できません。Pagesは閉じた準備画面のままにします。実売上・スタッフ名簿・社内機能を公開HTMLに含めません。

Renderを利用する場合、所有者がGitHubへの接続を承認し、リポジトリ `yairorian-stack/wutowurk`、ブランチ `codex/growth-portal-finance`、Node.js Web Serviceを選びます。`render.yaml` はFree候補の設定ファイルで、存在するだけではサービスは作成されません。有料プランの申込・カード登録は自動で行いません。Freeの休止・制限は少人数試験で確認してください。

ビルド: `npm ci && npm run build`。起動: `npm run start -- --port $PORT`。ヘルスチェック: `/login`。

| サーバーの環境変数 | 設定内容 |
| --- | --- |
| SUPABASE_URL | 対象プロジェクトのHTTPS URL |
| SUPABASE_PUBLISHABLE_KEY | publishableキー（secret/service_roleは禁止） |
| PORTAL_ORIGIN | Render以外のホストや独自ドメインでは実際のHTTPS originを指定 |

Renderの場合は自動のRENDER_EXTERNAL_URLを使うため、最初のURLを手作業で転記する必要はありません。環境変数はサーバーの設定欄へ入力し、Gitに保存しません。

公開URL確定後、Supabase Authentication → URL ConfigurationのSite URLをそのoriginにし、Redirect URLsに **そのorigin + `/auth/callback`** を完全一致で追加します。ワイルドカードや他サイトへの転送は許可しません。初期セットアップ時にOAuthエラーが出た場合、コード・トークン付きURLを共有せず、秘密情報を除いたエラー種類だけを確認します。

### 4. 2名でログインを検証

登録済みの氏名とGoogleメールを入力し、そのGoogleアカウントを選びます。Google上の表示名を社内の登録氏名として勝手に使いません。Googleの画面で別のアカウントを選んだ場合、未登録・停止済み・氏名不一致の場合は社内画面へ入れません。指定の管理者と本店店長で、見える設定・店舗が正しいことを確認します。

Google Testingのテストユーザー指定も忘れずに行います。Authにユーザーが存在することだけでは、許可リストや管理者権限の設定完了を意味しません。

## 保護の仕組み

OAuth開始は同一OriginのPOSTに限定します。ログインの氏名・メールとPKCE verifierを短期のHTTPOnly Cookieで保持し、Googleから戻ったコードを同じブラウザーで交換します。callbackの転送先は固定の同一サイト内だけです。エラーのコードやトークンは画面・ログへ出しません。CookieはHTTPS時Secure・SameSite=Laxです。

各ページ・管理APIはSupabaseのgetUserとDB内のGoogle/許可リスト判定を行います。許可取り消しは既存セッションにも次のリクエストから適用します。DBのRLSにも同じ条件があり、公開APIを直接呼んで画面の判定を迂回できません。一般アカウントには許可リストのSELECT/INSERT/UPDATE/DELETE権限がありません。管理操作の権限と監査記録、最後の管理者の保護を維持します。

すでに本人が閲覧・保存した内容まで回収するものではありません。他社OAuthやメールidentityが連携されたアカウント、またはJWTのproviderがGoogle以外のアカウントは厳格な判定で拒否します。汎用的なoauth AMRを他社OAuthのセッションで使い回せないよう、Google以外のidentityがないこともDBで確認します。許可を緩めたり既存アカウントを削除したりせず、実ログイン時の認証情報を所有者側で確認してください。

## 残っている業務機能の制限

**Googleログインが動いても、売上・週次目標・シフト・自己評価の共有DB化は未実装です。** 保存する業務データはユーザーごと・端末ごとの試作品の機能です。許可した2名のログイン/閲覧試験から開始し、共有保存・バックアップ・店舗別DB権限の検証前に全スタッフの正式業務記録先へ切り替えないでください。

Airシフトの自動取得、公式PDFによるゴミ出し予定の検証、GASの本番通知も未接続です。メール送信失敗の調査はGoogle方式のログイン開始条件から外しましたが、解決したとは扱いません。

## 検証

`npm run lint`、`npm run typecheck`、`npm test`、`npm run build`、`node scripts/build-pages.mjs`、`npm run test:auth`。

DBテストはPGliteのPostgreSQLで実際のRLS・権限・RPCを実行します。ブラウザーテストは本物のNext.jsとループバック限定の架空OAuthプロバイダーでPKCEを検証します。これらは実Googleアカウント・実Supabase・実ホストでの疎通成功を意味しません。
