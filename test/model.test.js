const test = require("node:test");
const assert = require("node:assert/strict");
const model = require("../tracker-model");

function savedItem() {
  return {
    id: "keep",
    title: "Compliance support",
    description: "Keep the note",
    color: "#6b5e52",
    status: "feasibility",
    statusNote: "Waiting on a draft",
    tasks: [
      { text: "Cost savings", done: true, answer: "About 12 hours a week" },
      { text: "Custom line", done: false },
    ],
    journal: [{ id: "j1", createdAt: "2026-10-01T15:00:00.000Z", title: "Note", body: "Kept" }],
  };
}

test("version 4 data keeps user content and does not restore deleted starters", () => {
  const second = {
    id: "second",
    title: "White label offering",
    description: "",
    color: "#1f6f8b",
    status: "review",
    statusNote: "",
    tasks: [{ text: "Timing", done: true }],
  };
  const items = model.migrate([savedItem(), second], "4");
  assert.equal(items[0].id, "keep");
  assert.equal(items[1].id, "second");
  assert.equal(items[0].title, "Compliance support");
  assert.equal(items[0].summary, "Keep the note");
  assert.equal(items[0].stage, "feasibility");
  assert.equal(items[0].statusNote, "Waiting on a draft");
  assert.equal(items[0].brief.scope, "Waiting on a draft");
  assert.equal(items[0].journal[0].body, "Kept");
  assert.deepEqual(
    items[0].checklist.slice(0, 2).map((entry) => [entry.text, entry.done, entry.answer]),
    [
      ["Cost savings", true, "About 12 hours a week"],
      ["Custom line", false, ""],
    ],
  );
  assert.equal(items[0].checklist.some((entry) => entry.text === "Timing"), false);
  assert.equal(items.some((item) => item.id === "capital-it-spend" || item.id === "it-systems-financial-plan"), false);
  assert.equal(items.some((item) => item.title === "SCALE analysis"), false);
  assert.equal(items[1].title, "Private Label Sites & Provider Network");
  assert.deepEqual(items[1].workstreams, ["Sites and offering", "Provider network"]);
  assert.equal(items[1].checklist[0].text, "Timing");
  assert.equal(items[1].checklist[0].done, true);
  assert.deepEqual(items.slice(2, 5).map((item) => item.title), [
    "Independence from BestRx",
    "Labor Model & Scheduling",
    "epiqscripts.com Revamp",
  ]);
  assert.ok(items.some((item) => item.title === "Client Launch Readiness"));
  assert.equal(items.filter((item) => item.title === "SCALE analysis").length, 0);
});

test("a fresh browser gets the original eight projects and the added workspaces once", () => {
  const items = model.migrate([], null);
  assert.equal(items.length, 16);
  assert.deepEqual(items.slice(0, 8).map((item) => item.title), [
    "IT Systems Financial Plan",
    "Independence from BestRx",
    "Labor Model & Scheduling",
    "epiqscripts.com Revamp",
    "Private Label Sites & Provider Network",
    "Compliance support",
    "AI agents for support",
    "SCALE analysis",
  ]);
  assert.ok(items[0].checklist.every((entry) => entry.done === false));
  assert.equal(items[0].budget.length, 7);
  assert.ok(items[0].budget.every((row) => row.currentCost == null && row.proposedCost == null));
  assert.equal(items[2].schedule.blocks.length, 0);
  assert.equal(items.some((item) => item.title === "Best RX Quantity and Refill Resolution"), false);
});

test("an emptied saved list stays empty", () => {
  assert.deepEqual(model.migrate([], "4"), []);
  assert.deepEqual(model.migrate([], "5"), []);
  assert.deepEqual(model.migrate([], "6"), []);
  assert.deepEqual(model.migrate([], "7"), []);
});

