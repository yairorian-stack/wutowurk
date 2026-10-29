"use client";
import { useState, type FormEvent } from "react";
import {
  CalendarDays,
  Clock3,
  Download,
  ExternalLink,
  Users,
} from "lucide-react";
import { addDays, stores, today, type StoreId } from "@/lib/domain";
import { monthDays, monthDates } from "@/lib/finance";
import {
  AIRSHIFT_URL,
  SHIFT_CSV_TEMPLATE,
  parseShiftCsv,
  shiftTime,
  shiftTotals,
  timeMinutes,
  validateShifts,
  type Shift,
} from "@/lib/shifts";
import { downloadText } from "@/lib/download";
import { csvText } from "@/lib/csv";
import { ShiftSnapshot } from "./shift-snapshot";

export function Shifts({ scope }: { scope: StoreId | "all" }) {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [month, setMonth] = useState(today().slice(0, 7));
  const [date, setDate] = useState(today());
  const [importedAt, setImportedAt] = useState("");
  const [error, setError] = useState("");
  const [sample, setSample] = useState(false);
  const [manualError, setManualError] = useState("");
  function addManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    try {
      const next = validateShifts([
        ...(sample ? [] : shifts),
        {
          storeId: scope === "all" ? values.get("store") : scope,
          date: values.get("date"),
          label: values.get("label"),
          start: timeMinutes(String(values.get("start"))),
          end: timeMinutes(String(values.get("end")), true),
          breakMinutes: Number(values.get("rest")),
        },
      ]);
      setShifts(next);
      setSample(false);
      setManualError("");
      const d = String(values.get("date"));
      setDate(d);
      setMonth(d.slice(0, 7));
      setImportedAt(
        new Intl.DateTimeFormat("ja-JP", {
          timeZone: "Asia/Tokyo",
          dateStyle: "short",
          timeStyle: "short",
        }).format(new Date()),
      );
    } catch (e) {
      setManualError(
        e instanceof Error ? e.message : "勤務予定を追加できません",
      );
    }
  }
  function backup() {
    const textTime = (m: number) =>
      `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    downloadText(
      `${sample ? "確認用-" : ""}WUTO-WURK-シフト.csv`,
      csvText(
        ["店舗", "日付", "表示名", "開始", "終了", "休憩分"],
        shifts.map((s) => [
          s.storeId,
          s.date,
          s.label,
          textTime(s.start),
          textTime(s.end),
          s.breakMinutes,
        ]),
      ),
      "text/csv;charset=utf-8",
    );
  }
  const visible = shifts.filter(
    (s) => s.date.startsWith(month) && (scope === "all" || s.storeId === scope),
  );
  const totals = shiftTotals(visible),
    days = monthDates(month, monthDays(month));
  const offset = (new Date(`${month}-01T00:00:00Z`).getUTCDay() + 6) % 7;
  const selected = visible.filter((s) => s.date === date);
  const minHour = Math.min(8, ...selected.map((s) => Math.floor(s.start / 60)));
  const maxHour = Math.max(22, ...selected.map((s) => Math.ceil(s.end / 60)));
  async function load(file: File | undefined) {
    if (!file) return;
    try {
      if (file.size > 1_000_000)
        throw new Error("シフトCSVは1MB以内にしてください");
      const next = parseShiftCsv(await file.text());
      setShifts(next);
      setMonth(next[0].date.slice(0, 7));
      setDate(next[0].date);
      setImportedAt(
        new Intl.DateTimeFormat("ja-JP", {
          timeZone: "Asia/Tokyo",
          dateStyle: "short",
          timeStyle: "short",
        }).format(new Date()),
      );
      setSample(false);
      setError("");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "読み込みに失敗しました。表示中の予定は変更していません。",
      );
    }
  }
  function changeMonth(value: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return;
    setMonth(value);
    setDate(`${value}-01`);
  }
  function showSample() {
    const d = today();
    setShifts(
      parseShiftCsv(
        `店舗,日付,表示名,開始,終了,休憩分\n本店,${d},スタッフA,10:00,16:00,30\n本店,${d},スタッフB,16:00,22:00,30\n羽ノ浦店,${d},スタッフC,11:00,17:00,45\n羽ノ浦店,${d},スタッフD,17:00,23:00,30\n本店,${addDays(d, 1)},スタッフA,10:00,16:00,30`,
      ),
    );
    setMonth(d.slice(0, 7));
    setDate(d);
    setSample(true);
    setImportedAt("");
    setError("");
  }
  return (
    <>
      <div className="page-intro">
        <div>
          <p className="eyebrow">OUR TEAM / SHIFT CALENDAR</p>
          <h1>チームのシフト</h1>
          <p className="muted">
            {scope === "all"
              ? "2店舗"
              : stores.find((s) => s.id === scope)?.short}
            の勤務予定を、ひと目で。
          </p>
        </div>
        <CalendarDays size={32} />
      </div>
      <section className="panel shift-connection" aria-label="シフト連携状況">
        <div>
          <span className="finance-connection-badge">Airシフト未接続</span>
          <h2>羽ノ浦店の勤務予定</h2>
          <p>
            Airシフトからの自動取得は、まだ設定されていません。下のボタンで元のシフト画面を開けます。
          </p>
        </div>
        <a
          className="button secondary"
          href={AIRSHIFT_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          Airシフトを開く
          <ExternalLink size={16} />
        </a>
        <p className="small muted">
          このリンクを開いてもポータルへ自動同期されません。ログインが必要な場合はAirシフト側で行ってください。
        </p>
      </section>
      <ShiftSnapshot scope={scope} />
      <details className="panel shift-import">
        <summary>
          紙のシフトを入力する <small>本店 / 1件ずつ追加</small>
        </summary>
        <p>
          本店の紙の予定表を転記できます。追加は画面内だけに反映し、離れる前にCSVで控えを保存してください。
        </p>
        {sample && (
          <p className="local-data-note">
            予定を追加すると、架空のサンプルを閉じて入力した予定だけに切り替えます。
          </p>
        )}
        <form className="shift-manual" onSubmit={addManual}>
          {scope === "all" ? (
            <label>
              勤務店舗
              <select name="store" defaultValue="honten">
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.short}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p>勤務店舗：{stores.find((s) => s.id === scope)?.short}</p>
          )}
          <label>
            勤務日
            <input name="date" type="date" defaultValue={today()} required />
          </label>
          <label>
            スタッフ表示名
            <input
              name="label"
              maxLength={50}
              placeholder="例：スタッフA"
              required
            />
          </label>
          <label>
            勤務開始
            <input name="start" type="time" required />
          </label>
          <label>
            勤務終了（翌日は25:00など）
            <input
              name="end"
              placeholder="18:00"
              required
              pattern="[0-9]{1,2}:[0-9]{2}"
            />
          </label>
          <label>
            休憩（分）
            <input
              name="rest"
              type="number"
              min={0}
              max={1439}
              step={1}
              defaultValue={0}
              required
            />
          </label>
          <button className="button primary" type="submit">
            勤務予定を追加
          </button>
        </form>
        {manualError && (
          <p className="form-error" role="alert">
            {manualError}
          </p>
        )}
      </details>
      <details className="panel shift-import" open={!shifts.length}>
        <summary>
          勤務予定を読み込む <small>CSV / 一時表示</small>
        </summary>
        <p>
          店舗・日付・表示名・開始・終了・休憩分のCSVで、月間と日別の勤務予定を表示します。表示名はスタッフAなどの識別名を使えます。
        </p>
        <p className="local-data-note">
          読み込んだ予定はこの画面内だけで表示し、送信・自動保存しません。画面を離れると消えます。AirシフトのCSVを使う場合も、見本と同じ列に整えてください。
        </p>
        <div className="local-data-toolbar">
          <label className="local-file-label">
            シフトCSVを読み込む
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                void load(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          <button
            className="button secondary"
            onClick={() =>
              downloadText(
                "WUTO-WURK-シフト見本.csv",
                SHIFT_CSV_TEMPLATE,
                "text/csv;charset=utf-8",
              )
            }
          >
            <Download size={17} />
            CSV見本
          </button>
          <button className="button secondary" onClick={showSample}>
            架空のシフトで試す
          </button>
          {shifts.length > 0 && (
            <button
              className="text-button"
              onClick={() => {
                setShifts([]);
                setSample(false);
                setImportedAt("");
              }}
            >
              表示をクリア
            </button>
          )}
        </div>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
      </details>
      <section
        className="panel shift-overview"
        aria-labelledby="shift-calendar-title"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">MONTHLY OVERVIEW</p>
            <h2 id="shift-calendar-title">月間シフト</h2>
          </div>
          <label>
            シフト対象月
            <input
              type="month"
              aria-label="シフト対象月"
              value={month}
              onChange={(e) => changeMonth(e.target.value)}
            />
          </label>
        </div>
        <p className={sample ? "local-data-note" : "small muted"}>
          {sample
            ? "架空のサンプルです。実際の勤務予定ではありません。"
            : importedAt
              ? `この画面での更新日時：${importedAt}（日本時間）。Airシフト上の最終更新日時ではありません。`
              : "勤務予定は未取込です。人数・労働時間は未確定です。"}
        </p>
        <dl className="local-kpis">
          <div>
            <dt>
              <Users size={16} />
              表示中のスタッフ
            </dt>
            <dd>
              {visible.length ? totals.people : "—"}
              <small>人</small>
            </dd>
          </div>
          <div>
            <dt>
              <CalendarDays size={16} />
              勤務予定数
            </dt>
            <dd>
              {visible.length ? totals.count : "—"}
              <small>件</small>
            </dd>
          </div>
          <div>
            <dt>
              <Clock3 size={16} />
              予定労働時間（休憩除く）
            </dt>
            <dd>
              {visible.length ? (totals.minutes / 60).toFixed(1) : "—"}
              <small>時間</small>
            </dd>
          </div>
        </dl>
        {shifts.length > 0 && (
          <button className="button secondary" onClick={backup}>
            <Download size={17} />
            表示中の予定をCSV保存
          </button>
        )}
        <p className="small muted">
          記入済みの予定だけを集計します。予定のない日は「未登録」で、休業・欠員とは断定しません。予定時間は実労働時間や人時売上高へ自動加算しません。
        </p>
        <div className="shift-calendar">
          <div className="shift-weekdays" aria-hidden="true">
            {["月", "火", "水", "木", "金", "土", "日"].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="shift-days">
            {Array.from({ length: offset }, (_, i) => (
              <span key={`blank-${i}`} />
            ))}
            {days.map((d) => {
              const daily = visible.filter((s) => s.date === d),
                total = shiftTotals(daily);
              return (
                <button
                  key={d}
                  className={`shift-day${date === d ? " selected" : ""}${d === today() ? " today" : ""}`}
                  aria-label={`${d} ${daily.length ? `${total.people}人` : "未登録"}`}
                  aria-pressed={date === d}
                  onClick={() => setDate(d)}
                >
                  <strong>{Number(d.slice(8))}</strong>
                  <span>{daily.length ? `${total.people}人` : "—"}</span>
                  <small>
                    {daily.length
                      ? `${(total.minutes / 60).toFixed(1)}h`
                      : "未登録"}
                  </small>
                  {scope === "all" && daily.length > 0 && (
                    <i aria-hidden="true">
                      {[...new Set(daily.map((s) => s.storeId))].map((id) => (
                        <b className={`store-dot store-${id}`} key={id} />
                      ))}
                    </i>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </section>
      <section
        className="panel shift-daily"
        aria-labelledby="shift-daily-title"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">DAILY TIMELINE</p>
            <h2 id="shift-daily-title">{date} の勤務予定</h2>
          </div>
        </div>
        {selected.length ? (
          <>
            <div className="shift-time-labels" aria-hidden="true">
              <span>{shiftTime(minHour * 60)}</span>
              <span>{shiftTime(Math.round((minHour + maxHour) / 2) * 60)}</span>
              <span>{shiftTime(maxHour * 60)}</span>
            </div>
            <ul className="shift-timeline">
              {selected.map((s, i) => (
                <li key={`${s.storeId}-${s.label}-${s.start}-${i}`}>
                  <div className="shift-person">
                    <strong>{s.label}</strong>
                    <span className={`shift-store store-${s.storeId}`}>
                      {stores.find((v) => v.id === s.storeId)?.short}
                    </span>
                  </div>
                  <div className="shift-track" aria-hidden="true">
                    <span
                      className={`shift-bar store-${s.storeId}`}
                      style={{
                        left: `${((s.start / 60 - minHour) / (maxHour - minHour)) * 100}%`,
                        width: `${((s.end - s.start) / 60 / (maxHour - minHour)) * 100}%`,
                      }}
                    />
                  </div>
                  <p>
                    {shiftTime(s.start)}〜{shiftTime(s.end)}
                    <span>
                      休憩{s.breakMinutes}分 ／{" "}
                      {((s.end - s.start - s.breakMinutes) / 60) % 1 === 0
                        ? (s.end - s.start - s.breakMinutes) / 60
                        : ((s.end - s.start - s.breakMinutes) / 60).toFixed(1)}
                      時間
                    </span>
                  </p>
                </li>
              ))}
            </ul>
            <p className="small muted">
              バーは開始から終了までの時間帯です。休憩を取る時刻は未指定のため、バーには含まれます。深夜勤務は開始日へ計上します。
            </p>
          </>
        ) : (
          <div className="shift-empty">
            <CalendarDays size={28} />
            <p>この日の勤務予定は未登録です。</p>
            <span>月間カレンダーから日付を選べます。</span>
          </div>
        )}
      </section>
    </>
  );
}
