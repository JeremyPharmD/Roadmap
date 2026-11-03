(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PocketModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const STORAGE_KEY = "pocket-work-tracker";
  const STARTER_KEY = "pocket-work-tracker-starter";
  const STARTER_VERSION = "7";
  const COLORS = ["#b54a2a", "#1f6f8b", "#6b5e52"];
  const LEGACY_COLORS = {
    "#c24b2a": "#b54a2a",
    "#5c6b45": "#1f6f8b",
    "#b56a32": "#6b5e52",
  };
  const REVIEW = ["Cost savings", "Timing", "Effort", "Target delivery", "Regulatory check"];
  const PHASES = [
    { id: "evaluate", label: "Evaluate", short: "Evaluate" },
    { id: "feasibility", label: "Investigate feasibility", short: "Feasibility" },
    { id: "review", label: "Ready for review", short: "Review" },
    { id: "completed", label: "Completed", short: "Completed" },
    { id: "blocked", label: "Blocked", short: "Blocked" },
  ];
  const CHECK_TYPES = [
    { id: "action", label: "Action" },
    { id: "research", label: "Research question" },
    { id: "decision", label: "Decision needed" },
  ];
  const FREQUENCIES = [
    { id: "unknown", label: "Unknown" },
    { id: "monthly", label: "Monthly" },
    { id: "quarterly", label: "Quarterly" },
    { id: "annual", label: "Annual" },
    { id: "one-time", label: "One-time" },
  ];
  const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const DAY_START = 8 * 60;
  const DAY_END = 18 * 60;
  const CHECKLIST_LABEL = "Checklist complete";
  const CATEGORIES = [
    { id: "enterprise", label: "Enterprise Strategy" },
    { id: "technology", label: "Technology & Financial Planning" },
    { id: "operations", label: "Operations & People" },
    { id: "commercial", label: "Commercial & Launches" },
    { id: "compliance", label: "Compliance & Accreditation" },
  ];
  const HORIZONS = [
    { id: "now", label: "NOW", described: "0–90 days" },
    { id: "next", label: "NEXT", described: "3–6 months" },
    { id: "later", label: "Later / Unscheduled", described: "6+ months in the diagnostic" },
  ];
  const COMMITMENTS = [
    { id: "candidate", label: "Candidate" },
    { id: "committed", label: "Committed" },
    { id: "deferred", label: "Deferred" },
  ];
  const DELIVERY_STATUSES = [
    { id: "not-started", label: "Not started" },
    { id: "in-progress", label: "In progress" },
    { id: "done", label: "Done" },
    { id: "blocked", label: "Blocked" },
  ];
  const LAUNCH_STATUSES = [
    { id: "not-assessed", label: "Not assessed" },
    { id: "in-progress", label: "In progress" },
    { id: "blocked", label: "Blocked" },
    { id: "ready", label: "Ready" },
    { id: "not-applicable", label: "Not applicable" },
  ];
  const LAUNCH_FUNCTIONS = ["Commercial", "Technology", "Pharmacy", "Finance", "Inventory and packaging", "Customer support", "Compliance"];
  const SOURCE_LABEL = "User-provided consultant feedback";
  const SOURCE_NAME = "Scale Readiness & Operating System Diagnostic";
  const SOURCE_CITATION = "Prepared by Matt Cook, Scale That Works. Fieldwork September 14 and October 19, 2026.";
  const PORTFOLIO_REVIEW_TEMPLATE = [
    "What changed:",
    "",
    "Outcome progress:",
    "",
    "Capacity and stability concerns:",
    "",
    "Decisions needed:",
    "",
    "Work to start, continue, pause, or defer:",
    "",
    "Next review date:",
    "",
  ].join("\n");

  function cleanText(value, max) {
    if (typeof value !== "string") return "";
    return value.replace(/\r\n?/g, "\n").slice(0, max);
  }

  function cleanLine(value, max) {
    return cleanText(value, max).replace(/\n/g, " ").trim();
  }

  function cleanDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
    const [year, month, day] = value.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
      return "";
    }
    return value;
  }

  function cleanTimestamp(value) {
    if (typeof value !== "string" || !value.trim()) return "";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "";
    return parsed.toISOString();
  }

  function cleanMoney(value) {
    if (value == null || value === "") return null;
    const number = typeof value === "number" ? value : Number(String(value).trim());
    if (!Number.isFinite(number)) return null;
    return Math.round(number * 100) / 100;
  }

  function newId() {
    return crypto.randomUUID();
  }

  function checkType(value) {
    return CHECK_TYPES.some((type) => type.id === value) ? value : "action";
  }

  function frequency(value) {
    return FREQUENCIES.some((item) => item.id === value) ? value : "unknown";
  }

function reviewKind(text) {
  const name = String(text || "").trim().toLowerCase();
  if (name === "target delivery") return "date";
  if (REVIEW.some((line) => line.toLowerCase() === name)) return "text";
  return "";
}