test("version 7 does not recreate a deleted project or recommendation", () => {
  const kept = model.normalizeItem({ id: "mine", title: "Mine", checklist: [] });
  const items = model.migrate([kept], "7");
  assert.deepEqual(items.map((item) => item.id), ["mine"]);
  const plan = model.migratePlan({ projects: [kept], recommendations: [], settings: {} }, "7");
  assert.deepEqual(plan.projects.map((item) => item.id), ["mine"]);
  assert.equal(plan.recommendations.length, 0);
});

test("an existing IT plan is enriched in place and a deleted one stays deleted", () => {
  const capital = {
    id: "capital-it-spend",
    title: "Capital IT spend",
    description: "Heavy licensing, subscriptions, and IT labor, with a target to reduce the total.",
    status: "evaluate",
    tasks: [
      { text: "BestRx enterprise contract", done: true },
      { text: "Redline solutions", done: false },
      { text: "My own follow-up", done: false },
    ],
    journal: [{ id: "j-keep", createdAt: "2026-09-01T12:00:00.000Z", title: "", body: "Do not lose this" }],
  };
  const upgraded = model.migrate([capital], "5");
  assert.equal(upgraded[0].id, "capital-it-spend");
  assert.equal(upgraded[0].title, "IT Systems Financial Plan");
  assert.equal(upgraded[0].journal[0].body, "Do not lose this");
  assert.equal(upgraded[0].checklist.find((entry) => entry.text === "BestRx enterprise contract").done, true);
  assert.equal(upgraded[0].checklist.some((entry) => entry.text === "Redline solutions"), true);
  assert.equal(upgraded[0].checklist.some((entry) => entry.text === "Redlime work and costs"), false);
  assert.equal(upgraded[0].checklist.some((entry) => entry.text === "My own follow-up"), true);
  assert.ok(upgraded[0].budget.some((row) => row.vendor === "IT labor, including offshore development"));
  assert.equal(upgraded[0].budget.some((row) => /total/i.test(row.vendor)), false);
  const names = model.migrate([{ id: "other", title: "Something else", tasks: [] }], "5").map((item) => item.title);
  assert.equal(names.includes("IT Systems Financial Plan"), false);
  assert.equal(names.includes("SCALE analysis"), false);
  assert.ok(names.includes("Independence from BestRx"));
});

test("checklist percent counts checked lines only", () => {
  const item = model.normalizeItem({
    id: "a",
    title: "One",
    stage: "completed",
    tasks: [
      { text: "Cost savings", done: true },
      { text: "Timing", done: false },
    ],
  });
  const progress = model.progressOf(item);
  assert.equal(item.stage, "completed");
  assert.equal(progress.fraction, "1/2");
  assert.equal(progress.percent, 50);
  assert.equal(progress.label, "Checklist complete");
  assert.equal(model.progressOf(model.normalizeItem({ id: "b", title: "Empty", tasks: [] })).fraction, "—");
});

test("next 3 skips completed and archived items and keeps rank order", () => {
  const items = [
    ["completed", false],
    ["blocked", false],
    ["evaluate", true],
    ["review", false],
    ["feasibility", false],
    ["evaluate", false],
  ].map(([stage, archived], index) =>
    model.normalizeItem({
      id: `item-${index}`,
      title: `Item ${index}`,
      stage,
      archived,
      nextStep: `Step ${index}`,
      checklist: [],
    }),
  );
  const next = model.nextThree(items);
  assert.deepEqual(
    next.map((item) => item.title),
    ["Item 1", "Item 3", "Item 4"],
  );
  assert.equal(next[0].blocked, true);
  assert.equal(next[0].nextStep, "Step 1");
  assert.equal(next[1].blocked, false);
});

