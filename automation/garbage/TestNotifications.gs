/* Optional manual connection test. Never called by production triggers. */
function wwGarbageTestSend() {
  var p = wwgProperties_();
  if (p.getProperty("WWG_ENABLED") === "true") throw new Error("STOP_PRODUCTION_BEFORE_TESTING");
  if (p.getProperty("WWG_TEST_CONFIRM") !== "設定済み通知先へテスト送信") throw new Error("EXPLICIT_TEST_CONFIRMATION_REQUIRED");
  var destinations = wwgDestinations_();
  p.deleteProperty("WWG_TEST_CONFIRM");
  var event = { date: WWGarbageCore.addDays(WWGarbageCore.jstDate(new Date()), 1), categories: ["plastic"] };
  destinations.forEach(function (destination) {
    try { wwgSend_(destination, event, null, true); wwgAudit_("connection-test", destination.id, "API_RETURNED_SUCCESS", "", destination.channel + "/" + destination.lang); }
    catch (_) { wwgAudit_("connection-test", destination.id, "FAILED_OR_UNKNOWN", "", "Check the inbox or LINE manually before retrying."); throw new Error("TEST_DELIVERY_FAILED_OR_UNKNOWN"); }
  });
}
