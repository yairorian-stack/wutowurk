/* Add alongside existing GAS files. Existing functions and triggers are not replaced. */
function wwgProperties_() { return PropertiesService.getScriptProperties(); }
function wwgErrorCode_(error) { var code = String(error && error.message || "UNKNOWN_FAILURE"); return /^[A-Z0-9_]{3,80}$/.test(code) ? code : "UNKNOWN_FAILURE"; }
function wwgHash_(text) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text).map(function (b) { return (b + 256).toString(16).slice(-2); }).join(""); }
function wwgAudit_(event, key, status, late, details) {
  var id = wwgProperties_().getProperty("WWG_AUDIT_SHEET_ID");
  if (!id) throw new Error("AUDIT_SHEET_NOT_CONFIGURED");
  var book = SpreadsheetApp.openById(id), sheet = book.getSheetByName("WUTO_Garbage_Audit") || book.insertSheet("WUTO_Garbage_Audit");
  if (sheet.getLastRow() === 0) sheet.appendRow(["timestamp_utc", "event", "key", "status", "late_seconds", "details"]);
  sheet.appendRow([new Date().toISOString(), event, key, status, late, String(details).slice(0, 40000)]);
}
function wwgWarn_(code, key) {
  var p = wwgProperties_(), day = WWGarbageCore.jstDate(new Date()), prop = "WWG_ALERT_" + day + "_" + code;
  var previous = p.getProperty(prop);
  if (previous === "claimed") return;
  if (!previous) { try { wwgAudit_("warning", key, code, "", "Notification paused; review official source and configuration."); } catch (_) { console.warn("WWG_AUDIT_UNAVAILABLE"); } }
  if (p.getProperty("WWG_ENABLED") !== "true") { p.setProperty(prop, "logged"); return; }
  var admin = p.getProperty("WWG_ADMIN_EMAIL");
  if (!admin || !/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(admin)) return;
  p.setProperty(prop, "claimed");
  try { MailApp.sendEmail(admin, "【WUTO-WURK】ゴミ出し通知の確認が必要です", "収集通知を停止・保留しました。\nコード: " + code + "\n対象: " + key + "\n管理用スプレッドシートを確認してください。\n公式情報: " + WWGarbageCore.SOURCE); }
  catch (_) { console.warn("WWG_ADMIN_ALERT_FAILED"); }
}
function wwgFetch_(url, pdf) {
  if (!/^https:\/\/www\.city\.anan\.tokushima\.jp\//.test(url)) throw new Error("UNTRUSTED_SOURCE");
  var response = UrlFetchApp.fetch(url, { followRedirects: false, muteHttpExceptions: true });
  if (response.getResponseCode() !== 200) throw new Error("OFFICIAL_FETCH_FAILED");
  if (pdf) {
    var blob = response.getBlob(), bytes = blob.getBytes();
    if (bytes.length > 10000000 || bytes.length < 5 || String.fromCharCode.apply(null, bytes.slice(0, 5)) !== "%PDF-") throw new Error("INVALID_PDF_RESPONSE");
    return blob.setContentType("application/pdf");
  }
  return response.getContentText("UTF-8");
}
function wwgOcr_(blob) {
  var id;
  try {
    // Advanced Drive service v3 with identifier WWGDrive; PDF -> Google Doc conversion.
    var doc = WWGDrive.Files.create({ name: "WUTO-garbage-temporary-OCR", mimeType: "application/vnd.google-apps.document" }, blob, { fields: "id", ocrLanguage: "ja" });
    id = doc.id;
    var body = DocumentApp.openById(id).getBody();
    var tables = body.getTables().map(function (table) {
      var rows = [];
      for (var r = 0; r < table.getNumRows(); r++) {
        var row = table.getRow(r), cells = [];
        for (var c = 0; c < row.getNumCells(); c++) cells.push(row.getCell(c).getText());
        rows.push(cells);
      }
      return rows;
    });
    return { body: body.getText(), tables: tables };
  } finally {
    if (id) { try { WWGDrive.Files.update({ trashed: true }, id); } catch (_) { throw new Error("TEMP_DOCUMENT_CLEANUP_FAILED"); } }
  }
}
function wwGarbageRefresh() {
  // Avoid holding the script lock during either notification window.
  var local = new Date(Date.now() + 9 * 3600000), minute = local.getUTCHours() * 60 + local.getUTCMinutes();
  if ((minute >= 16 * 60 + 55 && minute <= 17 * 60 + 5) || (minute >= 18 * 60 + 55 && minute <= 19 * 60 + 5)) return;
  var lock = LockService.getScriptLock(); if (!lock.tryLock(5000)) return;
  try { wwgRefresh_(); }
  catch (error) { wwgProperties_().setProperty("WWG_SOURCE_HEALTH", "blocked"); wwgWarn_(wwgErrorCode_(error), "source-refresh"); }
  finally { lock.releaseLock(); }
}
function wwgRefresh_() {
  var p = wwgProperties_(), started = Date.now(), today = WWGarbageCore.jstDate(new Date());
  var currentMonth = today.slice(0, 7), nextMonth = WWGarbageCore.addDays(currentMonth + "-28", 4).slice(0, 7);
  var links = WWGarbageCore.discoverLinks(wwgFetch_(WWGarbageCore.SOURCE, false)), found = {};
  links.forEach(function (url) {
    if (Date.now() - started > 240000) throw new Error("SOURCE_SCAN_TIME_LIMIT");
    var blob = wwgFetch_(url, true), hash = wwgHash_(blob.getBytes()), cache = p.getProperty("WWG_PDF_" + hash), parsed;
    if (cache) parsed = JSON.parse(cache);
    else {
      var text = wwgOcr_(blob), month = WWGarbageCore.monthFromBody(text.body);
      if (month !== currentMonth && month !== nextMonth) return;
      parsed = WWGarbageCore.extract(text);
      p.setProperty("WWG_PDF_" + hash, JSON.stringify(parsed));
    }
    if (parsed.month !== currentMonth && parsed.month !== nextMonth) return;
    var previous = found[parsed.month];
    if (previous && JSON.stringify(previous.events) !== JSON.stringify(parsed.events)) throw new Error("CONFLICTING_OFFICIAL_PDFS");
    found[parsed.month] = Object.assign({}, parsed, { pdfUrl: url, pdfHash: hash, fetchedAt: new Date().toISOString() });
  });
  if (!found[currentMonth]) throw new Error("CURRENT_MONTH_PDF_NOT_FOUND");
  // Record inspection results before approval. Never substitute the test fixture.
  Object.keys(found).forEach(function (month) {
    var data = found[month];
    wwgAudit_("extraction", month, "REVIEW", "", JSON.stringify(data));
    p.setProperty("WWG_REVIEW_" + month, JSON.stringify(data));
  });
  var approved = p.getProperty("WWG_APPROVED_LAYOUT");
  if (!approved || !Object.keys(found).every(function (month) { return wwgHash_(found[month].layout) === approved; })) throw new Error("LAYOUT_REVIEW_REQUIRED");
  Object.keys(found).forEach(function (month) { p.setProperty("WWG_MONTH_" + month, JSON.stringify(found[month])); });
  p.setProperty("WWG_SOURCE_HEALTH", "ready");
  wwgAudit_("source-refresh", currentMonth, "READY", "", "Validated PDF body month, district, columns and dates.");
  wwgCleanup_();
}
function wwgCleanup_() {
  var p = wwgProperties_(), cutoff = WWGarbageCore.addDays(WWGarbageCore.jstDate(new Date()), -90);
  p.getKeys().forEach(function (key) {
    var match = /^WWG_(?:DELIVERY|SLOT|ALERT)_(\d{4}-\d{2}-\d{2})/.exec(key);
    if (match && match[1] < cutoff) p.deleteProperty(key);
  });
  // Keep only PDF caches referenced by month/review snapshots from the last 90 days.
  var hashes = {};
  p.getKeys().filter(function (key) { return /^WWG_(?:MONTH|REVIEW)_\d{4}-\d{2}$/.test(key); }).forEach(function (key) {
    if (key.slice(-7) < cutoff.slice(0, 7)) { p.deleteProperty(key); return; }
    var value = JSON.parse(p.getProperty(key)); if (value.pdfHash) hashes[value.pdfHash] = true;
  });
  p.getKeys().forEach(function (key) { if (/^WWG_PDF_/.test(key) && !hashes[key.slice(8)]) p.deleteProperty(key); });
}
function wwgDestinations_() {
  var p = wwgProperties_(), result = [], seen = {};
  ["ja", "vi"].forEach(function (lang) {
    var emails = JSON.parse(p.getProperty("WWG_EMAILS_" + lang.toUpperCase()) || "[]");
    if (!Array.isArray(emails) || !emails.length || emails.length > 10) throw new Error("EMAIL_RECIPIENTS_NOT_CONFIGURED");
    emails.forEach(function (address) {
      if (typeof address !== "string" || !/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(address)) throw new Error("INVALID_EMAIL_RECIPIENT");
      var normalized = address.toLowerCase(); if (seen[normalized]) throw new Error("DUPLICATE_EMAIL_RECIPIENT"); seen[normalized] = true;
      result.push({ channel: "email", lang: lang, address: address, id: "mail-" + wwgHash_(normalized).slice(0, 24) });
    });
  });
  var tokenName = p.getProperty("WWG_LINE_TOKEN_PROPERTY"), groupName = p.getProperty("WWG_LINE_GROUP_PROPERTY");
  var token = tokenName && p.getProperty(tokenName), group = groupName && p.getProperty(groupName);
  if (!token || !group || !/^C[0-9a-f]{32}$/i.test(group)) throw new Error("EXISTING_LINE_PROPERTIES_NOT_CONFIGURED");
  result.push({ channel: "line", lang: "both", token: token, address: group, id: "line-" + wwgHash_(group).slice(0, 24) });
  return result;
}
function wwgSend_(destination, event, pdfUrl, test) {
  var ja = WWGarbageCore.message(event, "ja", pdfUrl), vi = WWGarbageCore.message(event, "vi", pdfUrl);
  if (test) { ja = "【接続テスト：実際の収集通知ではありません】\n" + ja; vi = "【KIỂM TRA KẾT NỐI — KHÔNG PHẢI LỊCH THU GOM THỰC TẾ】\n" + vi; }
  if (destination.channel === "email") {
    var body = destination.lang === "ja" ? ja : vi;
    MailApp.sendEmail(destination.address, (test ? "【TEST】" : "") + (destination.lang === "ja" ? "【WUTO-WURK】明日のゴミ出し " + event.date : "【WUTO-WURK】Lịch đổ rác ngày mai " + event.date), body);
  } else {
    var response = UrlFetchApp.fetch("https://api.line.me/v2/bot/message/push", { method: "post", contentType: "application/json", headers: { Authorization: "Bearer " + destination.token }, payload: JSON.stringify({ to: destination.address, messages: [{ type: "text", text: ja + "\n\n" + vi }] }), muteHttpExceptions: true });
    if (response.getResponseCode() !== 200) throw new Error("LINE_DELIVERY_FAILED");
  }
}
function wwGarbageTick() {
  var lock = LockService.getScriptLock(); if (!lock.tryLock(1000)) return;
  var p = wwgProperties_();
  try {
    if (p.getProperty("WWG_ENABLED") !== "true") return;
    var now = new Date(), tomorrow = WWGarbageCore.addDays(WWGarbageCore.jstDate(now), 1), month = tomorrow.slice(0, 7);
    if (p.getProperty("WWG_SOURCE_HEALTH") !== "ready") throw new Error("OFFICIAL_SOURCE_NOT_READY");
    var raw = p.getProperty("WWG_MONTH_" + month); if (!raw) throw new Error("COLLECTION_MONTH_NOT_READY");
    var data = JSON.parse(raw);
    if (!data.fetchedAt || now.getTime() - Date.parse(data.fetchedAt) > 30 * 3600000 || wwgHash_(data.layout) !== p.getProperty("WWG_APPROVED_LAYOUT")) throw new Error("STALE_OR_UNAPPROVED_SOURCE");
    var event = data.events.filter(function (e) { return e.date === tomorrow; })[0]; if (!event) return;
    var destinations = wwgDestinations_();
    WWGarbageCore.slots(event).forEach(function (slot) {
      var slotKey = tomorrow + "_" + slot.local.slice(11, 13), slotProp = "WWG_SLOT_" + slotKey;
      if (p.getProperty(slotProp)) return;
      var timing = WWGarbageCore.timing(slot, now);
      if (timing.state === "future") return;
      if (timing.state === "missed") {
        wwgAudit_("slot", slotKey, "MISSED", timing.lateSeconds, "Not sent outside the five-minute window.");
        p.setProperty(slotProp, "missed"); wwgWarn_("DELIVERY_WINDOW_MISSED", slotKey); return;
      }
      destinations.forEach(function (destination) {
        var key = "WWG_DELIVERY_" + slotKey + "_" + destination.id;
        if (p.getProperty(key)) return;
        var actualTiming = WWGarbageCore.timing(slot, new Date());
        if (actualTiming.state !== "due") { wwgWarn_("DELIVERY_WINDOW_MISSED", slotKey); return; }
        // Claim before the side effect: a crash/timeout cannot cause an automatic duplicate.
        p.setProperty(key, JSON.stringify({ state: "CLAIMED", at: now.toISOString() }));
        try {
          wwgAudit_("delivery", key, "CLAIMED", actualTiming.lateSeconds, destination.channel + "/" + destination.lang);
          wwgSend_(destination, event, data.pdfUrl);
          p.setProperty(key, JSON.stringify({ state: "SENT", at: new Date().toISOString() }));
          wwgAudit_("delivery", key, "SENT", WWGarbageCore.timing(slot, new Date()).lateSeconds, destination.channel + "/" + destination.lang);
        } catch (error) {
          p.setProperty(key, JSON.stringify({ state: "UNKNOWN", at: new Date().toISOString() }));
          try { wwgAudit_("delivery", key, "UNKNOWN", WWGarbageCore.timing(slot, new Date()).lateSeconds, destination.channel + "/" + destination.lang); } catch (_) { console.warn("WWG_AUDIT_UNAVAILABLE"); }
          wwgWarn_(wwgErrorCode_(error), slotKey + "/" + destination.id);
        }
      });
      p.setProperty(slotProp, "processed");
    });
  } catch (error) { wwgWarn_(wwgErrorCode_(error), "dispatch"); }
  finally { lock.releaseLock(); }
}
function wwGarbageApproveLayout() {
  var p = wwgProperties_(), month = p.getProperty("WWG_REVIEW_MONTH");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month || "")) throw new Error("SET_REVIEW_MONTH_FIRST");
  if (p.getProperty("WWG_REVIEW_CONFIRM") !== "公式PDFと18番地区の全日付を目視照合済み") throw new Error("VISUAL_REVIEW_REQUIRED");
  var data = JSON.parse(p.getProperty("WWG_REVIEW_" + month) || "null");
  if (!data) throw new Error("NO_EXTRACTION_TO_APPROVE");
  p.setProperty("WWG_APPROVED_LAYOUT", wwgHash_(data.layout)); p.deleteProperty("WWG_REVIEW_CONFIRM");
  wwgAudit_("layout-approval", month, "APPROVED", "", data.layout);
}
function wwGarbageInstallTriggers() {
  var p = wwgProperties_();
  if (p.getProperty("WWG_ENABLED") !== "true" || p.getProperty("WWG_SOURCE_HEALTH") !== "ready") throw new Error("COMPLETE_VERIFICATION_BEFORE_INSTALL");
  wwgDestinations_();
  if (!p.getProperty("WWG_ADMIN_EMAIL")) throw new Error("ADMIN_EMAIL_NOT_CONFIGURED");
  var handlers = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  if (handlers.indexOf("wwGarbageTick") === -1) ScriptApp.newTrigger("wwGarbageTick").timeBased().everyMinutes(1).create();
  if (handlers.indexOf("wwGarbageRefresh") === -1) ScriptApp.newTrigger("wwGarbageRefresh").timeBased().everyHours(6).create();
  wwgAudit_("trigger-install", "wwGarbage", "INSTALLED", "", "Existing project triggers were preserved.");
}
function wwGarbageStop() { wwgProperties_().setProperty("WWG_ENABLED", "false"); }
function wwGarbageDryRun() {
  var p = wwgProperties_(), month = p.getProperty("WWG_REVIEW_MONTH"), data = JSON.parse(p.getProperty("WWG_REVIEW_" + month) || "null");
  if (!data) throw new Error("NO_EXTRACTION_TO_REVIEW");
  data.events.forEach(function (event) { WWGarbageCore.slots(event).forEach(function (slot) { wwgAudit_("dry-run", slot.local, "NOT_SENT", 0, WWGarbageCore.message(event, "ja", data.pdfUrl) + "\n\n" + WWGarbageCore.message(event, "vi", data.pdfUrl)); }); });
}