test("export and import keep the project and still read a version 1 file", () => {
  const items = model.migrate([savedItem()], "4");
  items[0].owner = "Jordan Lee";
  items[0].nextStep = "Send the draft";
  items[0].targetDate = "2026-11-02";
  items[0].stage = "blocked";
  items[0].checklist[0].answer = "About 12 hours a week";
  const raw = JSON.stringify(model.exportDocument(items));
  const parsed = model.parseImport(raw);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.items[0].title, "Compliance support");
  assert.equal(parsed.items[0].owner, "Jordan Lee");
  assert.equal(parsed.items[0].nextStep, "Send the draft");
  assert.equal(parsed.items[0].targetDate, "2026-11-02");
  assert.equal(parsed.items[0].stage, "blocked");
  assert.equal(parsed.items[0].checklist[0].done, true);
  assert.equal(parsed.items[0].checklist[0].answer, "About 12 hours a week");
  assert.equal(parsed.items[0].checklist[1].text, "Custom line");
  assert.equal(parsed.items[0].journal[0].body, "Kept");
  const legacy = model.parseImport(JSON.stringify({
    pocket: "work-tracker",
    version: 1,
    items: [{ id: "old", title: "Old", description: "From before", status: "review", nextAction: "Call", tasks: [{ text: "Custom line", done: true }] }],
  }));
  assert.equal(legacy.ok, true);
  assert.equal(legacy.items[0].summary, "From before");
  assert.equal(legacy.items[0].stage, "review");
  assert.equal(legacy.items[0].nextStep, "Call");
  assert.equal(legacy.items[0].checklist[0].text, "Custom line");
  assert.equal(legacy.items[0].checklist[0].done, true);
});

test("target delivery keeps a real date and drops an invalid one", () => {
  const item = model.normalizeItem({
    id: "dates",
    title: "Dates",
    targetDate: "2026-02-31",
    tasks: [
      { text: "Target delivery", done: false, answer: "2026-12-01" },
      { text: "Cost savings", done: false, answer: "Lower the license" },
    ],
  });
  assert.equal(item.targetDate, "");
  assert.equal(item.checklist[0].answer, "2026-12-01");
  assert.equal(model.reviewKind("Target delivery"), "date");
  assert.equal(model.reviewKind("Cost savings"), "text");
  const bad = model.normalizeItem({
    id: "bad-date",
    title: "Bad",
    tasks: [{ text: "Target delivery", done: false, answer: "next spring" }],
  });
  assert.equal(bad.checklist[0].answer, "");
});

test("import rejects a bad file and does not invent items", () => {
  assert.equal(model.parseImport("{").ok, false);
  assert.equal(model.parseImport(JSON.stringify({ pocket: "other", items: [{ title: "Nope" }] })).ok, false);
  assert.equal(model.parseImport(JSON.stringify({ pocket: "work-tracker", items: [] })).ok, false);
  assert.equal(model.parseImport(JSON.stringify({ pocket: "work-tracker", items: [null] })).ok, false);
  assert.equal(model.parseImport(JSON.stringify({ items: [{ id: "ok", title: "Kept", tasks: [] }] })).ok, true);
});

test("budget math keeps unknown, zero, and one-time costs apart", () => {
  const summary = model.budgetSummary([
    { frequency: "monthly", currentCost: 10, proposedCost: 8 },
    { frequency: "monthly", currentCost: 0, proposedCost: 0 },
    { frequency: "unknown", currentCost: 99, proposedCost: 99 },
    { frequency: "one-time", currentCost: 50, proposedCost: null },
    { frequency: "annual", currentCost: null, proposedCost: 5 },
  ]);
  assert.equal(summary.recurringCurrent, 120);
  assert.equal(summary.recurringProposed, 101);
  assert.equal(summary.difference, -19);
  assert.equal(summary.oneTimeCurrent, 50);
  assert.equal(summary.oneTimeProposed, null);
  assert.equal(summary.unknownRows, 2);
  const zeros = model.budgetSummary([{ frequency: "annual", currentCost: 0, proposedCost: 0 }]);
  assert.equal(zeros.recurringCurrent, 0);
  assert.equal(zeros.difference, 0);
  assert.equal(zeros.unknownRows, 0);
});

