const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const model = require("../license-model");

const TODAY = "2026-11-09";

function record(overrides) {
  return model.normalizeRecord({
    id: "row-1",
    kind: "state",
    name: "Nonresident pharmacy license",
    holder: "Example Pharmacy",
    jurisdiction: "TX",
    number: "NR-000000",
    issuer: "State board of pharmacy",
    posture: "active",
    expires: "2027-11-09",
    ...overrides,
  });
}

test("a fresh matrix is the state breakdown without license numbers", () => {
  const plan = model.initialPlan(null);
  assert.equal(plan.records.length, 51);
  assert.equal(plan.records[0].jurisdiction, "AL");
  assert.equal(plan.records.at(-1).jurisdiction, "WY");
  assert.equal(plan.records.find((entry) => entry.jurisdiction === "DC").id, "shell-DC");
  assert.ok(plan.records.every((entry) => entry.kind === "state" && entry.name === "Pharmacy license"));
  assert.ok(plan.records.every((entry) => entry.number === "" && entry.expires === "" && entry.holder === "" && entry.controlled === ""));
  assert.equal(model.jurisdictionLabel("DC"), "Washington DC");
  assert.equal(model.cleanJurisdiction("Washington DC"), "DC");
  assert.equal(model.cleanJurisdiction("District of Columbia"), "DC");
  assert.deepEqual(plan.settings.reminderDays, { state: 90, pharmacist: 60, technician: 60, accreditation: 180 });
  assert.equal(model.JURISDICTIONS.filter(([id]) => id.length === 2).length, 56);
  const retired = model.initialPlan({
    version: 1,
    records: [{ id: "tpl-resident", kind: "state", name: "Resident pharmacy permit", number: "HP-1" }],
  });
  assert.equal(retired.records[0].id, "shell-AL");
  assert.equal(retired.records.some((entry) => entry.number === "HP-1"), false);
});

test("a saved empty matrix stays empty and edits survive a reload", () => {
  assert.deepEqual(model.initialPlan({ version: 1, records: [], settings: {} }).records, []);
  const kept = record({ notes: "Board file 14\nSecond line", reminderDays: 45, profileId: "EP-000000" });
  const plan = model.initialPlan({
    version: 1,
    records: [{ ...kept, extra: "drop me", holder: "  Example Pharmacy  " }],
    settings: { reminderDays: { state: 30 } },
  });
  assert.equal(plan.records.length, 1);
  assert.equal(plan.records[0].holder, "Example Pharmacy");
  assert.equal(plan.records[0].notes, "Board file 14\nSecond line");
  assert.equal(plan.records[0].reminderDays, 45);
  assert.equal(plan.records[0].extra, undefined);
  assert.equal(plan.settings.reminderDays.state, 30);
  assert.equal(plan.settings.reminderDays.pharmacist, 60);
  assert.equal(model.normalizeRecord("nope"), null);
  assert.equal(model.normalizeRecord({ expires: "2026-02-31" }).expires, "");
});

