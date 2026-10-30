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
      { text: "Cost savings", done: true },
      { text: "Custom line", done: false },
    ],
  };
}

test("version 4 data keeps titles, checks, phase, and order", () => {
  const second = {
    id: "second",
    title: "White label offering",
    description: "",
    color: "#1f6f8b",
    status: "review",
    statusNote: "",
    tasks: [{ text: "Timing", done: true }],
  };
  const items = model.migrate([savedItem(), second], "4").slice(5);
  assert.deepEqual(items.map((item) => item.id), ["keep", "second"]);
  assert.equal(items[0].title, "Compliance support");
  assert.equal(items[0].description, "Keep the note");
  assert.equal(items[0].status, "feasibility");
  assert.equal(items[0].statusNote, "Waiting on a draft");
  assert.deepEqual(
    items[0].tasks.map((task) => [task.text, task.done]),
    [
      ["Cost savings", true],
      ["Custom line", false],
    ],
  );
  assert.equal(items[0].owner, "");
  assert.equal(items[0].nextAction, "");
  assert.equal(items[0].targetDate, "");
  assert.equal(items[0].tasks[0].answer, "");
  assert.equal(items.some((item) => item.title === "SCALE analysis"), false);
  assert.equal(items[0].tasks.some((task) => task.text === "Timing"), false);
});

test("a fresh browser gets the starter list once", () => {
  const items = model.migrate([], null);
  assert.equal(items.at(-1).title, "SCALE analysis");
  assert.equal(items.length, 14);
  assert.ok(items[0].tasks.some((task) => task.text === "Regulatory check"));
});

test("checklist percent counts checked lines only", () => {
  const item = model.normalizeItem({
    id: "a",
    title: "One",
    tasks: [
      { text: "Cost savings", done: true },
      { text: "Timing", done: false },
    ],
  });
  const progress = model.progressOf(item);
  assert.equal(progress.fraction, "1/2");
  assert.equal(progress.percent, 50);
  assert.equal(progress.label, "Checklist complete");
  assert.equal(model.progressOf(model.normalizeItem({ id: "b", title: "Empty", tasks: [] })).fraction, "—");
});

test("next 3 skips completed items and keeps rank order", () => {
  const items = ["completed", "blocked", "evaluate", "review", "feasibility"].map((status, index) =>
    model.normalizeItem({
      id: `item-${index}`,
      title: `Item ${index}`,
      status,
      nextAction: `Action ${index}`,
      tasks: [],
    }),
  );
  const next = model.nextThree(items);
  assert.deepEqual(
    next.map((item) => item.title),
    ["Item 1", "Item 2", "Item 3"],
  );
  assert.equal(next[0].blocked, true);
  assert.equal(next[0].nextAction, "Action 1");
  assert.equal(next[1].blocked, false);
});

test("export and import keep fields and order", () => {
  const items = [model.normalizeItem(savedItem())];
  items[0].owner = "Jordan Lee";
  items[0].nextAction = "Send the draft";
  items[0].targetDate = "2026-11-02";
  items[0].status = "blocked";
  items[0].tasks[0].answer = "About 12 hours a week";
  const raw = JSON.stringify(model.exportDocument(items));
  const parsed = model.parseImport(raw);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].title, "Compliance support");
  assert.equal(parsed.items[0].owner, "Jordan Lee");
  assert.equal(parsed.items[0].nextAction, "Send the draft");
  assert.equal(parsed.items[0].targetDate, "2026-11-02");
  assert.equal(parsed.items[0].status, "blocked");
  assert.equal(parsed.items[0].tasks[0].done, true);
  assert.equal(parsed.items[0].tasks[0].answer, "About 12 hours a week");
  assert.equal(parsed.items[0].tasks[1].text, "Custom line");
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
  assert.equal(item.tasks[0].answer, "2026-12-01");
  assert.equal(model.reviewKind("Target delivery"), "date");
  assert.equal(model.reviewKind("Cost savings"), "text");
  const bad = model.normalizeItem({
    id: "bad-date",
    title: "Bad",
    tasks: [{ text: "Target delivery", done: false, answer: "next spring" }],
  });
  assert.equal(bad.tasks[0].answer, "");
});

test("import rejects a bad file and does not invent items", () => {
  assert.equal(model.parseImport("{").ok, false);
  assert.equal(model.parseImport(JSON.stringify({ pocket: "other", items: [{ title: "Nope" }] })).ok, false);
  assert.equal(model.parseImport(JSON.stringify({ pocket: "work-tracker", items: [] })).ok, false);
  assert.equal(model.parseImport(JSON.stringify({ pocket: "work-tracker", items: [null] })).ok, false);
  assert.equal(model.parseImport(JSON.stringify({ items: [{ id: "ok", title: "Kept", tasks: [] }] })).ok, true);
});


test("module migration preserves saved content and only prioritizes once", () => {
  const original = savedItem();
  const spend = { ...savedItem(), id: "capital-it-spend", title: "Capital IT spend" };
  const items = model.migrate([original, spend], "5");
  assert.deepEqual(items.slice(0, 5).map(item => item.title), [
    "Hard Candy implementation", "Independence from Best Rx", "IT cost and spend",
    "Labor model; packaging", "Labor model: compounding"
  ]);
  assert.equal(items[2].description, spend.description);
  assert.equal(items[2].tasks[0].done, true);
  assert.equal(items[5].id, original.id);
  assert.equal(items[5].tasks[0].done, true);
  const reordered = [items[4], ...items.slice(0, 4), items[5]];
  assert.deepEqual(model.migrate(reordered, model.STARTER_VERSION), reordered);
});

test("data collection fields survive backup and are excluded from project priorities", () => {
  const collection = model.migrate([], null).find(item => item.kind === "collection");
  assert.ok(collection);
  assert.equal(collection.tasks.length, 10);
  collection.tasks[0].answer = "First shift\nSecond shift";
  const parsed = model.parseImport(JSON.stringify(model.exportDocument([collection])));
  assert.equal(parsed.items[0].kind, "collection");
  assert.equal(parsed.items[0].tasks[0].answer, "First shift\nSecond shift");
  assert.deepEqual(model.nextThree([collection]), []);
});