test("duplicating a project resets completion and drops the journal", () => {
  const original = model.normalizeItem({
    id: "source",
    title: "Labor Model & Scheduling",
    brief: { purpose: "Keep the purpose", scope: "Weekdays", outcome: "A template" },
    checklist: [{ id: "c1", text: "Draft the weekly template", done: true, type: "action" }],
    journal: [{ id: "j1", createdAt: "2026-10-02T12:00:00.000Z", title: "Log", body: "History" }],
    schedule: { blocks: [{ id: "b1", activity: "Opening", day: "Monday", start: "08:00", end: "09:00" }] },
    relatedIds: ["other"],
  });
  const copy = model.duplicateProject(original);
  assert.notEqual(copy.id, original.id);
  assert.equal(copy.title, "Labor Model & Scheduling copy");
  assert.equal(copy.brief.purpose, "Keep the purpose");
  assert.equal(copy.journal.length, 0);
  assert.equal(copy.checklist.length, 1);
  assert.notEqual(copy.checklist[0].id, "c1");
  assert.equal(copy.checklist[0].done, false);
  assert.equal(copy.checklist[0].text, "Draft the weekly template");
  assert.notEqual(copy.schedule.blocks[0].id, "b1");
  assert.deepEqual(copy.relatedIds, ["other"]);
  assert.equal(original.checklist[0].done, true);
  assert.equal(original.journal.length, 1);
});

test("schedule blocks stay inside the weekly template", () => {
  assert.equal(model.blockError({ day: "Monday", start: "08:00", end: "08:30" }), "");
  assert.equal(model.blockError({ day: "Saturday", start: "17:30", end: "18:00" }), "");
  assert.match(model.blockError({ day: "Monday", start: "09:00", end: "08:30" }), /after the start/);
  assert.match(model.blockError({ day: "Monday", start: "07:00", end: "08:00" }), /8:00 a\.m\./);
  assert.match(model.blockError({ day: "Monday", start: "08:15", end: "09:00" }), /30-minute/);
  assert.match(model.blockError({ day: "Sunday", start: "08:00", end: "09:00" }), /Monday through Saturday/);
});

test("only http and https material links are usable", () => {
  assert.equal(model.safeUrl("https://example.com/plan"), "https://example.com/plan");
  assert.equal(model.safeUrl("javascript:alert(1)"), "");
  assert.equal(model.safeUrl("notes"), "");
});

test("the roadmap includes this year and any quarter already used", () => {
  const items = [model.normalizeItem({
    id: "p",
    title: "One",
    deliverables: [{ id: "d", quarter: "2027-Q2", text: "Launch", done: false }],
  })];
  const quarters = model.quartersFor(items, 2026);
  assert.deepEqual(quarters.slice(0, 4), ["2026-Q1", "2026-Q2", "2026-Q3", "2026-Q4"]);
  assert.ok(quarters.includes("2027-Q2"));
});

test("consultant feedback is seeded once and keeps its source wording", () => {
  const first = model.migratePlan({ projects: [], recommendations: [], settings: {} }, null);
  assert.ok(first.recommendations.length > 8);
  assert.ok(first.recommendations.every((entry) => entry.sourceLabel === "User-provided consultant feedback"));
  assert.ok(first.recommendations.every((entry) => entry.sourceName === "Scale Readiness & Operating System Diagnostic"));
  assert.ok(first.recommendations.every((entry) => entry.sourceCitation.includes("Matt Cook, Scale That Works")));
  assert.equal(JSON.stringify(first).includes("Sultan"), false);
  assert.equal(JSON.stringify(first).includes("Priscilla"), false);
  const later = first.recommendations.find((entry) => entry.originalText.startsWith("Add second-shift"));
  assert.equal(later.horizon, "later");
  const pause = first.recommendations.find((entry) => entry.originalText.includes("pause and harden"));
  assert.equal(pause.horizon, "now");
  assert.equal(pause.response, "");
  const again = model.migratePlan({
    projects: first.projects.filter((item) => item.id !== "enterprise-priorities"),
    recommendations: first.recommendations.map((entry) => ({ ...entry, response: "Kept" })),
    settings: { baselineDate: "2026-11-02" },
  }, "7");
  assert.equal(again.recommendations.length, first.recommendations.length);
  assert.ok(again.recommendations.every((entry) => entry.response === "Kept"));
  assert.equal(again.projects.some((item) => item.id === "enterprise-priorities"), false);
  assert.equal(again.settings.baselineDate, "2026-11-02");
});