test("status follows expiration, posture, and the reminder lead", () => {
  const settings = model.defaultSettings();
  const cases = [
    [record({ expires: "2026-11-08" }), "expired", -1, true],
    [record({ expires: "2026-11-09" }), "expiring", 0, true],
    [record({ expires: "2027-02-07" }), "expiring", 90, true],
    [record({ expires: "2027-02-08" }), "current", 91, false],
    [record({ expires: "2027-02-07", reminderDays: 30 }), "current", 90, false],
    [record({ expires: "2026-12-09", reminderDays: 30 }), "expiring", 30, true],
    [record({ expires: "2027-02-07", posture: "renewal-filed" }), "renewal-due", 90, true],
    [record({ expires: "2027-06-01", posture: "renewal-filed" }), "renewal-filed", 204, false],
    [record({ expires: "2026-11-08", posture: "renewal-filed" }), "expired", -1, true],
    [record({ expires: "2026-11-08", posture: "pending" }), "expired", -1, true],
    [record({ expires: "", posture: "pending" }), "pending", null, false],
    [record({ expires: "2027-01-01", posture: "pending" }), "pending", 53, false],
    [record({ expires: "", posture: "renewal-filed" }), "needs-date", null, true],
    [record({ expires: "" }), "needs-date", null, false],
    [record({ expires: "2026-11-08", posture: "suspended" }), "suspended", -1, true],
    [record({ expires: "2026-11-08", posture: "inactive" }), "inactive", -1, false],
    [record({ kind: "pharmacist", expires: "2027-01-08" }), "expiring", 60, true],
    [record({ kind: "pharmacist", expires: "2027-01-09" }), "current", 61, false],
    [record({ kind: "accreditation", expires: "2027-05-08" }), "expiring", 180, true],
    [record({ kind: "accreditation", expires: "2027-05-09" }), "current", 181, false],
  ];
  for (const [entry, id, days, attention] of cases) {
    const status = model.statusOf(entry, TODAY, settings);
    assert.equal(status.id, id, `${entry.kind} ${entry.posture} ${entry.expires}`);
    assert.equal(status.days, days);
    assert.equal(status.attention, attention);
  }
  const shifted = model.defaultSettings();
  shifted.reminderDays.state = 30;
  assert.equal(model.statusOf(record({ expires: "2027-01-08" }), TODAY, shifted).id, "current");
  assert.equal(model.statusOf(record({ expires: "2026-12-09" }), TODAY, shifted).id, "expiring");
});

test("calendar math stays on the date, including a leap day", () => {
  assert.equal(model.daysUntil("2024-03-01", "2024-02-29"), 1);
  assert.equal(model.daysUntil("2026-11-09", "2026-11-09"), 0);
  assert.equal(model.daysUntil("2026-11-08", "2026-11-09"), -1);
  assert.equal(model.daysUntil("nope", TODAY), null);
  assert.equal(model.daysLabel(null), "—");
  assert.equal(model.daysLabel(0), "Today");
  assert.equal(model.daysLabel(1), "1 day");
  assert.equal(model.daysLabel(12), "12 days");
  assert.equal(model.daysLabel(-3), "3 days overdue");
  assert.equal(model.formatLong("2026-11-09"), "November 9, 2026");
  assert.equal(model.localToday(new Date(2026, 10, 9, 23, 30)), "2026-11-09");
});

test("alerts sort the most overdue first and skip quiet rows", () => {
  const settings = model.defaultSettings();
  const rows = [
    record({ id: "soon", name: "Soon", expires: "2026-12-01" }),
    record({ id: "old", name: "Old", expires: "2026-10-01" }),
    record({ id: "older", name: "Older", expires: "2026-08-01" }),
    record({ id: "filed", name: "Filed", posture: "renewal-filed", expires: "2026-11-20" }),
    record({ id: "quiet", name: "Quiet", expires: "2027-11-09" }),
    record({ id: "stopped", name: "Stopped", posture: "suspended", expires: "" }),
    record({ id: "closed", name: "Closed", posture: "inactive", expires: "2020-01-01" }),
    record({ id: "blank", name: "Blank", expires: "", holder: "", number: "" }),
  ];
  const names = model.alerts(rows, TODAY, settings).map((row) => row.record.name);
  assert.deepEqual(names, ["Older", "Old", "Soon", "Filed", "Stopped"]);
  assert.equal(model.attentionLine(rows[2], model.statusOf(rows[2], TODAY, settings)), "Expired 100 days ago");
  assert.match(model.alertTitle(rows[0], model.statusOf(rows[0], TODAY, settings)), /Soon · Texas · Example Pharmacy · NR-000000 — Expires in 22 days/);
  const next = model.nextExpiration([
    record({ id: "later", name: "Later", expires: "2027-11-09" }),
    record({ id: "sooner", name: "Sooner", expires: "2027-01-01" }),
    record({ id: "past", name: "Past", expires: "2026-01-01" }),
    record({ id: "gone", name: "Gone", posture: "inactive", expires: "2026-11-10" }),
  ], TODAY, settings);
  assert.equal(next.record.name, "Sooner");
});

