# Seatline — マルチテナント型 座席予約サービス

[![CI](https://github.com/aliaksandr-yanchuk/event-booking-saas/actions/workflows/ci.yml/badge.svg)](https://github.com/aliaksandr-yanchuk/event-booking-saas/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[English](README.md) | 日本語

ライブイベント向けの座席指定予約サービスです(ポートフォリオ用のプロジェクト)。
主催者(テナント)ごとにイベントページを持ち、来場者は座席表から席を選んで決済し、
決済完了で予約が確定します。**同じ席が二重に予約されることは、同時にクリックしても起こりません。**

- **デモ:** [event-booking-saas.vercel.app](https://event-booking-saas.vercel.app)
  (デモデータは毎週月曜にリセットされます。名前とメールアドレスは架空のもので構いません)
- **主催者ダッシュボード:** [`/login`](https://event-booking-saas.vercel.app/login)(デモアカウントはログイン画面に表示)
- **API:** [`/api/v1/openapi.json`](https://event-booking-saas.vercel.app/api/v1/openapi.json)(OpenAPI 3.1)

![席の選択から決済、QRコード付きチケットまでの流れ](docs/demo.webp)

## このプロジェクトで示していること

| 分野                     | 内容                                                                                                                             |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| データ設計・バックエンド | PostgreSQL + Prisma 7、テナント単位のリポジトリ、型付きの結果を返すトランザクション処理                                          |
| 同時実行制御             | 二重予約を DB の一意制約で防止。10件の同時リクエストで1件だけ成功することをテストで証明                                          |
| 決済                     | 期限付きの座席確保、決済プロバイダーのインターフェース(Stripe / デモ)、冪等な決済確定、期限後の入金と返金                        |
| REST API                 | バージョン付き JSON API、RFC 9457 形式のエラー、Zod スキーマから生成する OpenAPI、`Idempotency-Key`、レート制限、ETag            |
| 認証・権限               | DB セッション、scrypt によるパスワードハッシュ、オーナー / 受付スタッフの権限をデータアクセス層で判定、QR コードでの入場チェック |
| メール                   | トランザクショナル・アウトボックス、`after()` による応答後の送信、`SKIP LOCKED` での取得と再送、署名付きの予約管理リンク         |
| フロントエンド           | Next.js 16 App Router(Cache Components、Partial Prefetching)、React 19 Server Actions、JavaScript なしでも動くフォーム           |
| セキュリティ             | CSP などのセキュリティヘッダー、オープンリダイレクト・CSV インジェクション・タイミング攻撃への対策                               |
| テスト                   | Jest(単体・実 DB での結合)、Playwright E2E(PC・スマホ)、axe-core による WCAG 2.2 自動チェック、stripe-mock                       |
| 運用                     | Docker マルチステージビルド、GitHub Actions CI、Vercel + Neon へのデプロイ、デモデータの定期リセット                             |

## 技術スタック

Next.js 16.4 / React 19.3 / TypeScript / Tailwind CSS 4 / PostgreSQL 17 / Prisma 7 / Zod 4 /
Stripe / Resend / Jest 30 / Playwright / Docker / GitHub Actions / Node.js 24

## 主な設計判断

詳細と、検討して採用しなかった案は [`docs/decisions.md`](docs/decisions.md)(英語)にまとめています。

**二重予約は仕組みとして起こらない。** `booking_seats.seat_id` に一意制約があります。
空席チェックはエラーメッセージを分かりやすくするためだけのもので、正しさはチェックに依存しません。
2件のリクエストが同時にチェックを通っても、2件目の INSERT は失敗し、トランザクションごとロールバックされます。

**決済中の座席確保も同じ一意制約で守る。** 有料の予約は `PENDING` として作られ、確定済みの予約と同じく
座席の行を持つため、同じ一意制約で保護されます。確保期間は 35 分(Stripe Checkout の最短 30 分 + 余裕)です。
期限切れの確保は、その席を予約しようとする次のトランザクションの中で解放されるため、正しさのためのバッチ処理は不要です。
決済の確定はすべて `UPDATE … WHERE status = <期待する状態>` で行うため、Webhook・戻り画面・リトライのどこから
同じ決済が報告されても安全です。確保期限後に入金があった場合は、席が空いていれば確定し、埋まっていれば返金します。

**リトライを安全にする `Idempotency-Key`。** 一意制約だけでも二重予約は防げますが、通信が切れて再送した
お客様には「席はすでに予約済み」と返ってしまいます。キーを予約と同じトランザクションで保存することで、
再送には最初の予約をそのまま返します。

**権限はデータの近くで判定する。** ダッシュボードのすべてのページ、Server Action、Route Handler が
データアクセス層を通り、クエリは URL ではなく所属情報(メンバーシップ)の主催者 ID で絞り込みます。
`proxy.ts` はセッション Cookie がない場合にログイン画面へ送るだけで、DB は参照しません。

**メールはアウトボックス経由。** 予約の変更とメールの行を同じトランザクションで書き込むため、
確定した予約には必ずメールが届き、競合に負けた予約からは送られません。送信はレスポンスの後
(`after()`)に行い、`FOR UPDATE SKIP LOCKED` で取得するので、並行して動いても同じメールを二重に送りません。

**静的レンダリングを保ったセキュリティヘッダー。** nonce 方式の CSP はページを毎回レンダリングする必要があり、
Cache Components の静的シェルが使えなくなります。そのため nonce を使わない CSP にし、その理由を記録しています。

## テスト

| 種類             | コマンド                            | 内容                                                                                   |
| ---------------- | ----------------------------------- | -------------------------------------------------------------------------------------- |
| 単体             | `npm test`                          | 金額・入力検証・パスワード・署名付きリンク・CSV・メールテンプレート・予約フォームなど  |
| 結合             | `npm run test:integration`          | 実際の PostgreSQL で予約・決済・メール送信・レート制限・テナント分離・同時実行を検証   |
| E2E              | `npm run test:e2e`                  | 予約・決済・キャンセル・返金・メール・ダッシュボードの一連の操作(PC とスマホ)          |
| API              | `npm run test:e2e -- --project=api` | 実 HTTP でのステータスコード・ヘッダー・エラー形式・同時予約(Zod スキーマで契約テスト) |
| アクセシビリティ | `npx playwright test accessibility` | axe-core で全ページ種別を WCAG 2.2 A/AA でチェック(ライト・ダークモード)               |

テストで見つかった不具合(フォームのリセットで選択が消える、スマホで横幅がはみ出す、
冪等キーの競合で自分の予約が「予約済み」と返る、など)は [README](README.md#bugs-the-tests-found-during-development) に記録しています。

Lighthouse(イベントページ、本番ビルド): モバイル Performance 97 / Accessibility 100 /
Best Practices 100 / CLS 0。SEO が 91 なのは Next.js 16 のメタデータのストリーミングによるもので、
理由を [README](README.md#performance) に書いています。

## ローカルでの起動

必要なもの: Node.js 24(`nvm use`)、Docker

```bash
npm install
cp .env.example .env
npm run db:up            # PostgreSQL と stripe-mock を Docker で起動
npx prisma migrate deploy
npm run db:seed          # デモ用の主催者・イベント・アカウント
npm run dev              # http://localhost:3000
```

Stripe と Resend のキーは任意です。設定しない場合は、アプリ内のデモ決済画面とデモ受信箱が使われ、
決済後・メール送信後の処理は本番と同じコードで動きます。

## AI の活用について

Claude Code をペアプログラマーとして使って開発しました。エージェントが従うルール
(API を使う前に同梱の Next.js 16 ドキュメントを読む、クエリは必ずテナントで絞り込む、
振る舞いはテストで証明する、など)は [AGENTS.md](AGENTS.md) にあります。生成されたコードはすべてレビューし、
上記の不具合はテストを実行して見つけ、原因を特定したものです。
