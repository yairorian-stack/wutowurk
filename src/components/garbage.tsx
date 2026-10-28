"use client";
import { Bell, ExternalLink, Trash2 } from "lucide-react";
import {
  ANAN_GARBAGE_URL,
  garbageCategories,
  garbageReminderDate,
  garbageWeekday,
  novemberGarbageFixture,
} from "@/lib/garbage";
export function Garbage() {
  return (
    <>
      <div className="page-intro">
        <div>
          <p className="eyebrow">HONTEN / COLLECTION REMINDERS</p>
          <h1>本店のゴミ出し</h1>
          <p className="muted">18番地区：福井・後戸・鵠</p>
        </div>
        <Trash2 size={32} />
      </div>
      <section className="panel garbage-status">
        <span className="finance-connection-badge">自動通知は未稼働</span>
        <h2>収集日の前日、17時・19時にお知らせ</h2>
        <p>
          メール・LINE通知の実行コードを準備しています。現在このポータルから通知は送信していません。
        </p>
        <a
          className="button secondary"
          href={ANAN_GARBAGE_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          阿南市の公式予定表を確認
          <ExternalLink size={16} />
        </a>
        <p className="local-data-note">
          以下はご提供の2026年11月の照合用日程です。公式PDFとの確認は未完了です。確定した収集予定として使う前に公式情報をご確認ください。10月の日程は未受領です。
        </p>
        <p className="small muted">
          店舗から出る事業系ごみの扱い・利用条件は、市の案内をご確認ください。収集対象の場合は、当日の朝8時までに出してください。
        </p>
      </section>
      <section className="panel garbage-calendar">
        <div className="section-heading">
          <div>
            <p className="eyebrow">NOVEMBER 2026 / REVIEW DATA</p>
            <h2>11月の収集日と通知予定</h2>
          </div>
          <Bell size={24} />
        </div>
        <p>
          同日の収集品目は、各通知時刻につき1通にまとめます。時刻はすべて日本時間です。古紙は対象外です。
        </p>
        <ol className="garbage-events">
          {novemberGarbageFixture.map((event) => (
            <li key={event.date}>
              <div className="garbage-event-date">
                <strong>11/{Number(event.date.slice(8))}</strong>
                <span>（{garbageWeekday(event.date)}）</span>
              </div>
              <div>
                <h3>
                  {event.categories
                    .map((id) => garbageCategories[id].label)
                    .join("・")}
                </h3>
                <p className="small muted">
                  前日通知：{garbageReminderDate(event.date)}（
                  {garbageWeekday(garbageReminderDate(event.date))}）17:00 /
                  19:00
                </p>
                {event.categories.map((id) => (
                  <details className="garbage-separation" key={id}>
                    <summary>
                      {garbageCategories[id].label}の分別 / Tiếng Việt
                    </summary>
                    <p>{garbageCategories[id].ja}</p>
                    <p lang="vi">
                      {garbageCategories[id].vi}：
                      {garbageCategories[id].explanationVi}
                    </p>
                  </details>
                ))}
              </div>
            </li>
          ))}
        </ol>
        <p className="local-data-note">
          分別説明は通知文の案です。公式の分別ルールとの照合が済んでから、本番配信を有効にします。
        </p>
      </section>
      <section className="panel garbage-status">
        <h2>読み取り結果・通知履歴</h2>
        <p>
          Google Apps
          Scriptへの接続前のため、実際の取得結果・送信履歴はまだ表示できません。本番用コードでは、非公開の管理用スプレッドシートへ記録します。
        </p>
        <p className="small muted">
          PDFの年月・地区番号・表の構造を確認できない場合は収集通知を止め、管理者へ警告します。試験用日程を本番の代わりには使いません。
        </p>
      </section>
    </>
  );
}
