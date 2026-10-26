"use client";
import { useEffect, useState } from "react";
import { Download, Upload, Save } from "lucide-react";
import {
  IMPORTED_SALES_KEY,
  parseImportedSales,
  readInitialSales,
  salesMonthSummary,
  type ImportedSales,
  type SalesScope,
} from "@/lib/imported-sales";
import { stores } from "@/lib/domain";
import { yen } from "@/lib/finance";
import { downloadText } from "@/lib/download";
import { scopedStorageKey } from "@/lib/browser-storage";

export function ImportedSalesPanel({
  scope,
  onAvailable,
  sharedData,
}: {
  scope: SalesScope;
  onAvailable: (value: boolean) => void;
  sharedData?: ImportedSales;
}) {
  const [initial] = useState(() => sharedData ? { data: sharedData, error: "" } : readInitialSales());
  const [localData, setData] = useState(initial.data);
  const data = sharedData ?? localData;
  const [message, setMessage] = useState("");
  const [error, setError] = useState(initial.error);
  const [month, setMonth] = useState(initial.data?.asOf.slice(0, 7) ?? "");
  useEffect(() => {
    onAvailable(data !== null);
  }, [data, onAvailable]);
  async function load(file: File | undefined) {
    if (!file) return;
    try {
      if (file.size > 2_000_000)
        throw new Error("売上ファイルは2MB以内にしてください");
      const next = parseImportedSales(await file.text());
      setData(next);
      setMonth(next.asOf.slice(0, 7));
      setError("");
      setMessage(
        "ファイルを読み込みました。この端末に保存するまで、一時表示です。",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込めませんでした");
    }
  }
  function save() {
    try {
      localStorage.setItem(scopedStorageKey(IMPORTED_SALES_KEY), JSON.stringify(data));
      setMessage(
        "このブラウザーに保存しました。他の端末やスタッフには共有されません。バックアップも保存してください。",
      );
      setError("");
    } catch {
      setError(
        "保存できませんでした。バックアップをダウンロードしてください。",
      );
    }
  }
  const summary = data ? salesMonthSummary(data, month, scope) : null;
  const months = [
    ...new Set(
      data?.rows
        .filter((r) => r.date <= data.asOf)
        .map((r) => r.date.slice(0, 7)) ?? [],
    ),
  ].sort();
  return (
    <section
      className="panel imported-sales"
      aria-labelledby="imported-sales-title"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">REPORTED SALES</p>
          <h2 id="imported-sales-title">{sharedData ? "実績売上の集計" : "提供データの売上記録"}</h2>
        </div>
        <Upload size={22} />
      </div>
      {sharedData ? <p>提供された実績を反映済みです。集計基準日までの売上を、店舗を切り替えて確認できます。</p> : <><p>
        実売上はサンプルと分けて記録します。ファイルの内容はサーバーへ送信せず、この端末で読み込みます。
      </p>
      <p className="small muted">
        別ファイルを読み込むと表示を全件入れ替えます。「この端末に保存」で保存済みデータも置き換わるため、先にバックアップを保管してください。
      </p>
      <label className="local-file-label">
        売上ファイルを読み込む（JSON）
        <input
          type="file"
          accept=".json,application/json"
          onChange={(e) => {
            void load(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label></>}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="local-data-message">
          {message}
        </p>
      )}
      {data && summary && (
        <>
          <div className="local-data-toolbar">
            <label>
              売上の対象月
              <select value={month} onChange={(e) => setMonth(e.target.value)}>
                {months.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
            {!sharedData && <><button className="button primary" onClick={save}>
              <Save size={17} />
              この端末に保存
            </button>
            <button
              className="button secondary"
              onClick={() =>
                downloadText(
                  "WUTO-WURK-売上バックアップ.json",
                  JSON.stringify(data, null, 2),
                )
              }
            >
              <Download size={17} />
              バックアップ
            </button></>}
          </div>
          <p className="small muted">
            出典：{data.source} ／ 集計基準日：{data.asOf} ／ 表示：
            {scope === "all"
              ? "全店舗"
              : stores.find((s) => s.id === scope)?.short}
          </p>
          <dl className="local-kpis">
            <div>
              <dt>記入済み売上の月累計</dt>
              <dd data-testid="imported-sales-total">
                {summary.entered ? yen(summary.total) : "未入力"}
              </dd>
            </div>
            <div>
              <dt>昨年対比（提供値）</dt>
              <dd>
                {summary.reportedYoy == null
                  ? "—"
                  : `${summary.reportedYoy.toFixed(1)}%`}
              </dd>
            </div>
            <div>
              <dt>売上が空欄の店舗・日</dt>
              <dd>
                {summary.missing}
                <small>件</small>
              </dd>
            </div>
          </dl>
          <p className="local-data-note">
            空欄は休業・0円と断定していません。月累計は記入済み売上の合計です。昨年対比は表の月累計に対する提供値をそのまま表示し、全社の割合は算出しません。現金・キャッシュレス内訳と労働時間は未提供のため、出納帳残高・人時売上高には加算しません。
          </p>
          <div
            className="local-table-scroll"
            role="region"
            aria-label="日別売上表"
            tabIndex={0}
          >
            <table className="local-table">
              <caption>
                {month} 日別売上・月累計（{summary.lastDate ?? "—"}まで）
              </caption>
              <thead>
                <tr>
                  <th rowSpan={2} scope="col">
                    日付
                  </th>
                  {stores
                    .filter((s) => scope === "all" || s.id === scope)
                    .map((s) => (
                      <th key={s.id} colSpan={3} scope="colgroup">
                        {s.short}
                      </th>
                    ))}
                </tr>
                <tr>
                  {stores
                    .filter((s) => scope === "all" || s.id === scope)
                    .flatMap((s) =>
                      ["売上高", "月累計", "昨年対比"].map((label) => (
                        <th key={`${s.id}-${label}`} scope="col">
                          {label}
                        </th>
                      )),
                    )}
                </tr>
              </thead>
              <tbody>
                {summary.rows.map((r) => (
                  <tr key={r.date}>
                    <th scope="row">{r.date.slice(5).replace("-", "/")}</th>
                    {stores
                      .filter((s) => scope === "all" || s.id === scope)
                      .map((s) => (
                        <SalesCells key={s.id} values={r[s.id]} />
                      ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!sharedData && <p className="small muted">
            ブラウザーのデータ削除・端末変更で記録を失う場合があります。バックアップを保管してください。共有・権限制御には非公開の保存先が必要です。
          </p>}
        </>
      )}
    </section>
  );
}
function SalesCells({
  values,
}: {
  values: ImportedSales["rows"][number]["honten"];
}) {
  return (
    <>
      <td className={values.sales == null ? "muted" : undefined}>
        {values.sales == null ? "未入力" : yen(values.sales)}
      </td>
      <td>{values.cumulative == null ? "—" : yen(values.cumulative)}</td>
      <td>
        {values.reportedYoy == null ? "—" : `${values.reportedYoy.toFixed(1)}%`}
      </td>
    </>
  );
}