test("the state breakdown stays alphabetical, and alerts sort by urgency", () => {
  const settings = model.defaultSettings();
  const fresh = model.stateShell();
  assert.equal(model.matrixRows(fresh, TODAY, settings, {})[0].record.jurisdiction, "AL");
  assert.equal(model.jurisdictionLabel(model.matrixRows(fresh, TODAY, settings, {})[7].record.jurisdiction), "Delaware");
  const used = fresh.map((entry) => ({ ...entry }));
  const texas = used.findIndex((entry) => entry.jurisdiction === "TX");
  used[texas] = { ...used[texas], number: "NR-000000", holder: "Example Pharmacy", expires: "2026-10-01" };
  assert.equal(model.matrixRows(used, TODAY, settings, {})[0].record.jurisdiction, "AL");
  assert.equal(model.alerts(used, TODAY, settings)[0].record.jurisdiction, "TX");
  const found = model.matrixRows(used, TODAY, settings, { query: "texas" });
  assert.deepEqual(found.map((row) => row.record.jurisdiction), ["TX"]);
  assert.equal(model.matrixRows(fresh, TODAY, settings, { kind: "state" }).length, 51);
});

test("summary groups and jurisdiction names", () => {
  const settings = model.defaultSettings();
  const rows = [
    record({ id: "a", expires: "2026-10-01" }),
    record({ id: "b", expires: "2026-12-01" }),
    record({ id: "c", expires: "2027-11-09", posture: "renewal-filed" }),
    record({ id: "d", kind: "pharmacist", expires: "" }),
    record({ id: "e", kind: "accreditation", posture: "suspended", expires: "2027-01-01" }),
  ];
  const summary = model.summarize(rows, TODAY, settings);
  assert.equal(summary.total, 5);
  assert.equal(summary.byKind.state, 3);
  assert.equal(summary.byKind.pharmacist, 1);
  assert.equal(summary.byKind.accreditation, 1);
  assert.equal(summary.groups.expired, 1);
  assert.equal(summary.groups.expiring, 1);
  assert.equal(summary.groups.current, 1);
  assert.equal(summary.groups["needs-date"], 1);
  assert.equal(summary.groups.attention, 3);
  assert.equal(model.jurisdictionLabel("TX"), "Texas");
  assert.equal(model.cleanJurisdiction("Texas"), "TX");
  assert.equal(model.cleanJurisdiction("federal"), "Federal");
  assert.equal(model.holderLabel(record({ kind: "pharmacist", holder: "Alex Example", role: "pic" })), "Alex Example · PIC");
  assert.equal(model.holderLabel(record({ kind: "pharmacist", holder: "", role: "pic" })), "");
});

test("duplicate clears the license number and the next state", () => {
  const copy = model.duplicateRecord(record({ notes: "Keep the note", owner: "Compliance" }));
  assert.notEqual(copy.id, "row-1");
  assert.equal(copy.number, "");
  assert.equal(copy.jurisdiction, "");
  assert.equal(copy.expires, "");
  assert.equal(copy.holder, "Example Pharmacy");
  assert.equal(copy.owner, "Compliance");
  assert.equal(copy.notes, "Keep the note");
  assert.equal(copy.posture, "active");
  const accreditation = model.duplicateRecord(record({ kind: "accreditation", jurisdiction: "National", name: "ACHC accreditation" }));
  assert.equal(accreditation.jurisdiction, "National");
  assert.equal(accreditation.number, "");
});

test("missing states come back without resetting edits", () => {
  const records = model.stateShell().filter((entry) => entry.id !== "shell-WY" && entry.id !== "shell-TX");
  records[0] = { ...records[0], number: "HP-000000" };
  const restored = model.restoreTemplate(records);
  assert.equal(restored.find((entry) => entry.id === "shell-AL").number, "HP-000000");
  assert.equal(model.missingTemplate(restored).length, 0);
  assert.equal(restored.filter((entry) => entry.id === "shell-WY").length, 1);
  assert.equal(restored.filter((entry) => entry.id === "shell-TX").length, 1);
});

