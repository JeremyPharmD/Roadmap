(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PocketModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const STORAGE_KEY = "pocket-work-tracker";
  const STARTER_KEY = "pocket-work-tracker-starter";
  const STARTER_VERSION = "6";
  const CAPITAL_ID = "capital-it-spend";
  const SCALE_ID = "scale-analysis";
  const COLORS = ["#b54a2a", "#1f6f8b", "#6b5e52"];
  const REVIEW = ["Cost savings", "Timing", "Effort", "Target delivery", "Regulatory check"];
  const SPEND = [
    "BestRx licensing",
    "BestRx enterprise contract",
    "Offshore development",
    "Total IT labor, including offshore",
    "Redline solutions",
  ];
  const PHASES = [
    { id: "evaluate", label: "Evaluate", short: "Evaluate" },
    { id: "feasibility", label: "Investigate feasibility", short: "Feasibility" },
    { id: "review", label: "Ready for review", short: "Review" },
    { id: "completed", label: "Completed", short: "Completed" },
    { id: "blocked", label: "Blocked", short: "Blocked" },
  ];
  const CHECKLIST_LABEL = "Checklist complete";

  function cleanText(value, max) {
    if (typeof value !== "string") return "";
    return value.replace(/\r\n?/g, "\n").slice(0, max);
  }

  function cleanDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
    const [year, month, day] = value.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
      parsed.getUTCFullYear() !== year ||
      parsed.getUTCMonth() !== month - 1 ||
      parsed.getUTCDate() !== day
    ) {
      return "";
    }
    return value;
  }

  function reviewKind(text) {
    const name = String(text || "").trim().toLowerCase();
    if (name === "target delivery") return "date";
    if (REVIEW.some((line) => line.toLowerCase() === name)) return "text";
    return "";
  }

  function reviewTasks() {
    return REVIEW.map((text) => ({ text, done: false, answer: "" }));
  }

  function spendTasks() {
    return SPEND.map((text) => ({ text, done: false, answer: "" }));
  }

  function normalizeTask(task) {
    if (!task || typeof task !== "object") return null;
    const text = cleanText(task.text, 2000);
    const kind = reviewKind(text);
    let answer = cleanText(task.answer, 2000).trim();
    if (kind === "date") answer = cleanDate(typeof task.answer === "string" ? task.answer.trim() : "");
    return { text, done: Boolean(task.done), answer };
  }

  function normalizeItem(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const status = PHASES.some((phase) => phase.id === raw.status) ? raw.status : "evaluate";
    const color = COLORS.includes(raw.color) ? raw.color : COLORS[0];
    const tasks = Array.isArray(raw.tasks) ? raw.tasks.map(normalizeTask).filter(Boolean) : [];
    const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim().slice(0, 80) : crypto.randomUUID();
    return {
      id,
      title: cleanText(raw.title, 2000),
      kind: raw.kind === "collection" ? "collection" : "project",
      description: cleanText(raw.description, 2000),
      color,
      status,
      statusNote: cleanText(raw.statusNote, 500).replace(/\n/g, " ").trim(),
      owner: cleanText(raw.owner, 120).replace(/\n/g, " ").trim(),
      nextAction: cleanText(raw.nextAction, 160).replace(/\n/g, " ").trim(),
      targetDate: cleanDate(typeof raw.targetDate === "string" ? raw.targetDate.trim() : ""),
      tasks,
    };
  }

  function capitalItem(index) {
    return normalizeItem({
      id: CAPITAL_ID,
      title: "IT cost and spend",
      description: "Heavy licensing, subscriptions, and IT labor, with a target to reduce the total.",
      color: COLORS[index % COLORS.length],
      status: "evaluate",
      tasks: [...reviewTasks(), ...spendTasks()],
    });
  }

  function scaleItem(index) {
    return normalizeItem({
      id: SCALE_ID,
      title: "SCALE analysis",
      description: "",
      color: COLORS[index % COLORS.length],
      status: "evaluate",
      tasks: reviewTasks(),
    });
  }

  const STARTER_SEEDS = [
    { id: "best-rx-quantity-refill", title: "Best RX Quantity and Refill Resolution", description: "" },
    {
      id: "branding-packaging-onboarding",
      title: "Branding and packaging process onboarding",
      description: "Includes inventory and bottling.",
    },
    { id: "compliance-support", title: "Compliance support", description: "" },
    { id: "best-rx-enterprise-contract", title: "Best RX Enterprise Contract Plan Removal", description: "" },
    { id: "standalone-product-sites", title: "Standalone sites for each of our products", description: "" },
    { id: "ai-agents-support", title: "AI agents for support", description: "" },
    { id: "try-epiq", title: "Try Epiq", description: "" },
    { id: "white-label-offering", title: "White label offering", description: "" },
  ];

  const MODULE_SEEDS = [
    { id: "hard-candy-implementation", title: "Hard Candy implementation" },
    { id: "best-rx-independence", title: "Independence from Best Rx" },
    { id: CAPITAL_ID, title: "IT cost and spend" },
    { id: "labor-model-packaging", title: "Labor model; packaging" },
    {
      id: "labor-model-compounding", title: "Labor model: compounding", kind: "collection",
      description: "Collect observations about compounding labor, time, and output.",
    },
  ];
  const COLLECTION_FIELDS = ["Observation date / period", "Product / formulation", "Batch size / units produced",
    "Number of staff", "Total staff hours", "Setup time", "Compounding time", "Cleanup time",
    "Rework / delays", "Notes and data sources"];

  function prioritizeModules(items) {
    const remaining = items.slice();
    const first = MODULE_SEEDS.map((seed, index) => {
      const found = remaining.findIndex((item) => item.id === seed.id ||
        item.title.trim().toLowerCase() === seed.title.toLowerCase() ||
        (seed.id === CAPITAL_ID && item.title.trim().toLowerCase() === "capital it spend"));
      if (found !== -1) {
        const [item] = remaining.splice(found, 1);
        return { ...item, title: seed.title, kind: seed.kind || item.kind };
      }
      return normalizeItem({ ...seed, color: COLORS[index % COLORS.length],
        tasks: seed.kind === "collection"
          ? COLLECTION_FIELDS.map((text) => ({ text, answer: "", done: false }))
          : seed.id === CAPITAL_ID ? [...reviewTasks(), ...spendTasks()] : reviewTasks() });
    });
    return [...first, ...remaining];
  }

  function starterItems() {
    const items = STARTER_SEEDS.map((item, index) =>
      normalizeItem({
        ...item,
        color: COLORS[index % COLORS.length],
        status: "evaluate",
        tasks: reviewTasks(),
      }),
    );
    items.push(capitalItem(items.length));
    items.push(scaleItem(items.length));
    return prioritizeModules(items);
  }

  function withReview(item) {
    if (item.kind === "collection") return item;
    const have = new Set(item.tasks.map((task) => task.text.trim().toLowerCase()));
    const missing = reviewTasks().filter((task) => !have.has(task.text.toLowerCase()));
    return { ...item, tasks: [...missing, ...item.tasks] };
  }

  function ensureCapital(items) {
    const index = items.findIndex(
      (item) => item.id === CAPITAL_ID || item.title.trim().toLowerCase() === "capital it spend",
    );
    if (index === -1) return [...items, capitalItem(items.length)];
    const have = new Set(items[index].tasks.map((task) => task.text.trim().toLowerCase()));
    const missing = spendTasks().filter((task) => !have.has(task.text.toLowerCase()));
    if (!missing.length) return items;
    const next = items.slice();
    next[index] = { ...items[index], tasks: [...items[index].tasks, ...missing] };
    return next;
  }

  function ensureScale(items) {
    const present = items.some(
      (item) => item.id === SCALE_ID || item.title.trim().toLowerCase() === "scale analysis",
    );
    if (present) return items;
    return [...items, scaleItem(items.length)];
  }

  function migrate(saved, version) {
    let items = Array.isArray(saved) ? saved.map(normalizeItem).filter(Boolean) : [];
    if (version === STARTER_VERSION) return items;
    if (!items.length && (version == null || version === "")) items = starterItems();
    const reviewDone = version === "2" || version === "3" || version === "4" || version === "5";
    if (!reviewDone && items.length) items = items.map(withReview);
    if (version == null || version === "" || version === "1" || version === "2") items = ensureCapital(items);
    if (version == null || version === "" || version === "1" || version === "2" || version === "3") {
      items = ensureScale(items);
    }
    return prioritizeModules(items);
  }

  function progressOf(item) {
    const steps = item.tasks.length;
    const done = item.tasks.filter((task) => task.done).length;
    if (steps === 0) return { percent: 0, fraction: "—", percentLabel: "0%", label: CHECKLIST_LABEL };
    const percent = Math.round((done / steps) * 100);
    return { percent, fraction: `${done}/${steps}`, percentLabel: `${percent}%`, label: CHECKLIST_LABEL };
  }

  function nextThree(items) {
    return items
      .filter((item) => item.kind !== "collection" && item.status !== "completed")
      .slice(0, 3)
      .map((item) => ({
        id: item.id,
        title: item.title || "New task",
        nextAction: item.nextAction || "",
        blocked: item.status === "blocked",
        color: item.color,
      }));
  }

  function exportDocument(items) {
    return {
      pocket: "work-tracker",
      version: 1,
      items: items.map((item) => ({
        id: item.id,
        title: item.title,
        kind: item.kind,
        description: item.description,
        color: item.color,
        status: item.status,
        statusNote: item.statusNote,
        owner: item.owner,
        nextAction: item.nextAction,
        targetDate: item.targetDate,
        tasks: item.tasks.map((task) => ({ text: task.text, done: task.done, answer: task.answer })),
      })),
    };
  }

  function parseImport(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch (error) {
      return { ok: false, error: "That file is not valid JSON." };
    }
    const bare = Array.isArray(data);
    if (!bare) {
      if (!data || typeof data !== "object") return { ok: false, error: "That file has no list of initiatives." };
      if (data.pocket != null && data.pocket !== "work-tracker") {
        return { ok: false, error: "That file is not a Pocket backup." };
      }
    }
    const rawItems = bare ? data : data.items;
    if (!Array.isArray(rawItems)) return { ok: false, error: "That file has no list of initiatives." };
    if (!rawItems.length) return { ok: false, error: "That file has no initiatives." };
    if (rawItems.length > 200) return { ok: false, error: "That file has more initiatives than this list can hold." };
    const items = [];
    const seen = new Set();
    for (const raw of rawItems) {
      const item = normalizeItem(raw);
      if (!item) return { ok: false, error: "That file has an initiative that could not be read." };
      if (seen.has(item.id)) item.id = crypto.randomUUID();
      seen.add(item.id);
      items.push(item);
    }
    return { ok: true, items };
  }

  return {
    STORAGE_KEY,
    STARTER_KEY,
    STARTER_VERSION,
    COLORS,
    REVIEW,
    PHASES,
    CHECKLIST_LABEL,
    normalizeItem,
    migrate,
    progressOf,
    nextThree,
    exportDocument,
    parseImport,
    reviewKind,
    starterItems,
  };
});
