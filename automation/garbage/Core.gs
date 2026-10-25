/* Pure functions only. No credentials, recipients, network calls or GAS services. */
var WWGarbageCore = (function () {
  "use strict";
  var SOURCE = "https://www.city.anan.tokushima.jp/docs/2025071000030/";
  var TYPES = ["plastic", "cans", "pet", "glass", "nonburn", "bulky"];
  var TEXT = {
    plastic: ["プラ容器包装", "Bao bì, hộp nhựa", "中身を使い切り、汚れを落として分別してください。", "Dùng hết sản phẩm, làm sạch bao bì nhựa rồi phân loại."],
    cans: ["カン", "Lon kim loại", "中身を空にして、すすいでください。", "Đổ hết chất bên trong và tráng sạch lon."],
    pet: ["ペットボトル", "Chai nhựa PET", "キャップ・ラベルを外し、中をすすいでください。", "Tháo nắp và nhãn, rồi tráng sạch bên trong chai PET."],
    glass: ["ビン", "Chai, lọ thủy tinh", "中をすすぎ、キャップは素材ごとに分別してください。", "Tráng sạch bên trong và phân loại nắp theo chất liệu."],
    nonburn: ["不燃", "Rác không cháy", "危険物や事業系ごみを混ぜず、市の分別方法を確認してください。", "Không trộn chất nguy hiểm hoặc rác thải kinh doanh; hãy kiểm tra hướng dẫn của thành phố."],
    bulky: ["粗大", "Rác cồng kềnh", "対象品目と出し方を市の案内で確認してください。", "Kiểm tra loại đồ được thu gom và cách đưa rác ra theo hướng dẫn của thành phố."]
  };
  function norm(value) { return String(value).normalize("NFKC").replace(/[\s　]/g, ""); }
  function validDate(date) {
    var d = new Date(date + "T00:00:00Z");
    return /^\d{4}-\d{2}-\d{2}$/.test(date) && isFinite(d.getTime()) && d.toISOString().slice(0, 10) === date;
  }
  function addDays(date, n) {
    if (!validDate(date)) throw new Error("INVALID_DATE");
    var d = new Date(date + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
  }
  function weekday(date) { return "日月火水木金土".charAt(new Date(date + "T00:00:00Z").getUTCDay()); }
  function monthFromBody(body) {
    var text = norm(body), found = {}, re = /(?:(20\d{2})年|令和(\d{1,2}|元)年)(\d{1,2})月/g, m;
    while ((m = re.exec(text))) {
      var year = m[1] ? Number(m[1]) : 2018 + (m[2] === "元" ? 1 : Number(m[2]));
      var month = Number(m[3]);
      if (month < 1 || month > 12) throw new Error("INVALID_BODY_MONTH");
      found[year + "-" + String(month).padStart(2, "0")] = true;
    }
    var months = Object.keys(found);
    if (months.length !== 1) throw new Error("AMBIGUOUS_BODY_MONTH");
    return months[0];
  }
  function headerTypes(label) {
    var n = norm(label), names = {
      "プラ容器包装": ["plastic"], "プラスチック製容器包装": ["plastic"], "容器包装プラスチック": ["plastic"],
      "カン": ["cans"], "缶": ["cans"], "ペットボトル": ["pet"], "ビン": ["glass"], "びん": ["glass"],
      "不燃": ["nonburn"], "不燃ごみ": ["nonburn"], "粗大": ["bulky"], "粗大ごみ": ["bulky"],
      "不燃・粗大": ["nonburn", "bulky"], "不燃ごみ・粗大ごみ": ["nonburn", "bulky"]
    };
    return Object.prototype.hasOwnProperty.call(names, n) ? names[n] : [];
  }
  function datesInCell(raw, month) {
    var text = norm(raw).replace(/[（]/g, "(").replace(/[）]/g, ")");
    if (/^(?:-|—|―|なし|収集なし)$/.test(text)) return [];
    if (!text) throw new Error("EMPTY_DATE_CELL");
    var out = [], re = /(\d{1,2})日?(?:\(([日月火水木金土])(?:曜(?:日)?)?\))?/g, m, remainder = text;
    while ((m = re.exec(text))) {
      var date = month + "-" + String(Number(m[1])).padStart(2, "0");
      if (!validDate(date) || (m[2] && m[2] !== weekday(date))) throw new Error("INVALID_COLLECTION_DAY");
      if (out.indexOf(date) !== -1) throw new Error("DUPLICATE_COLLECTION_DAY");
      out.push(date); remainder = remainder.replace(m[0], "");
    }
    if (!out.length || remainder.replace(/[・,、/]/g, "")) throw new Error("AMBIGUOUS_DATE_CELL");
    return out.sort();
  }
  function extract(input) {
    var month = monthFromBody(input.body), matches = [];
    if (!Array.isArray(input.tables)) throw new Error("NO_STRUCTURED_TABLES");
    input.tables.forEach(function (table) {
      table.forEach(function (header, hi) {
        if (!Array.isArray(header) || !/^(地区番号|番号)$/.test(norm(header[0])) || !/^(地区名|地区)$/.test(norm(header[1]))) return;
        var mapped = header.map(headerTypes), seen = {};
        mapped.forEach(function (ids) { ids.forEach(function (id) { seen[id] = (seen[id] || 0) + 1; }); });
        if (!TYPES.every(function (id) { return seen[id] === 1; })) throw new Error("UNRECOGNIZED_COLUMNS");
        table.slice(hi + 1).forEach(function (row) {
          if (norm(row[0]) !== "18") return;
          if (row.length !== header.length || !["福井", "後戸", "鵠"].every(function (name) { return norm(row[1]).indexOf(name) !== -1; })) throw new Error("DISTRICT_STRUCTURE_CHANGED");
          var byDate = {};
          mapped.forEach(function (ids, ci) {
            if (!ids.length) return;
            datesInCell(row[ci], month).forEach(function (date) {
              if (!byDate[date]) byDate[date] = [];
              ids.forEach(function (id) { byDate[date].push(id); });
            });
          });
          var events = Object.keys(byDate).sort().map(function (date) { return { date: date, categories: TYPES.filter(function (id) { return byDate[date].indexOf(id) !== -1; }) }; });
          if (!events.length) throw new Error("NO_COLLECTION_EVENTS");
          matches.push({ month: month, district: 18, events: events, layout: header.map(norm).join("|") });
        });
      });
    });
    if (matches.length !== 1) throw new Error("DISTRICT_NOT_UNIQUE");
    return matches[0];
  }
  function slots(event) {
    var previous = addDays(event.date, -1);
    return [17, 19].map(function (hour) { return { collectionDate: event.date, categories: event.categories, local: previous + "T" + hour + ":00:00+09:00", utc: new Date(previous + "T" + hour + ":00:00+09:00").toISOString() }; });
  }
  function jstDate(now) { return new Date(new Date(now).getTime() + 9 * 3600000).toISOString().slice(0, 10); }
  function timing(slot, now) {
    var seconds = Math.floor((new Date(now).getTime() - new Date(slot.utc).getTime()) / 1000);
    return { state: seconds < 0 ? "future" : seconds < 300 ? "due" : "missed", lateSeconds: Math.max(0, seconds) };
  }
  function message(event, lang, pdfUrl) {
    if (!validDate(event.date) || !event.categories.length || !event.categories.every(function (id) { return TYPES.indexOf(id) !== -1; })) throw new Error("INVALID_EVENT");
    var ja = lang === "ja", dayVi = ["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"][new Date(event.date + "T00:00:00Z").getUTCDay()];
    var lines = [ja ? "【WUTO-WURK 本店】明日のゴミ出し" : "【WUTO-WURK】Lịch đổ rác ngày mai", ja ? event.date + "（" + weekday(event.date) + "）18番地区（福井・後戸・鵠）" : event.date + " (" + dayVi + ") — Khu vực số 18（福井・後戸・鵠）"];
    event.categories.forEach(function (id) { lines.push("・" + TEXT[id][ja ? 0 : 1] + "：" + TEXT[id][ja ? 2 : 3]); });
    lines.push(ja ? "収集日の朝8時までに出してください。事業系ごみの対象・出し方は市の案内をご確認ください。" : "Hãy đưa rác ra trước 8 giờ sáng ngày thu gom. Đối với rác thải kinh doanh, hãy kiểm tra điều kiện và cách xử lý theo hướng dẫn của thành phố.");
    lines.push(ja ? "公式情報：" + SOURCE : "Thông tin chính thức: " + SOURCE);
    if (pdfUrl) lines.push("PDF: " + pdfUrl);
    return lines.join("\n");
  }
  function discoverLinks(html) {
    var found = {}, re = /href\s*=\s*["']([^"']+)["']/gi, m;
    while ((m = re.exec(html))) {
      var url = m[1].replace(/&amp;/g, "&").split("#")[0];
      if (!/\.pdf(?:\?|$)/i.test(url)) continue;
      if (url.slice(0, 2) === "//") url = "https:" + url;
      else if (url.charAt(0) === "/") url = "https://www.city.anan.tokushima.jp" + url;
      else if (!/^https:\/\//i.test(url)) url = SOURCE + url;
      if (!/^https:\/\/www\.city\.anan\.tokushima\.jp\/[a-zA-Z0-9_./%?=&+~()\-]+$/.test(url) || /\/\.\.?\//.test(url)) throw new Error("UNTRUSTED_PDF_LINK");
      found[url] = true;
    }
    var links = Object.keys(found);
    if (!links.length || links.length > 20) throw new Error("PDF_LINKS_CHANGED");
    return links;
  }
  return { SOURCE: SOURCE, TYPES: TYPES, extract: extract, monthFromBody: monthFromBody, datesInCell: datesInCell, slots: slots, jstDate: jstDate, timing: timing, message: message, discoverLinks: discoverLinks, addDays: addDays };
})();