test("field edits keep a trailing space until blur and clamp the lead", () => {
  const base = record({ name: "Permit" });
  assert.equal(model.applyField(base, "name", "Permit ", false).name, "Permit ");
  assert.equal(model.applyField(base, "name", "Permit ", true).name, "Permit");
  assert.equal(model.applyField(base, "reminderDays", "", false).reminderDays, null);
  assert.equal(model.applyField(base, "reminderDays", "0", false).reminderDays, 0);
  assert.equal(model.applyField(base, "reminderDays", "5000", false).reminderDays, 1095);
  assert.equal(model.applyField(base, "reminderDays", "-4", false).reminderDays, 0);
  assert.equal(model.applyField(base, "kind", "nope", false).kind, "state");
  assert.equal(model.applyField(base, "expires", "2026-02-31", false).expires, "");
  assert.equal(model.applyField(base, "jurisdiction", "Texas", false).jurisdiction, "TX");
  assert.equal(model.applyField(base, "notes", "Line\nTwo ", false).notes, "Line\nTwo ");
});

test("csv escapes formulas and import rejects the wrong backup", () => {
  const settings = model.defaultSettings();
  const rows = [record({ holder: '=HYPERLINK("http://example.test")', notes: 'He said "keep"', number: "NR-000000" })];
  const csv = model.toCsv(rows, TODAY, settings);
  assert.match(csv, /"'=HYPERLINK\(""http:\/\/example\.test""\)"/);
  assert.match(csv, /"He said ""keep"""/);
  assert.match(csv, /Expired|Current|Expiring/);
  const exported = model.exportDocument(rows, settings);
  const parsed = model.parseImport(JSON.stringify(exported));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.records[0].number, "NR-000000");
  assert.equal(parsed.records[0].holder.startsWith("'="), false);
  assert.equal(parsed.records[0].holder.startsWith("="), true);
  const duplicated = model.parseImport(JSON.stringify({
    licenseMatrix: "credentials",
    records: [{ id: "same", name: "One" }, { id: "same", name: "Two" }],
  }));
  assert.equal(duplicated.ok, true);
  assert.notEqual(duplicated.records[0].id, duplicated.records[1].id);
  assert.equal(model.parseImport("{").ok, false);
  assert.equal(model.parseImport("").error, "That file is empty.");
  assert.match(model.parseImport(JSON.stringify({ pocket: "work-tracker", items: [] })).error, /roadmap backup/);
  assert.equal(model.parseImport(JSON.stringify({ licenseMatrix: "credentials", records: Array(501).fill({ name: "X" }) })).ok, false);
  assert.equal(model.parseImport("x".repeat(1000001)).error, "That file is too large.");
  assert.deepEqual(model.blankRecord("pharmacist").kind, "pharmacist");
  assert.equal(model.blankRecord("accreditation").jurisdiction, "National");
  assert.equal(model.blankRecord("technician").name, "Pharmacy technician");
  const sooner = model.statusOf(record({
    expires: "2028-12-31",
    controlled: "CS-000000 EXP 12/01/2026",
    controlledExpires: "2026-12-01",
  }), TODAY, model.defaultSettings());
  assert.equal(sooner.id, "expiring");
  assert.equal(sooner.source, "controlled");
  assert.equal(sooner.days, 22);
  assert.equal(model.attentionLine(record({ controlledExpires: "2026-12-01" }), sooner), "Controlled substance expires in 22 days");
});

test("the landing page is wired to the model", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "licenses.html"), "utf8");
  assert.match(html, /license-model\.js/);
  assert.match(html, /license-workbook\.js/);
  assert.match(html, /license\.js/);
  assert.match(html, /id="app"/);
  assert.match(html, /href="#matrix"/);
  const ui = fs.readFileSync(path.join(__dirname, "..", "license.js"), "utf8");
  assert.match(ui, /id: "matrix"/);
});