function normalizeCheck(raw) {
  if (!raw || typeof raw !== "object") return null;
  const text = cleanText(raw.text, 2000);
  let answer = cleanLine(raw.answer, 500);
  if (reviewKind(text) === "date") answer = cleanDate(answer);
  return {
    id: typeof raw.id === "string" && raw.id.trim() ? raw.id.trim().slice(0, 80) : newId(),
    text,
    done: Boolean(raw.done),
    type: checkType(raw.type),
    due: cleanDate(typeof raw.due === "string" ? raw.due : ""),
journalId: cleanLine(raw.journalId, 80),
      workstream: cleanLine(raw.workstream, 80),
      horizon: HORIZONS.some((entry) => entry.id === raw.horizon) ? raw.horizon : "",
      answer,
  };
}

  function normalizeJournal(raw) {
    if (!raw || typeof raw !== "object") return null;
    const createdAt = cleanTimestamp(raw.createdAt) || new Date().toISOString();
    const updatedAt = cleanTimestamp(raw.updatedAt) || createdAt;
    return {
      id: typeof raw.id === "string" && raw.id.trim() ? raw.id.trim().slice(0, 80) : newId(),
      createdAt,
      updatedAt,
      title: cleanLine(raw.title, 200),
      body: cleanText(raw.body, 8000),
    };
  }

  function normalizeMaterial(raw) {
    if (!raw || typeof raw !== "object") return null;
    return {
      id: typeof raw.id === "string" && raw.id.trim() ? raw.id.trim().slice(0, 80) : newId(),
      title: cleanLine(raw.title, 200),
      url: cleanLine(raw.url, 500),
      notes: cleanText(raw.notes, 2000),
    };
  }

  function choiceId(list, value, fallback) {
    return list.some((entry) => entry.id === value) ? value : fallback;
  }

  function cleanQuantity(value) {
    if (value == null || value === "") return null;
    const number = typeof value === "number" ? value : Number(String(value).trim().replace(/[$,]/g, ""));
    if (!Number.isFinite(number)) return null;
    return Math.round(number * 100) / 100;
  }

  function normalizeDeliverable(raw) {
    if (!raw || typeof raw !== "object") return null;
    const quarter = /^\d{4}-Q[1-4]$/.test(raw.quarter) ? raw.quarter : "";
    const horizon = HORIZONS.some((entry) => entry.id === raw.horizon) ? raw.horizon : "";
    const outcome = cleanLine(raw.outcome || raw.text || "", 500);
    if (!quarter && !horizon && !outcome) return null;
    const recommendationIds = Array.isArray(raw.recommendationIds)
      ? raw.recommendationIds.filter((id) => typeof id === "string" && id).slice(0, 40)
      : [];
    return {
      id: typeof raw.id === "string" && raw.id.trim() ? raw.id.trim().slice(0, 80) : newId(),
      quarter,
      horizon,
      outcome,
      definitionOfDone: cleanText(raw.definitionOfDone, 2000),
      baseline: cleanLine(raw.baseline, 300),
      targetResult: cleanLine(raw.targetResult, 300),
      actualResult: cleanLine(raw.actualResult, 300),
      targetDate: cleanDate(typeof raw.targetDate === "string" ? raw.targetDate : ""),
      commitment: choiceId(COMMITMENTS, raw.commitment, "candidate"),
      status: choiceId(DELIVERY_STATUSES, raw.status, raw.done ? "done" : "not-started"),
      lead: cleanLine(raw.lead, 120),
      dependencies: cleanText(raw.dependencies, 2000),
      evidence: cleanText(raw.evidence, 2000),
      requiredCapabilities: cleanText(raw.requiredCapabilities, 2000),
      stabilityConcerns: cleanText(raw.stabilityConcerns, 2000),
      coverageConcerns: cleanText(raw.coverageConcerns, 2000),
      readinessEvidence: cleanText(raw.readinessEvidence, 2000),
      unresolvedConstraints: cleanText(raw.unresolvedConstraints, 2000),
      recommendationIds,
    };
  }

  function normalizeBudgetRow(raw) {
    if (!raw || typeof raw !== "object") return null;
    return {
      id: typeof raw.id === "string" && raw.id.trim() ? raw.id.trim().slice(0, 80) : newId(),
      vendor: cleanLine(raw.vendor, 160),
      category: cleanLine(raw.category, 80),
      frequency: frequency(raw.frequency),
      currentCost: cleanMoney(raw.currentCost),
      proposedCost: cleanMoney(raw.proposedCost),
      renewal: cleanDate(typeof raw.renewal === "string" ? raw.renewal : ""),
      notes: cleanLine(raw.notes, 300),
    };
  }

  function parseTime(value) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || "").trim());
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour > 23 || minute > 59 || minute % 30 !== 0) return null;
    return hour * 60 + minute;
  }

  function formatTime(minutes) {
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  function normalizeBlock(raw) {
    if (!raw || typeof raw !== "object") return null;
    const day = DAYS.includes(raw.day) ? raw.day : "Monday";
    const start = parseTime(raw.start);
    const end = parseTime(raw.end);
    return {
      id: typeof raw.id === "string" && raw.id.trim() ? raw.id.trim().slice(0, 80) : newId(),
      activity: cleanLine(raw.activity, 160),
      day,
      start: formatTime(start == null ? DAY_START : start),
      end: formatTime(end == null ? DAY_START + 30 : end),
      staffCount: raw.staffCount == null || raw.staffCount === "" ? "" : String(Math.max(0, Math.min(99, Number(raw.staffCount) || 0))),
      names: cleanLine(raw.names, 200),
      notes: cleanLine(raw.notes, 300),
    };
  }

  function blockError(block) {
    if (!DAYS.includes(block.day)) return "Choose Monday through Saturday.";
    const start = parseTime(block.start);
    const end = parseTime(block.end);
    if (start == null || end == null) return "Use a 30-minute time, such as 8:00 or 8:30.";
    if (start < DAY_START || end > DAY_END) return "Keep the block between 8:00 a.m. and 6:00 p.m.";
    if (end <= start) return "End time has to be after the start time.";
    return "";
  }

  function rowId(raw) {
    return typeof raw.id === "string" && raw.id.trim() ? raw.id.trim().slice(0, 80) : newId();
  }

  function normalizeScorecard(raw) {
    if (!raw || typeof raw !== "object") return null;
    return {
      id: rowId(raw),
      measure: cleanLine(raw.measure, 160),
      baseline: cleanLine(raw.baseline, 300),
      target: cleanLine(raw.target, 300),
      actual: cleanLine(raw.actual, 300),
      evidence: cleanLine(raw.evidence, 300),
      reviewDate: cleanDate(typeof raw.reviewDate === "string" ? raw.reviewDate : ""),
      status: cleanLine(raw.status, 40) || "not-set",
    };
  }

  function normalizeOperatingRow(raw) {
    if (!raw || typeof raw !== "object") return null;
    return {
      id: rowId(raw),
      date: cleanDate(typeof raw.date === "string" ? raw.date : ""),
      queue: cleanLine(raw.queue, 160),
      client: cleanLine(raw.client, 160),
      workType: cleanLine(raw.workType, 160),
      unit: cleanLine(raw.unit, 80),
      startWip: cleanQuantity(raw.startWip),
      incoming: cleanQuantity(raw.incoming),
      capacity: cleanQuantity(raw.capacity),
      actualEnd: cleanQuantity(raw.actualEnd),
      dueWork: cleanLine(raw.dueWork, 300),
      aging: cleanLine(raw.aging, 300),
      bottleneck: cleanLine(raw.bottleneck, 300),
      staffing: cleanLine(raw.staffing, 160),
      source: cleanLine(raw.source, 200),
      verifiedAt: cleanLine(raw.verifiedAt, 80),
      notes: cleanLine(raw.notes, 400),
      recovery: cleanLine(raw.recovery, 400),
    };
  }

  function normalizeThreshold(raw) {
    if (!raw || typeof raw !== "object") return null;
    const fields = ["aging", "staffing", "startWip", "incoming", "capacity", "actualEnd", "projected"];
    return {
      id: rowId(raw),
      name: cleanLine(raw.name, 160),
      field: fields.includes(raw.field) ? raw.field : "",
      direction: raw.direction === "below" ? "below" : "above",
      value: cleanQuantity(raw.value),
      unit: cleanLine(raw.unit, 80),
      notes: cleanLine(raw.notes, 300),
    };
  }

  function normalizeWorkflow(raw) {
    if (!raw || typeof raw !== "object") return null;
    return {
      id: rowId(raw),
      step: cleanLine(raw.step, 160),
      current: cleanText(raw.current, 1000),
      proposed: cleanText(raw.proposed, 1000),
      control: cleanLine(raw.control, 80),
      exception: cleanText(raw.exception, 1000),
      measurement: cleanText(raw.measurement, 1000),
      compliance: cleanLine(raw.compliance, 80) || "not-reviewed",
      questions: cleanText(raw.questions, 1000),
    };
  }

  function normalizeLaunchItem(raw) {
    if (!raw || typeof raw !== "object") return null;
    return {
      id: rowId(raw),
      function: cleanLine(raw.function, 80),
      requirement: cleanText(raw.requirement, 1000),
      owner: cleanLine(raw.owner, 120),
      status: choiceId(LAUNCH_STATUSES, raw.status, "not-assessed"),
      evidence: cleanText(raw.evidence, 1000),
      issue: cleanText(raw.issue, 1000),
      targetDate: cleanDate(typeof raw.targetDate === "string" ? raw.targetDate : ""),
    };
  }

  function normalizeLaunch(raw) {
    if (!raw || typeof raw !== "object") return null;
    return {
      id: rowId(raw),
      name: cleanLine(raw.name, 160),
      items: Array.isArray(raw.items) ? raw.items.map(normalizeLaunchItem).filter(Boolean) : [],
    };
  }

  function normalizeBridge(raw) {
    if (!raw || typeof raw !== "object") return null;
    return {
      id: rowId(raw),
      name: cleanLine(raw.name, 200),
      systems: cleanLine(raw.systems, 200),
      frequency: cleanLine(raw.frequency, 160),
      effort: cleanLine(raw.effort, 160),
      disposition: cleanLine(raw.disposition, 80),
      lead: cleanLine(raw.lead, 120),
      dependencies: cleanLine(raw.dependencies, 300),
      status: cleanLine(raw.status, 80),
      evidence: cleanText(raw.evidence, 1000),
    };
  }

  function normalizePlaybook(raw) {
    if (!raw || typeof raw !== "object") return null;
    return {
      id: rowId(raw),
      name: cleanLine(raw.name, 160),
      trigger: cleanText(raw.trigger, 1000),
      impact: cleanText(raw.impact, 1000),
      response: cleanText(raw.response, 2000),
      escalation: cleanText(raw.escalation, 1000),
      fallback: cleanText(raw.fallback, 2000),
      recovery: cleanText(raw.recovery, 2000),
      verification: cleanText(raw.verification, 1000),
      exercised: cleanDate(typeof raw.exercised === "string" ? raw.exercised : ""),
      gaps: cleanText(raw.gaps, 2000),
    };
  }

  function normalizeRule(raw) {
    if (!raw || typeof raw !== "object") return null;
    return {
      id: rowId(raw),
      name: cleanLine(raw.name, 160),
      rule: cleanText(raw.rule, 2000),
      exceptions: cleanText(raw.exceptions, 1000),
      notes: cleanText(raw.notes, 1000),
    };
  }

  function normalizeEconomics(raw) {
    if (!raw || typeof raw !== "object") return null;
    return {
      id: rowId(raw),
      client: cleanLine(raw.client, 160),
      period: cleanLine(raw.period, 80),
      unit: cleanLine(raw.unit, 80),
      revenue: cleanQuantity(raw.revenue),
      labor: cleanQuantity(raw.labor),
      packaging: cleanQuantity(raw.packaging),
      support: cleanQuantity(raw.support),
      engineering: cleanQuantity(raw.engineering),
      inventory: cleanQuantity(raw.inventory),
      exceptions: cleanQuantity(raw.exceptions),
      notes: cleanLine(raw.notes, 400),
    };
  }

  function normalizeFeedback(raw) {
    if (!raw || typeof raw !== "object") return null;
    return {
      id: rowId(raw),
      client: cleanLine(raw.client, 160),
      note: cleanText(raw.note, 2000),
      evidence: cleanText(raw.evidence, 1000),
      implication: cleanText(raw.implication, 1000),
      followUp: cleanText(raw.followUp, 1000),
    };
  }

  function normalizeDecision(raw) {
    if (!raw || typeof raw !== "object") return null;
    return {
      id: rowId(raw),
      category: cleanLine(raw.category, 160),
      rule: cleanText(raw.rule, 2000),
      authority: cleanLine(raw.authority, 160),
      trigger: cleanText(raw.trigger, 1000),
      exceptions: cleanText(raw.exceptions, 1000),
      reviewDate: cleanDate(typeof raw.reviewDate === "string" ? raw.reviewDate : ""),
      notes: cleanText(raw.notes, 1000),
    };
  }

  function normalizeCapacityRow(raw) {
    if (!raw || typeof raw !== "object") return null;
    return {
      id: rowId(raw),
      day: cleanLine(raw.day, 40),
      client: cleanLine(raw.client, 160),
      workType: cleanLine(raw.workType, 160),
      quantity: cleanQuantity(raw.quantity),
      quantityUnit: cleanLine(raw.quantityUnit, 80),
      hours: cleanQuantity(raw.hours),
      conversion: cleanLine(raw.conversion, 200),
      notes: cleanLine(raw.notes, 300),
    };
  }

  function normalizeCoverage(raw) {
    if (!raw || typeof raw !== "object") return null;
    return {
      id: rowId(raw),
      role: cleanLine(raw.role, 160),
      primary: cleanLine(raw.primary, 160),
      secondary: cleanLine(raw.secondary, 160),
      notes: cleanLine(raw.notes, 300),
    };
  }

  function emptyTools() {
    return {
      scorecard: null,
      portfolioReview: false,
      operating: null,
      workflow: null,
      launches: null,
      bridges: null,
      playbooks: null,
      commercial: null,
      decisions: null,
      capacity: null,
    };
  }

  function normalizeTools(raw) {
    const tools = emptyTools();
    if (!raw || typeof raw !== "object") return tools;
    if (Array.isArray(raw.scorecard)) tools.scorecard = raw.scorecard.map(normalizeScorecard).filter(Boolean);
    tools.portfolioReview = Boolean(raw.portfolioReview);
    if (raw.operating && typeof raw.operating === "object") {
      tools.operating = {
        rows: Array.isArray(raw.operating.rows) ? raw.operating.rows.map(normalizeOperatingRow).filter(Boolean) : [],
        thresholds: Array.isArray(raw.operating.thresholds) ? raw.operating.thresholds.map(normalizeThreshold).filter(Boolean) : [],
      };
    }
    if (Array.isArray(raw.workflow)) tools.workflow = raw.workflow.map(normalizeWorkflow).filter(Boolean);
    if (Array.isArray(raw.launches)) tools.launches = raw.launches.map(normalizeLaunch).filter(Boolean);
    if (Array.isArray(raw.bridges)) tools.bridges = raw.bridges.map(normalizeBridge).filter(Boolean);
    if (Array.isArray(raw.playbooks)) tools.playbooks = raw.playbooks.map(normalizePlaybook).filter(Boolean);
    if (raw.commercial && typeof raw.commercial === "object") {
      tools.commercial = {
        rules: Array.isArray(raw.commercial.rules) ? raw.commercial.rules.map(normalizeRule).filter(Boolean) : [],
        economics: Array.isArray(raw.commercial.economics) ? raw.commercial.economics.map(normalizeEconomics).filter(Boolean) : [],
        feedback: Array.isArray(raw.commercial.feedback) ? raw.commercial.feedback.map(normalizeFeedback).filter(Boolean) : [],
      };
    }
    if (Array.isArray(raw.decisions)) tools.decisions = raw.decisions.map(normalizeDecision).filter(Boolean);
    if (raw.capacity && typeof raw.capacity === "object") {
      tools.capacity = {
        rows: Array.isArray(raw.capacity.rows) ? raw.capacity.rows.map(normalizeCapacityRow).filter(Boolean) : [],
        coverage: Array.isArray(raw.capacity.coverage) ? raw.capacity.coverage.map(normalizeCoverage).filter(Boolean) : [],
      };
    }
    return tools;
  }

  function projectColor(value) {
    const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
    const mapped = LEGACY_COLORS[raw] || raw;
    return COLORS.includes(mapped) ? mapped : COLORS[0];
  }

  function normalizeItem(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const stageSource = raw.stage || raw.status;
    const stage = PHASES.some((phase) => phase.id === stageSource) ? stageSource : "evaluate";
    const color = projectColor(raw.color);
    const legacyTasks = Array.isArray(raw.tasks) ? raw.tasks : [];
    const checklistSource = Array.isArray(raw.checklist) ? raw.checklist : legacyTasks;
    const brief = raw.brief && typeof raw.brief === "object" ? raw.brief : {};
    const summary = cleanText(raw.summary || "", 2000) || cleanText(raw.description, 2000);
    const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim().slice(0, 80) : newId();
    const budget = Array.isArray(raw.budget) ? raw.budget.map(normalizeBudgetRow).filter(Boolean) : null;
    const schedule = raw.schedule && typeof raw.schedule === "object"
      ? { blocks: Array.isArray(raw.schedule.blocks) ? raw.schedule.blocks.map(normalizeBlock).filter(Boolean) : [] }
      : null;
    return {
      id,
      title: cleanText(raw.title, 2000),
      summary,
      color,
      stage,
      archived: Boolean(raw.archived),
      nextStep: cleanLine(raw.nextStep || raw.nextAction || "", 200),
      updatedAt: cleanTimestamp(raw.updatedAt),
      owner: cleanLine(raw.owner, 120),
      targetDate: cleanDate(typeof raw.targetDate === "string" ? raw.targetDate : ""),
      statusNote: cleanLine(raw.statusNote, 500),
      brief: {
        purpose: cleanText(brief.purpose, 4000),
        scope: cleanText(brief.scope, 4000) || cleanLine(raw.statusNote, 500),
        outcome: cleanText(brief.outcome, 4000),
      },
      checklist: checklistSource.map(normalizeCheck).filter(Boolean),
      journal: Array.isArray(raw.journal) ? raw.journal.map(normalizeJournal).filter(Boolean) : [],
      materials: Array.isArray(raw.materials) ? raw.materials.map(normalizeMaterial).filter(Boolean) : [],
      relatedIds: Array.isArray(raw.relatedIds) ? raw.relatedIds.filter((item) => typeof item === "string" && item && item !== id).slice(0, 40) : [],
      deliverables: Array.isArray(raw.deliverables) ? raw.deliverables.map(normalizeDeliverable).filter(Boolean) : [],
      budget,
      schedule,
      workstreams: Array.isArray(raw.workstreams) ? raw.workstreams.map((item) => cleanLine(item, 80)).filter(Boolean).slice(0, 8) : [],
      category: choiceId(CATEGORIES, raw.category, ""),
      reviewHost: Boolean(raw.reviewHost),
      tools: normalizeTools(raw.tools),
    };
  }

  function line(text, type, workstream, horizon) {
    return {
      text,
      type: type || "action",
      workstream: workstream || "",
      horizon: horizon || "",
      done: false,
      due: "",
      journalId: "",
      answer: "",
    };
  }

  function budgetRow(vendor, category) {
    return { vendor, category, frequency: "unknown", currentCost: null, proposedCost: null, renewal: "", notes: "" };
  }

  function projectSeed(seed, index) {
    return normalizeItem({
      id: seed.id,
      title: seed.title,
      summary: seed.summary,
      color: COLORS[index % COLORS.length],
      stage: "evaluate",
      nextStep: seed.nextStep || "",
      brief: { purpose: seed.purpose, scope: seed.scope || "", outcome: seed.outcome || "" },
      checklist: seed.checklist,
      workstreams: seed.workstreams || [],
      materials: seed.materials || [],
      budget: seed.budget || null,
      schedule: seed.schedule || null,
      category: seed.category || "",
      reviewHost: Boolean(seed.reviewHost),
      tools: seed.tools || null,
      relatedIds: seed.relatedIds || [],
    });
  }

  const STRATEGY = [
    {
      category: "technology",
      id: "it-systems-financial-plan",
      legacyIds: ["capital-it-spend"],
      legacyTitles: ["capital it spend", "it systems financial plan"],
      title: "IT Systems Financial Plan",
      summary: "A working picture of IT spending, commitments, and where the number can come down.",
      purpose: "Establish a true IT budget and understand current spending, commitments, and opportunities.",
      scope: "Heavy licensing, subscriptions, hosting, labor, and known vendor commitments. This is not a claim that every cost is known yet.",
      outcome: "A budget with current cost, proposed cost, and a clear gap between what is known and what is still unknown.",
      nextStep: "Fill in the costs that are known and mark the rest unknown.",
      checklist: [
        line("BestRx enterprise contract", "action"),
        line("Redlime work and costs", "action"),
        line("BestRx API call volume, pricing, and cost", "research"),
        line("AI spending", "action"),
        line("IT labor and offshore development strategy", "decision"),
        line("Hosting costs", "action"),
        line("Other licensing, subscriptions, and recurring IT expenses", "action"),
        line("IT audit and resulting recommendations", "research"),
      ],
      budget: [
        budgetRow("BestRx enterprise contract", "Licensing"),
        budgetRow("Redlime", "Vendor"),
        budgetRow("BestRx API", "Usage"),
        budgetRow("AI spending", "Usage"),
        budgetRow("IT labor, including offshore development", "Labor"),
        budgetRow("Hosting", "Hosting"),
        budgetRow("Other licensing and subscriptions", "Licensing"),
      ],
    },
    {
      category: "technology",
      id: "independence-from-bestrx",
      legacyIds: [],
      legacyTitles: ["independence from bestrx"],
      title: "Independence from BestRx",
      summary: "Decide what independence from BestRx should mean, starting with non-controlled API prescriptions.",
      purpose: "Define and plan the intended level of independence from BestRx.",
      scope: "Initial focus is non-controlled, API-based prescriptions. Controlled prescriptions are outside this first scope. Feasibility is still an open question.",
      outcome: "A stated target for independence, with the workflows, integrations, constraints, and evidence still required.",
      nextStep: "Write down the current dependencies before choosing a target.",
      checklist: [
        line("Non-controlled, API-based prescriptions in scope", "research"),
        line("Current BestRx dependencies", "research"),
        line("Required workflows, integrations, and data access", "research"),
        line("Alternatives and migration work", "action"),
        line("Constraints and unanswered questions", "decision"),
        line("Evidence and acceptance criteria needed to demonstrate independence", "decision"),
      ],
    },
    {
      id: "labor-model-scheduling",
      legacyIds: [],
      legacyTitles: ["labor model & scheduling", "labor model and scheduling"],
      title: "Labor Model & Scheduling",
      summary: "A weekly template for the work that has to happen, not a dated employee calendar.",
      purpose: "Define required work throughout the week and establish a practical labor model and schedule.",
      scope: "Monday through Saturday, 8:00 a.m. to 6:00 p.m. Employee names on a block are notes on the template, not assignments in this app.",
      outcome: "A weekly template that shows the work, the time, and the open staffing questions.",
      nextStep: "Block the work that already has a known time.",
      checklist: [
        line("List the work that has to happen through the week", "action"),
        line("Draft the weekly template", "action"),
        line("Note open questions about staffing", "research"),
        line("Review overtime.", "action", "", "now"),
        line("Review management span and role overload.", "research", "", "now"),
        line("Identify single points of knowledge.", "research", "", "now"),
        line("Review recent turnover before adding another major wave of work.", "research", "", "now"),
        line("Forecast demand by day, client, and work type.", "research", "", "next"),
        line("Translate demand into staffing, shift, and flex-capacity needs.", "action", "", "next"),
        line("Define primary and secondary coverage.", "action", "", "next"),
        line("Establish cross-training for critical roles, clients, systems, and equipment.", "action", "", "next"),
      ],
      schedule: { blocks: [] },
      category: "operations",
      tools: { capacity: { rows: [], coverage: [] } },
    },
    {
      category: "technology",
      id: "epiqscripts-revamp",
      legacyIds: [],
      legacyTitles: ["epiqscripts.com revamp"],
      title: "epiqscripts.com Revamp",
      summary: "Define what the website revamp has to accomplish before build work piles up.",
      purpose: "Define and track the epiqscripts.com revamp.",
      scope: "Goals, audiences, content, navigation, functionality, design, development, and launch.",
      outcome: "An agreed site, with launch requirements and acceptance criteria written down.",
      nextStep: "Name the audiences and what each one needs from the site.",
      checklist: [
        line("Website goals and audiences", "research"),
        line("Content and navigation", "action"),
        line("Required functionality", "research"),
        line("Design and development", "action"),
        line("Launch requirements and acceptance criteria", "decision"),
      ],
    },
    {
      category: "commercial",
      id: "private-label-sites",
      legacyIds: ["white-label-offering"],
      legacyTitles: ["white label offering", "private label sites & provider network"],
      title: "Private Label Sites & Provider Network",
      summary: "Private-label sites for specific projects, and the provider network those sites need.",
      purpose: "Develop private-label sites for specific projects and the provider network needed to support them.",
      scope: "Two workstreams: the sites and offering, and the provider network. Content is not copied between related projects.",
      outcome: "A clear set of sites and the network required to operate them.",
      nextStep: "Separate the site work from the network work.",
      workstreams: ["Sites and offering", "Provider network"],
      checklist: [
        line("Define which projects get a private-label site", "decision", "Sites and offering"),
        line("Outline the offering on each site", "action", "Sites and offering"),
        line("Identify the provider network the sites need", "research", "Provider network"),
        line("List unanswered questions about the network", "research", "Provider network"),
      ],
    },
    {
      category: "compliance",
      id: "compliance-support",
      legacyIds: ["compliance-support"],
      legacyTitles: ["compliance support"],
      title: "Compliance support",
      summary: "Keep compliance support visible as its own initiative.",
      purpose: "Track the compliance work that has to be understood before the initiative can move.",
      scope: "",
      outcome: "",
      checklist: [
        line("Cost savings", "research"),
        line("Timing", "research"),
        line("Effort", "research"),
        line("Target delivery", "decision"),
        line("Regulatory check", "decision"),
      ],
    },
    {
      category: "technology",
      id: "ai-agents-support",
      legacyIds: ["ai-agents-support"],
      legacyTitles: ["ai agents for support"],
      title: "AI agents for support",
      summary: "Decide where support agents would help, and what has to be true first.",
      purpose: "Understand whether AI agents for support are worth pursuing, and what they would need.",
      scope: "",
      outcome: "",
      checklist: [
        line("Where an agent would take work off the team", "research"),
        line("What the agent must not do", "decision"),
        line("Evidence that would justify a pilot", "research"),
      ],
    },
    {
      id: "scale-analysis",
      legacyIds: ["scale-analysis"],
      legacyTitles: ["scale analysis", "scale business review"],
      title: "SCALE analysis",
      category: "enterprise",
      reviewHost: true,
      summary: "The user-provided scale-readiness diagnostic, kept as a planning input rather than an approved plan.",
      purpose: "Hold the Scale Readiness & Operating System Diagnostic and the separate response to each recommendation.",
      scope: "Prepared by Matt Cook, Scale That Works, from fieldwork on September 14 and October 19, 2026. It is an expert scale-readiness assessment, not an operational audit, regulatory opinion, financial diligence, or completed customer study. The file itself is not stored in this app.",
      outcome: "Each recommendation keeps its source wording, with a response and action plan that Epiq writes.",
      nextStep: "Read a recommendation and write the response separately from the source wording.",
      checklist: [
        line("What SCALE needs to make clear", "research"),
        line("Evidence still missing", "research"),
        line("Decision this analysis has to support", "decision"),
        line("Record what is accepted, revised, or deferred from the diagnostic.", "decision"),
      ],
      materials: [
        {
          title: "Scale Readiness & Operating System Diagnostic",
          url: "",
          notes: "User-provided file. Prepared by Matt Cook, Scale That Works. Fieldwork September 14 and October 19, 2026. Planning input, not an approved commitment.",
        },
      ],
    },
    {
      id: "enterprise-priorities",
      legacyIds: [],
      legacyTitles: ["enterprise priorities & epiq plans", "enterprise priorities and epiq plans"],
      title: "Enterprise Priorities & Epiq Plans",
      category: "enterprise",
      summary: "Decide the next six months, and define what pause-and-harden and Epiq Plans mean before treating either as a plan.",
      purpose: "Confirm the next six-month enterprise priorities and define a minimum viable Epiq Plans program without assuming what that program is.",
      scope: "Priorities, a measurable pause-and-harden scorecard, and an open definition of Epiq Plans. The diagnostic proposes a lightweight planning layer for a rolling six-month plan, launch readiness, the transformation portfolio, dependencies, a weekly review, and finish-before-adding. That proposal is not an approved definition. Nothing here is an approved target until someone enters it.",
      outcome: "Written priorities, a scorecard with room for real baselines, and a weekly review rhythm.",
      nextStep: "Write the open question: what Epiq Plans is for.",
      checklist: [
        line("Confirm the next six-month enterprise priorities.", "decision", "", "now"),
        line("Define “pause and harden” in measurable terms.", "decision", "", "now"),
        line("What is the purpose, scope, minimum viable offering, and launch criteria for Epiq Plans?", "research", "", "now"),
        line("Define and launch a minimum viable Epiq Plans program.", "action", "", "now"),
        line("Record an accountable program leader.", "action", "", "now"),
        line("Establish a weekly cross-functional portfolio review.", "action", "", "now"),
      ],
      tools: {
        portfolioReview: true,
        scorecard: [
          { measure: "Queue aging", baseline: "", target: "", actual: "", evidence: "", reviewDate: "", status: "suggestion" },
          { measure: "Defects", baseline: "", target: "", actual: "", evidence: "", reviewDate: "", status: "suggestion" },
          { measure: "Recovery readiness", baseline: "", target: "", actual: "", evidence: "", reviewDate: "", status: "suggestion" },
          { measure: "Data reliability", baseline: "", target: "", actual: "", evidence: "", reviewDate: "", status: "suggestion" },
          { measure: "Staff overload", baseline: "", target: "", actual: "", evidence: "", reviewDate: "", status: "suggestion" },
          { measure: "Launch has a visible readiness plan and go/no-go owner", baseline: "", target: "", actual: "", evidence: "", reviewDate: "", status: "suggestion" },
          { measure: "Backlog recovered through planned capacity rather than routine overtime", baseline: "", target: "", actual: "", evidence: "", reviewDate: "", status: "suggestion" },
          { measure: "Same five enterprise priorities, with work explicitly deferred", baseline: "", target: "", actual: "", evidence: "", reviewDate: "", status: "suggestion" },
          { measure: "Recovery scenarios exercised before a customer-impacting event", baseline: "", target: "", actual: "", evidence: "", reviewDate: "", status: "suggestion" },
        ],
      },
    },
    {
      id: "daily-operating-control",
      legacyIds: [],
      legacyTitles: ["daily operating control & data reliability", "daily operating control and data reliability"],
      title: "Daily Operating Control & Data Reliability",
      category: "operations",
      summary: "A manual daily view of queues, due work, and recovery. It is not a live feed.",
      purpose: "Make queue and aging data trustworthy enough for daily decisions, and record due work, bottlenecks, staffing, and recovery.",
      scope: "Manual entries only. Unlike units are not added together. Missing inputs stay unknown. Thresholds are blank until someone sets them.",
      outcome: "A daily table people can trust because it shows what is known and what is not.",
      nextStep: "Enter one queue with its unit of work before adding another.",
      checklist: [
        line("Create a daily operating-control view.", "action", "", "now"),
        line("Make queue and aging data trustworthy enough for daily decisions.", "research", "", "now"),
        line("Record due work, bottlenecks, staffing, and recovery thresholds.", "action", "", "now"),
      ],
      tools: { operating: { rows: [], thresholds: [] } },
    },
    {
      id: "production-workflow",
      legacyIds: [],
      legacyTitles: ["production workflow & pv1/pv2 design", "production workflow and pv1/pv2 design"],
      title: "Production Workflow & PV1/PV2 Design",
      category: "operations",
      summary: "Define a bounded high-throughput flow and keep PV1/PV2 as an open design question.",
      purpose: "Finish the current workstation, label, and scan workflow for one bounded client flow, and clarify the PV1/PV2 future state with pharmacy compliance.",
      scope: "PV1/PV2 is not given a meaning here. Proposed controls are not compliance-approved. Acceptance criteria still have to be written.",
      outcome: "A bounded flow with evidence of productivity and defects, and a control register that still has its open questions.",
      nextStep: "Name the bounded client flow before adding steps.",
      checklist: [
        line("Complete the current high-throughput workstation, point-of-use label, and scan workflow for a bounded client flow.", "action", "", "now"),
        line("Define the bounded flow and acceptance criteria.", "decision", "", "now"),
        line("Measure actual productivity and defect performance.", "research", "", "now"),
        line("Clarify the PV1/PV2 future-state design with pharmacy compliance.", "research", "", "now"),
        line("Classify proposed controls as clinical, clerical, deterministic, or exception based.", "decision", "", "now"),
        line("Establish role-level productivity and proficiency measures only where the process is stable enough for a standard.", "research", "", "next"),
      ],
      tools: { workflow: [] },
    },
    {
      id: "client-launch-readiness",
      legacyIds: [],
      legacyTitles: ["client launch readiness"],
      title: "Client Launch Readiness",
      category: "commercial",
      summary: "One reusable launch checklist, and a separate record for each client or offering.",
      purpose: "See whether a launch is ready across commercial, technology, pharmacy, finance, inventory and packaging, customer support, and compliance.",
      scope: "Includes private-label sites, the provider network, stick packs, and Epiq Plans as related work. A checked or ready item does not approve a launch.",
      outcome: "Separate launch records that show missing owners and missing evidence instead of hiding them.",
      nextStep: "Copy the reusable checklist for the first client or offering.",
      relatedIds: ["private-label-sites", "enterprise-priorities"],
      checklist: [
        line("Create one reusable launch-readiness checklist.", "action", "", "now"),
        line("Support separate launch records for different clients or offerings.", "action", "", "now"),
        line("Cover commercial, technology, pharmacy, finance, inventory and packaging, customer support, and compliance.", "action", "", "now"),
        line("Note how stick packs use this checklist.", "research", "", "now"),
      ],
      tools: {
        launches: [
          {
            name: "Reusable launch checklist",
            items: [
              "Commercial",
              "Technology",
              "Pharmacy",
              "Finance",
              "Inventory and packaging",
              "Customer support",
              "Compliance",
            ].map((name) => ({
              function: name,
              requirement: "",
              owner: "",
              status: "not-assessed",
              evidence: "",
              issue: "",
              targetDate: "",
            })),
          },
        ],
      },
    },
    {
      id: "system-bridges",
      legacyIds: [],
      legacyTitles: ["system bridges & epiq connect governance", "system bridges and epiq connect governance"],
      title: "System Bridges & Epiq Connect Governance",
      category: "technology",
      summary: "Name the manual bridges and exceptions, then decide which ones to automate, eliminate, or own.",
      purpose: "Identify the top manual system bridges and recurring exceptions, and define how Epiq Connect changes are governed.",
      scope: "Linked to the IT financial plan and to independence from BestRx. Governance topics are release, testing, monitoring, reconciliation, recovery, auditability, security, and ownership.",
      outcome: "A prioritized register with a disposition for each bridge, and a written governance list that is still a draft until filled in.",
      nextStep: "Add the first bridge or exception that people do by hand.",
      relatedIds: ["it-systems-financial-plan", "independence-from-bestrx"],
      checklist: [
        line("Identify the top ten manual system bridges and recurring exceptions.", "research", "", "now"),
        line("Choose whether to automate, eliminate, or explicitly own each.", "decision", "", "now"),
        line("Define Epiq Connect governance for release, testing, monitoring, reconciliation, recovery, auditability, security, and ownership.", "decision", "", "next"),
      ],
      tools: { bridges: [] },
    },
    {
      id: "business-continuity",
      legacyIds: [],
      legacyTitles: ["business continuity & equipment reliability", "business continuity and equipment reliability"],
      title: "Business Continuity & Equipment Reliability",
      category: "operations",
      summary: "Empty playbooks for the outages and shortages that need a plan. None of them is marked as tested.",
      purpose: "Prepare playbooks for an Epiq Connect outage, a BestRx dependency failure, a pharmacist shortfall, key equipment failure, and a material service interruption.",
      scope: "Procedure fields start blank. A playbook with no exercise date has not been tested.",
      outcome: "Playbooks people can fill from what they actually do, plus the maintenance work that comes after.",
      nextStep: "Write the trigger for one playbook. Leave the rest blank until it is known.",
      checklist: [
        line("Create playbooks for an Epiq Connect outage, a BestRx dependency failure, a pharmacist shortfall, key equipment failure, and a material service interruption.", "action", "", "now"),
        line("Plan preventive maintenance.", "action", "", "next"),
        line("Plan spare parts.", "action", "", "next"),
        line("Track equipment downtime.", "action", "", "next"),
        line("Write the vendor escalation path.", "action", "", "next"),
      ],
      tools: {
        playbooks: [
          "Epiq Connect outage",
          "BestRx dependency failure",
          "Pharmacist shortfall",
          "Key equipment failure",
          "Material service interruption",
        ].map((name) => ({
          name,
          trigger: "",
          impact: "",
          response: "",
          escalation: "",
          fallback: "",
          recovery: "",
          verification: "",
          exercised: "",
          gaps: "",
        })),
      },
    },
    {
      id: "commercial-model",
      legacyIds: [],
      legacyTitles: ["commercial model, client economics & voice of customer", "commercial model, client economics and voice of customer"],
      title: "Commercial Model, Client Economics & Voice of Customer",
      category: "commercial",
      summary: "Rules, cost components, and client feedback. Blank costs stay blank, and the tables do not declare a profit.",
      purpose: "Define standard, configurable, and custom commercial rules, connect them to operating complexity, and listen to high-value clients.",
      scope: "Cost components can include direct labor, packaging, support, engineering and implementation, inventory, and exception burden. Each figure needs a period and a unit.",
      outcome: "Editable rules, an economics table that flags incomplete rows, and feedback with a follow-up.",
      nextStep: "Name the first commercial rule before entering any numbers.",
      checklist: [
        line("Define Standard / Configurable / Custom commercial rules.", "decision", "", "next"),
        line("Connect pricing and volume commitments to operating complexity.", "research", "", "next"),
        line("Develop contribution economics by client and service configuration.", "research", "", "next"),
        line("Include direct labor, packaging, support, engineering and implementation, inventory, and exception burden.", "research", "", "next"),
        line("Conduct a Voice-of-Customer pulse with representative high-value clients.", "action", "", "next"),
      ],
      tools: { commercial: { rules: [], economics: [], feedback: [] } },
    },
    {
      id: "leadership-operating-model",
      legacyIds: [],
      legacyTitles: ["leadership operating model & decision rights", "leadership operating model and decision rights"],
      title: "Leadership Operating Model & Decision Rights",
      category: "enterprise",
      summary: "Site-leader standard work and the decision boundaries that are still unwritten.",
      purpose: "Define how site leaders run the day and the week, and where executive decisions have a boundary.",
      scope: "Decision rights cover pricing, hiring, operational priorities, technology, client commitments, and exceptions. Authority is optional text, not an account.",
      outcome: "A cadence people can point to, and a register of decision rules that starts empty.",
      nextStep: "Write one decision boundary before assigning any authority.",
      checklist: [
        line("Define site-leader standard work.", "action", "", "next"),
        line("Establish daily and weekly performance cadence.", "action", "", "next"),
        line("Define shift handoffs, labor flex rules, and coaching expectations.", "decision", "", "next"),
        line("Define executive decision-rights guardrails for pricing, hiring, operational priorities, technology, client commitments, and exceptions.", "decision", "", "next"),
      ],
      tools: {
        decisions: ["Pricing", "Hiring", "Operational priorities", "Technology", "Client commitments", "Exceptions"].map((category) => ({
          category,
          rule: "",
          authority: "",
          trigger: "",
          exceptions: "",
          reviewDate: "",
          notes: "",
        })),
      },
    },
  ];

  function seedProjects() {
    return STRATEGY.map((seed, index) => projectSeed(seed, index));
  }

  function sameText(left, right) {
    return String(left || "").trim().toLowerCase() === String(right || "").trim().toLowerCase();
  }

  const CHECK_ALIASES = {
    "redlime work and costs": ["redline solutions"],
  };

  function hasCheck(item, text) {
    const names = new Set([text.trim().toLowerCase(), ...(CHECK_ALIASES[text.trim().toLowerCase()] || [])]);
    return item.checklist.some((entry) => names.has(entry.text.trim().toLowerCase()));
  }

  function enrich(existing, seed) {
    const item = normalizeItem(existing);
    if (seed.legacyTitles.some((title) => sameText(title, item.title) && !sameText(title, seed.title))) {
      item.title = seed.title;
    }
    if (!item.summary) item.summary = seed.summary;
    if (!item.brief.purpose) item.brief.purpose = seed.purpose;
    if (!item.brief.scope) item.brief.scope = seed.scope || "";
    if (!item.brief.outcome) item.brief.outcome = seed.outcome || "";
    if (!item.nextStep) item.nextStep = seed.nextStep || "";
    if (seed.workstreams && !item.workstreams.length) item.workstreams = seed.workstreams.slice();
    if (!item.category && seed.category) item.category = seed.category;
    if (seed.reviewHost) item.reviewHost = true;
    for (const entry of seed.checklist) {
      if (reviewKind(entry.text)) continue;
      if (!hasCheck(item, entry.text)) item.checklist.push(normalizeCheck({ ...entry, id: newId(), done: false, horizon: entry.horizon || "" }));
    }
    if (seed.budget && !item.budget) item.budget = seed.budget.map((row) => normalizeBudgetRow({ ...row, id: newId() }));
    if (seed.schedule && !item.schedule) item.schedule = { blocks: [] };
    if (seed.tools) item.tools = mergeTools(item.tools, seed.tools);
    return item;
  }

  function cloneWithIds(value) {
    if (Array.isArray(value)) return value.map((entry) => cloneWithIds(entry));
    if (!value || typeof value !== "object") return value;
    const copy = {};
    for (const [key, entry] of Object.entries(value)) copy[key] = cloneWithIds(entry);
    if (Object.prototype.hasOwnProperty.call(value, "id") || copy.id == null) copy.id = newId();
    return copy;
  }

  function mergeTools(current, seed) {
    const tools = current || emptyTools();
    const incoming = normalizeTools(seed);
    if (tools.scorecard == null && incoming.scorecard) tools.scorecard = incoming.scorecard.map((row) => ({ ...row, id: newId() }));
    if (incoming.portfolioReview) tools.portfolioReview = true;
    if (tools.operating == null && incoming.operating) tools.operating = { rows: [], thresholds: [] };
    if (tools.workflow == null && incoming.workflow) tools.workflow = incoming.workflow.map((row) => ({ ...row, id: newId() }));
    if (tools.launches == null && incoming.launches) tools.launches = cloneWithIds(incoming.launches);
    if (tools.bridges == null && incoming.bridges) tools.bridges = incoming.bridges.map((row) => ({ ...row, id: newId() }));
    if (tools.playbooks == null && incoming.playbooks) tools.playbooks = incoming.playbooks.map((row) => ({ ...row, id: newId() }));
    if (tools.commercial == null && incoming.commercial) tools.commercial = { rules: [], economics: [], feedback: [] };
    if (tools.decisions == null && incoming.decisions) tools.decisions = incoming.decisions.map((row) => ({ ...row, id: newId() }));
    if (tools.capacity == null && incoming.capacity) tools.capacity = { rows: [], coverage: [] };
    return tools;
  }

  function findSeedMatch(items, seed) {
    return items.findIndex((item) => {
      if (item.id === seed.id || seed.legacyIds.includes(item.id)) return true;
      const title = item.title.trim().toLowerCase();
      return seed.legacyTitles.includes(title);
    });
  }

  function upgradeStrategy(items) {
    const next = items.map((item) => normalizeItem(item));
    for (const seed of STRATEGY) {
      const index = findSeedMatch(next, seed);
      if (index >= 0) next[index] = enrich(next[index], seed);
      else if (!seed.legacyIds.length) next.push(projectSeed(seed, next.length));
    }
    return next;
  }

  function withReview(item) {
    const have = new Set(item.checklist.map((entry) => entry.text.trim().toLowerCase()));
    const missing = REVIEW.filter((text) => !have.has(text.toLowerCase())).map((text) => normalizeCheck(line(text, "research")));
    return { ...item, checklist: [...missing, ...item.checklist] };
  }

function missingSeed(items, seed) {
  return findSeedMatch(items, seed) < 0;
}

function migrate(saved, version) {
  let items = Array.isArray(saved) ? saved.map(normalizeItem).filter(Boolean) : [];
  if (version === STARTER_VERSION) return items;
  if ((version == null || version === "") && !items.length) return seedProjects();
  if (!items.length) return [];
  const reviewDone = version === "2" || version === "3" || version === "4" || version === "5" || version === "6";
  if (!reviewDone) items = items.map(withReview);
  const itSeed = STRATEGY.find((seed) => seed.id === "it-systems-financial-plan");
  const scaleSeed = STRATEGY.find((seed) => seed.id === "scale-analysis");
  if ((version == null || version === "" || version === "1" || version === "2") && missingSeed(items, itSeed)) {
    items.push(projectSeed(itSeed, items.length));
  }
  if (
    (version == null || version === "" || version === "1" || version === "2" || version === "3") &&
    missingSeed(items, scaleSeed)
  ) {
    items.push(projectSeed(scaleSeed, items.length));
  }
  return upgradeStrategy(items);
}

  function progressOf(item) {
    const steps = item.checklist.length;
    const done = item.checklist.filter((entry) => entry.done).length;
    if (steps === 0) return { percent: 0, fraction: "—", percentLabel: "0%", label: CHECKLIST_LABEL };
    const percent = Math.round((done / steps) * 100);
    return { percent, fraction: `${done}/${steps}`, percentLabel: `${percent}%`, label: CHECKLIST_LABEL };
  }

  function nextThree(items) {
    return items
      .filter((item) => !item.archived && item.stage !== "completed")
      .slice(0, 3)
      .map((item) => ({
        id: item.id,
        title: item.title || "New project",
        nextStep: item.nextStep || "",
        blocked: item.stage === "blocked",
        color: item.color,
      }));
  }

  function annualAmount(amount, cycle) {
    if (amount == null) return null;
    if (cycle === "monthly") return Math.round(amount * 12 * 100) / 100;
    if (cycle === "quarterly") return Math.round(amount * 4 * 100) / 100;
    if (cycle === "annual") return amount;
    return null;
  }

  function budgetSummary(rows) {
    let current = null;
    let proposed = null;
    let oneTimeCurrent = null;
    let oneTimeProposed = null;
    let unknownRows = 0;
    for (const row of rows || []) {
      if (row.frequency === "one-time") {
        if (row.currentCost == null) unknownRows += 1;
        else oneTimeCurrent = (oneTimeCurrent || 0) + row.currentCost;
        if (row.proposedCost != null) oneTimeProposed = (oneTimeProposed || 0) + row.proposedCost;
        continue;
      }
      const currentAnnual = annualAmount(row.currentCost, row.frequency);
      const proposedAnnual = annualAmount(row.proposedCost, row.frequency);
      if (currentAnnual == null) unknownRows += 1;
      else current = (current || 0) + currentAnnual;
      if (proposedAnnual != null) proposed = (proposed || 0) + proposedAnnual;
    }
    return {
      recurringCurrent: current,
      recurringProposed: proposed,
      difference: current == null || proposed == null ? null : Math.round((proposed - current) * 100) / 100,
      oneTimeCurrent,
      oneTimeProposed,
      unknownRows,
    };
  }

  function duplicateProject(item) {
    const copy = normalizeItem(JSON.parse(JSON.stringify(item)));
    copy.id = newId();
    copy.title = item.title ? `${item.title} copy` : "Project copy";
    copy.archived = false;
    copy.updatedAt = new Date().toISOString();
    copy.journal = [];
    copy.checklist = copy.checklist.map((entry) => ({ ...entry, id: newId(), done: false }));
    copy.materials = copy.materials.map((entry) => ({ ...entry, id: newId() }));
    copy.deliverables = copy.deliverables.map((entry) => ({
      ...entry,
      id: newId(),
      status: "not-started",
      commitment: "candidate",
      recommendationIds: [],
    }));
    if (copy.budget) copy.budget = copy.budget.map((entry) => ({ ...entry, id: newId() }));
    if (copy.schedule) copy.schedule.blocks = copy.schedule.blocks.map((entry) => ({ ...entry, id: newId() }));
    copy.tools = rekeyTools(copy.tools);
    return copy;
  }

  function rekeyTools(tools) {
    const next = normalizeTools(JSON.parse(JSON.stringify(tools || {})));
    const stamp = (rows) => (rows || []).map((row) => ({ ...row, id: newId() }));
    if (next.scorecard) next.scorecard = stamp(next.scorecard);
    if (next.operating) {
      next.operating.rows = stamp(next.operating.rows);
      next.operating.thresholds = stamp(next.operating.thresholds);
    }
    if (next.workflow) next.workflow = stamp(next.workflow);
    if (next.launches) {
      next.launches = next.launches.map((launch) => ({
        ...launch,
        id: newId(),
        items: launch.items.map((item) => ({ ...item, id: newId(), status: "not-assessed" })),
      }));
    }
    if (next.bridges) next.bridges = stamp(next.bridges);
    if (next.playbooks) next.playbooks = stamp(next.playbooks).map((row) => ({ ...row, exercised: "" }));
    if (next.commercial) {
      next.commercial.rules = stamp(next.commercial.rules);
      next.commercial.economics = stamp(next.commercial.economics);
      next.commercial.feedback = stamp(next.commercial.feedback);
    }
    if (next.decisions) next.decisions = stamp(next.decisions);
    if (next.capacity) {
      next.capacity.rows = stamp(next.capacity.rows);
      next.capacity.coverage = stamp(next.capacity.coverage);
    }
    return next;
  }

  function safeUrl(value) {
    try {
      const url = new URL(String(value || "").trim());
      if (url.protocol === "http:" || url.protocol === "https:") return url.href;
    } catch (error) {
      return "";
    }
    return "";
  }

  function quartersFor(items, year) {
    const found = new Set();
    for (let quarter = 1; quarter <= 4; quarter += 1) found.add(`${year}-Q${quarter}`);
    for (const item of items) {
      for (const deliverable of item.deliverables || []) {
      if (deliverable.quarter) found.add(deliverable.quarter);
    }
    }
    return [...found].sort();
  }

  function normalizeRecommendation(raw) {
    if (!raw || typeof raw !== "object") return null;
    const originalText = cleanText(raw.originalText || raw.text || "", 2000).trim();
    if (!originalText) return null;
    return {
      id: rowId(raw),
      originalText,
      sourceLabel: cleanLine(raw.sourceLabel, 160) || SOURCE_LABEL,
      sourceName: cleanLine(raw.sourceName, 200) || SOURCE_NAME,
      sourceCitation: cleanLine(raw.sourceCitation, 240),
      horizon: HORIZONS.some((entry) => entry.id === raw.horizon) ? raw.horizon : "later",
      projectId: cleanLine(raw.projectId, 80),
      deliverableId: cleanLine(raw.deliverableId, 80),
      response: cleanText(raw.response, 4000),
      actionPlan: cleanText(raw.actionPlan, 4000),
    };
  }

  function normalizeSettings(raw) {
    const settings = raw && typeof raw === "object" ? raw : {};
    return { baselineDate: cleanDate(typeof settings.baselineDate === "string" ? settings.baselineDate : "") };
  }

  const RECOMMENDATION_SEEDS = [
    ["now", "enterprise-priorities", "Confirm the next six-month enterprise priorities."],
    ["now", "enterprise-priorities", "Define “pause and harden” in measurable terms."],
    ["now", "enterprise-priorities", "Define and launch a minimum viable Epiq Plans program."],
    ["now", "enterprise-priorities", "Record an accountable program leader."],
    ["now", "enterprise-priorities", "Establish a weekly cross-functional portfolio review."],
    ["now", "daily-operating-control", "Create a daily operating-control view."],
    ["now", "daily-operating-control", "Make queue and aging data trustworthy enough for daily decisions."],
    ["now", "daily-operating-control", "Record due work, bottlenecks, staffing, and recovery thresholds."],
    ["now", "production-workflow", "Complete the current high-throughput workstation, point-of-use label, and scan workflow for a bounded client flow."],
    ["now", "production-workflow", "Define the bounded flow and acceptance criteria."],
    ["now", "production-workflow", "Measure actual productivity and defect performance."],
    ["now", "production-workflow", "Clarify the PV1/PV2 future-state design with pharmacy compliance."],
    ["now", "production-workflow", "Classify proposed controls as clinical, clerical, deterministic, or exception based."],
    ["next", "production-workflow", "Establish role-level productivity and proficiency measures only where the process is stable enough for a standard."],
    ["now", "client-launch-readiness", "Create one reusable launch-readiness checklist."],
    ["now", "client-launch-readiness", "Support separate launch records for different clients or offerings."],
    ["now", "client-launch-readiness", "Include commercial, technology, pharmacy, finance, inventory/packaging, customer support, and compliance."],
    ["now", "system-bridges", "Identify the top ten manual system bridges and recurring exceptions."],
    ["now", "system-bridges", "Choose whether to automate, eliminate, or explicitly own each."],
    ["next", "system-bridges", "Define Epiq Connect governance for release, testing, monitoring, reconciliation, recovery, auditability, security, and ownership."],
    ["now", "business-continuity", "Create playbooks for an Epiq Connect outage, a BestRx dependency failure, a pharmacist shortfall, key equipment failure, and a material service interruption."],
    ["next", "business-continuity", "Plan preventive maintenance, spare parts, equipment downtime tracking, and vendor escalation."],
    ["next", "commercial-model", "Define Standard / Configurable / Custom commercial rules."],
    ["next", "commercial-model", "Connect pricing and volume commitments to operating complexity."],
    ["next", "commercial-model", "Develop contribution economics by client/service configuration, including direct labor, packaging, support, engineering/implementation, inventory, and exception burden."],
    ["next", "commercial-model", "Conduct a Voice-of-Customer pulse with representative high-value clients."],
    ["next", "leadership-operating-model", "Define site-leader standard work."],
    ["next", "leadership-operating-model", "Establish daily and weekly performance cadence."],
    ["next", "leadership-operating-model", "Define shift handoffs, labor flex rules, and coaching expectations."],
    ["next", "leadership-operating-model", "Define executive decision-rights guardrails for pricing, hiring, operational priorities, technology, client commitments, and exceptions."],
    ["now", "labor-model-scheduling", "Review overtime."],
    ["now", "labor-model-scheduling", "Review management span and role overload."],
    ["now", "labor-model-scheduling", "Identify single points of knowledge."],
    ["now", "labor-model-scheduling", "Review recent turnover before adding another major wave of work."],
    ["next", "labor-model-scheduling", "Forecast demand by day, client, and work type."],
    ["next", "labor-model-scheduling", "Translate demand into staffing, shift, and flex-capacity needs."],
    ["next", "labor-model-scheduling", "Define primary and secondary coverage."],
    ["next", "labor-model-scheduling", "Establish cross-training for critical roles, clients, systems, and equipment."],
    ["later", "labor-model-scheduling", "Add second-shift or extended-hour capacity based on measured demand and economics, not as a reaction to chronic overtime."],
    ["later", "production-workflow", "Revisit future facility requirements only when modeled capacity, logistics, utilities, storage, compounding, or client demand create a clear trigger."],
    ["later", "production-workflow", "Expand automation after flow, standards, controls, and product families are stable enough to automate intelligently."],
    ["later", "independence-from-bestrx", "Extend Epiq Connect PMS responsibility only as compliance, resilience, and operating governance are proven for each scope expansion."],
    ["later", "leadership-operating-model", "Build succession depth around key leaders as the organization becomes less dependent on individual availability."],
    ["later", "leadership-operating-model", "Consider regional or multi-site architecture only after the single-site operating system can be replicated by leaders who did not invent it."],
    ["now", "enterprise-priorities", "The diagnostic proposes Epiq Plans as a lightweight planning layer. Its purpose, scope, minimum viable offering, and launch criteria are still open."],
    ["now", "daily-operating-control", "Design dashboards around decisions: what is happening, what will happen if nothing changes, and what action should be taken."],
    ["now", "system-bridges", "Create one explicit exception-management layer: every open exception should have a type, owner, age, next required action, and resolution status."],
    ["now", "client-launch-readiness", "Add an operating-readiness and economics gate to every material launch."],
    ["now", "labor-model-scheduling", "Preserve the ownership culture, but deliberately remove the need for heroics."],
  ];

  function resolveProjectId(items, seedId) {
    const seed = STRATEGY.find((entry) => entry.id === seedId);
    if (!seed) return "";
    const index = findSeedMatch(items, seed);
    return index >= 0 ? items[index].id : "";
  }

  function seedRecommendations(projects) {
    return RECOMMENDATION_SEEDS.map(([horizon, projectId, originalText]) => normalizeRecommendation({
      originalText,
      horizon,
      projectId: resolveProjectId(projects, projectId),
      sourceLabel: SOURCE_LABEL,
      sourceName: SOURCE_NAME,
      sourceCitation: SOURCE_CITATION,
      response: "",
      actionPlan: "",
      deliverableId: "",
    }));
  }

  function mergeRecommendations(projects, existing) {
    const have = new Set(existing.map((entry) => entry.originalText.trim().toLowerCase()));
    const next = existing.slice();
    for (const entry of seedRecommendations(projects)) {
      if (have.has(entry.originalText.trim().toLowerCase())) continue;
      next.push(entry);
    }
    return next;
  }

  function bindRelated(projects) {
    return projects.map((project) => {
      const seed = STRATEGY.find((entry) => entry.id === project.id || (entry.legacyIds || []).includes(project.id) || entry.legacyTitles.includes(project.title.trim().toLowerCase()));
      if (!seed || !seed.relatedIds) return project;
      const relatedIds = project.relatedIds.slice();
      for (const seedId of seed.relatedIds) {
        const resolved = resolveProjectId(projects, seedId);
        if (resolved && resolved !== project.id && !relatedIds.includes(resolved)) relatedIds.push(resolved);
      }
      return { ...project, relatedIds };
    });
  }

  function migratePlan(saved, version) {
    const wrapped = saved && !Array.isArray(saved) && typeof saved === "object";
    const projectInput = wrapped && Array.isArray(saved.projects) ? saved.projects : saved;
    const recommendationInput = wrapped && Array.isArray(saved.recommendations) ? saved.recommendations : [];
    const settings = normalizeSettings(wrapped ? saved.settings : {});
    const incomingProjects = Array.isArray(projectInput) ? projectInput : [];
    if ((version == null || version === "") && !incomingProjects.length) {
      const projects = seedProjects();
      return { projects, recommendations: seedRecommendations(projects), settings };
    }
    let projects = migrate(incomingProjects, version);
    let recommendations = recommendationInput.map(normalizeRecommendation).filter(Boolean);
    if (version !== STARTER_VERSION && projects.length) {
      recommendations = mergeRecommendations(projects, recommendations);
      projects = bindRelated(projects);
    }
    return { projects, recommendations, settings };
  }

  function addDays(isoDate, days) {
    const [year, month, day] = isoDate.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function addMonths(isoDate, months) {
    const [year, month, day] = isoDate.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1 + months, 1));
    const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(day, last));
    return date.toISOString().slice(0, 10);
  }

  function horizonWindows(baselineDate) {
    const baseline = cleanDate(typeof baselineDate === "string" ? baselineDate : "");
    if (!baseline) return null;
    return {
      baseline,
      now: { label: "NOW", described: "0–90 days", from: baseline, through: addDays(baseline, 90) },
      next: { label: "NEXT", described: "3–6 months", from: addMonths(baseline, 3), through: addMonths(baseline, 6) },
      later: { label: "Later / Unscheduled", described: "No supplied range" },
      note: "NOW and NEXT overlap around month three. These described windows are not deadlines.",
    };
  }

  function commitmentGaps(deliverable) {
    const fields = [
      ["outcome", "Outcome"],
      ["definitionOfDone", "Definition of done"],
      ["dependencies", "Dependencies"],
      ["requiredCapabilities", "Required capabilities and capacity"],
      ["stabilityConcerns", "Operating stability concerns"],
      ["coverageConcerns", "People or coverage concerns"],
      ["readinessEvidence", "Readiness evidence"],
      ["unresolvedConstraints", "Unresolved constraints"],
    ];
    return fields.filter(([key]) => !String(deliverable[key] || "").trim()).map(([, label]) => label);
  }

  function operatingBalance(row) {
    if (!row || row.startWip == null || row.incoming == null || row.capacity == null) {
      return { raw: null, projected: null, spare: null, unknown: true };
    }
    const raw = Math.round((row.startWip + row.incoming - row.capacity) * 100) / 100;
    if (raw < 0) return { raw, projected: 0, spare: Math.round(-raw * 100) / 100, unknown: false };
    return { raw, projected: raw, spare: 0, unknown: false };
  }

  function operatingTotal(rows) {
    const list = rows || [];
    if (!list.length) return { ok: false, reason: "No rows yet." };
    const units = new Set(list.map((row) => String(row.unit || "").trim()));
    if (units.size !== 1 || units.has("")) return { ok: false, reason: "Totals stay blank when units are missing or mixed." };
    if (list.some((row) => row.startWip == null || row.incoming == null || row.capacity == null)) {
      return { ok: false, reason: "Totals stay blank while any input is unknown.", unit: [...units][0] };
    }
    const startWip = Math.round(list.reduce((sum, row) => sum + row.startWip, 0) * 100) / 100;
    const incoming = Math.round(list.reduce((sum, row) => sum + row.incoming, 0) * 100) / 100;
    const capacity = Math.round(list.reduce((sum, row) => sum + row.capacity, 0) * 100) / 100;
    return { ok: true, unit: [...units][0], startWip, incoming, capacity, ...operatingBalance({ startWip, incoming, capacity }) };
  }

  function contributionOf(row) {
    const costs = ["labor", "packaging", "support", "engineering", "inventory", "exceptions"];
    const missing = [];
    if (!String(row.period || "").trim()) missing.push("period");
    if (!String(row.unit || "").trim()) missing.push("unit");
    if (row.revenue == null) missing.push("revenue");
    for (const key of costs) if (row[key] == null) missing.push(key);
    if (missing.length) return { amount: null, incomplete: true, missing };
    const total = costs.reduce((sum, key) => sum + row[key], 0);
    return { amount: Math.round((row.revenue - total) * 100) / 100, incomplete: false, missing: [] };
  }

  function exportDocument(items, recommendations, settings) {
    const projects = Array.isArray(items) ? items : items.projects || [];
    const recommendationList = Array.isArray(items) ? recommendations || [] : items.recommendations || [];
    const storedSettings = Array.isArray(items) ? settings || {} : items.settings || {};
    return {
      pocket: "work-tracker",
      version: 3,
      settings: normalizeSettings(storedSettings),
      recommendations: recommendationList.map(normalizeRecommendation).filter(Boolean),
      items: projects.map((item) => ({
        id: item.id,
        title: item.title,
        summary: item.summary,
        description: item.summary,
        color: item.color,
        stage: item.stage,
        status: item.stage,
        archived: item.archived,
        nextStep: item.nextStep,
        nextAction: item.nextStep,
        updatedAt: item.updatedAt,
        owner: item.owner,
        targetDate: item.targetDate,
        statusNote: item.statusNote,
        brief: item.brief,
        checklist: item.checklist,
        tasks: item.checklist.map((entry) => ({ text: entry.text, done: entry.done, answer: entry.answer })),
        journal: item.journal,
        materials: item.materials,
        relatedIds: item.relatedIds,
        deliverables: item.deliverables,
        budget: item.budget,
        schedule: item.schedule,
        workstreams: item.workstreams,
        category: item.category,
        reviewHost: item.reviewHost,
        tools: item.tools,
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
      if (data.pocket != null && data.pocket !== "work-tracker") return { ok: false, error: "That file is not a Pocket backup." };
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
      if (seen.has(item.id)) item.id = newId();
      seen.add(item.id);
      items.push(item);
    }
    const recommendations = !bare && Array.isArray(data.recommendations)
      ? data.recommendations.map(normalizeRecommendation).filter(Boolean)
      : [];
    const settings = normalizeSettings(!bare ? data.settings : {});
    return { ok: true, items, recommendations, settings };
  }

  return {
    STORAGE_KEY,
    STARTER_KEY,
    STARTER_VERSION,
    COLORS,
    PHASES,
    CHECK_TYPES,
    FREQUENCIES,
    DAYS,
    DAY_START,
    DAY_END,
    CHECKLIST_LABEL,
    CATEGORIES,
    HORIZONS,
    COMMITMENTS,
    DELIVERY_STATUSES,
    LAUNCH_STATUSES,
    LAUNCH_FUNCTIONS,
    SOURCE_LABEL,
    SOURCE_NAME,
    SOURCE_CITATION,
    normalizeDeliverable,
    PORTFOLIO_REVIEW_TEMPLATE,
    normalizeItem,
    migrate,
    migratePlan,
    reviewKind,
    seedProjects,
    progressOf,
    nextThree,
    exportDocument,
    parseImport,
    duplicateProject,
    budgetSummary,
    annualAmount,
    blockError,
    parseTime,
    formatTime,
    safeUrl,
    quartersFor,
    horizonWindows,
    commitmentGaps,
    operatingBalance,
    operatingTotal,
    contributionOf,
    starterItems: seedProjects,
  };
});