test("queue math keeps unknown, spare capacity, and mixed units apart", () => {
  const spare = model.operatingBalance({ startWip: 5, incoming: 1, capacity: 9 });
  assert.equal(spare.raw, -3);
  assert.equal(spare.projected, 0);
  assert.equal(spare.spare, 3);
  assert.equal(model.operatingBalance({ startWip: 5, incoming: null, capacity: 1 }).unknown, true);
  const mixed = model.operatingTotal([
    { unit: "orders", startWip: 1, incoming: 1, capacity: 1 },
    { unit: "lines", startWip: 1, incoming: 1, capacity: 1 },
  ]);
  assert.equal(mixed.ok, false);
  const partial = model.operatingTotal([
    { unit: "orders", startWip: 2, incoming: 3, capacity: 1 },
    { unit: "orders", startWip: null, incoming: 1, capacity: 1 },
  ]);
  assert.equal(partial.ok, false);
  const same = model.operatingTotal([
    { unit: "orders", startWip: 4, incoming: 2, capacity: 8 },
    { unit: "orders", startWip: 1, incoming: 1, capacity: 1 },
  ]);
  assert.equal(same.ok, true);
  assert.equal(same.projected, 0);
  assert.equal(same.spare, 1);
});

test("horizons are not dated until a baseline exists, and commitment gaps stay visible", () => {
  assert.equal(model.horizonWindows(""), null);
  const windows = model.horizonWindows("2026-11-02");
  assert.equal(windows.now.described, "0–90 days");
  assert.equal(windows.next.described, "3–6 months");
  assert.match(windows.note, /not deadlines/);
  const gaps = model.commitmentGaps(model.normalizeDeliverable({ outcome: "Ship the checklist", horizon: "now" }));
  assert.ok(gaps.includes("Definition of done"));
  assert.ok(gaps.includes("Readiness evidence"));
  const money = model.contributionOf({ period: "", unit: "orders", revenue: 10, labor: 2, packaging: null, support: 0, engineering: 0, inventory: 0, exceptions: 0 });
  assert.equal(money.incomplete, true);
  assert.equal(money.amount, null);
});

test("new workspaces start blank instead of pretending the work is done", () => {
  const plan = model.migratePlan([], null);
  const labor = plan.projects.find((item) => item.title === "Labor Model & Scheduling");
  assert.ok(labor.checklist.some((entry) => entry.text.startsWith("Review overtime") && entry.horizon === "now" && entry.done === false));
  assert.deepEqual(labor.tools.capacity, { rows: [], coverage: [] });
  const scorecard = plan.projects.find((item) => item.id === "enterprise-priorities").tools.scorecard;
  assert.ok(scorecard.every((row) => row.target === "" && row.actual === "" && row.status === "suggestion"));
  const launch = plan.projects.find((item) => item.id === "client-launch-readiness").tools.launches[0];
  assert.ok(launch.items.every((item) => item.status === "not-assessed" && item.evidence === "" && item.owner === ""));
  const playbook = plan.projects.find((item) => item.id === "business-continuity").tools.playbooks[0];
  assert.equal(playbook.trigger, "");
  assert.equal(playbook.exercised, "");
  const scale = plan.projects.find((item) => item.id === "scale-analysis");
  assert.equal(scale.reviewHost, true);
  assert.equal(scale.title, "SCALE analysis");
});
