const model = window.PocketModel;

const state = {
  items: [],
  recommendations: [],
  settings: { baselineDate: "" },
  openId: null,
  view: "projects",
  checkFilter: "open",
  expandedJournal: new Set(),
  editingJournalId: null,
  renamingId: null,
  renamePlace: "",
  renameOriginal: "",
  animateId: null,
  panelTab: "overview",
  editingFields: false,
  updateComposerOpen: false,
  menuOpen: false,
  effortMenuId: null,
  journalComposer: { when: "", title: "", body: "" },
  addingUpdate: false,
  updateDraft: "",
  updateDate: "",
  editingNext: false,
  draft: null,
  blockForm: null,
  blockError: "",
  storageMode: "ok",
  rawBackup: "",
  rankMode: false,
  categoryFilter: "",
  collapsedCategories: new Set(),
};

let saveToken = 0;
let drag = null;
let blockDrag = null;
let closing = false;
let undo = null;
let returnFocus = null;
let focusPanel = false;
let pendingConfirm = null;
let confirmReturn = null;

const app = document.querySelector("#app");
const sheetRoot = document.querySelector("#sheet-root");
const confirmRoot = document.querySelector("#confirm-root");
const statusEl = document.querySelector("#status");
const recoveryEl = document.querySelector("#recovery");
const desktopQuery = window.matchMedia("(min-width: 960px)");

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function itemById(id) {
  return state.items.find((item) => item.id === id);
}

function phaseOf(stage) {
  return model.PHASES.find((phase) => phase.id === stage) || model.PHASES[0];
}

function useSheet() {
  return !desktopQuery.matches;
}

function touch(item) {
  item.updatedAt = new Date().toISOString();
}

function activeItems() {
  return state.items.filter((item) => !item.archived);
}

function pad(number) {
  return String(number).padStart(2, "0");
}

function toLocalInput(iso) {
  const date = iso ? new Date(iso) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocalInput(value) {
  if (!value) return new Date().toISOString();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

function todayInput() {
  const date = new Date();
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatDateLabel(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
  if (!match) return "";
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function formatDay(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function formatStamp(iso) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function updatedLabel(item) {
  return item.updatedAt ? `Last updated ${formatDay(item.updatedAt)}` : "Last updated —";
}

function clockLabel(value) {
  const minutes = model.parseTime(value);
  if (minutes == null) return String(value || "");
  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour24 >= 12 ? "p.m." : "a.m.";
  const hour = hour24 % 12 || 12;
  return `${hour}:${pad(minute)} ${suffix}`;
}

function moneyLabel(value) {
  if (value == null) return "Unknown";
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function moneyField(value) {
  return value == null ? "" : Number(value).toFixed(2);
}

function parseMoney(value) {
  const trimmed = String(value).trim().replace(/[$,]/g, "");
  if (!trimmed) return { ok: true, value: null };
  if (!/^\d+(\.\d{0,2})?$/.test(trimmed)) return { ok: false };
  return { ok: true, value: Math.round(Number(trimmed) * 100) / 100 };
}

function currentQuarter() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "numeric",
  }).formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === "year").value);
  const month = Number(parts.find((part) => part.type === "month").value);
  return { year, quarter: `${year}-Q${Math.floor((month - 1) / 3) + 1}` };
}

function quarterLabel(quarter) {
  return quarter.replace("-Q", " Q");
}

function journalEdited(entry) {
  const created = new Date(entry.createdAt).getTime();
  const updated = new Date(entry.updatedAt).getTime();
  return Number.isFinite(created) && Number.isFinite(updated) && Math.abs(updated - created) > 1000;
}

function preview(entry) {
  const line = (entry.body || entry.title || "Empty entry").split("\n")[0];
  return line.length > 140 ? `${line.slice(0, 140)}…` : line;
}

function visibleChecks(item) {
  return item.checklist.filter((entry) => {
    if (state.checkFilter === "open") return !entry.done;
    if (state.checkFilter === "done") return entry.done;
    return true;
  });
}

function setStatus(message, options = {}) {
  statusEl.dataset.sticky = options.sticky ? "true" : "";
  statusEl.classList.toggle("is-error", Boolean(options.error));
  statusEl.replaceChildren();
  const text = document.createElement("span");
  text.textContent = message;
  statusEl.append(text);
  if (options.undo) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "undo";
    button.dataset.undo = "true";
    button.textContent = "Undo";
    statusEl.append(button);
  }
}

function showRecovery() {
  if (state.storageMode === "ok") {
    recoveryEl.hidden = true;
    recoveryEl.replaceChildren();
    return;
  }
  const text = document.createElement("p");
  const actions = document.createElement("div");
  actions.className = "recovery-actions";
  if (state.storageMode === "corrupt") {
    text.textContent = "The saved list could not be read. It is still in this browser and has not been replaced.";
    actions.append(actionButton("Download unreadable backup", "download-raw"));
    actions.append(actionButton("Start a fresh list", "start-fresh"));
  } else {
    text.textContent = "This browser can't store the list. You can keep working here until you leave this page.";
    actions.append(actionButton("Try saving again", "retry-save"));
  }
  recoveryEl.hidden = false;
  recoveryEl.replaceChildren(text, actions);
}

function actionButton(label, name) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset[name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = "true";
  button.textContent = label;
  return button;
}

function applyPlan(plan) {
  state.items = plan.projects;
  state.recommendations = plan.recommendations;
  state.settings = plan.settings || { baselineDate: "" };
}

function writeStored() {
  localStorage.setItem(model.STORAGE_KEY, JSON.stringify({
    projects: state.items,
    recommendations: state.recommendations,
    settings: state.settings,
  }));
  localStorage.setItem(model.STARTER_KEY, model.STARTER_VERSION);
}

function readStored() {
  try {
    const raw = localStorage.getItem(model.STORAGE_KEY);
    const version = localStorage.getItem(model.STARTER_KEY);
    if (raw == null) {
      applyPlan(model.migratePlan([], version));
      writeStored();
      return { mode: "ok", raw: "" };
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return { mode: "corrupt", raw };
    }
    const asPlan = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && (Array.isArray(parsed.projects) || Array.isArray(parsed.items))
        ? { projects: parsed.projects || parsed.items, recommendations: parsed.recommendations, settings: parsed.settings }
        : null;
    if (!asPlan) return { mode: "corrupt", raw };
    applyPlan(model.migratePlan(asPlan, version));
    if (version !== model.STARTER_VERSION || Array.isArray(parsed)) {
      try {
        writeStored();
      } catch (error) {
        return { mode: "unavailable", raw: "" };
      }
    }
    return { mode: "ok", raw: "" };
  } catch (error) {
    return { mode: "unavailable", raw: "" };
  }
}

function commit() {
  const token = ++saveToken;
  if (!undo) setStatus("Saving…");
  try {
    writeStored();
    state.storageMode = "ok";
    state.rawBackup = "";
    showRecovery();
  } catch (error) {
    state.storageMode = "unavailable";
    showRecovery();
    setStatus("Could not save on this browser.", { error: true, undo: Boolean(undo) });
    return;
  }
  window.setTimeout(() => {
    if (token !== saveToken || undo || statusEl.dataset.sticky) return;
    setStatus("Saved on this browser");
  }, 160);
}

function save() {
  undo = null;
  commit();
}

function load() {
  const stored = readStored();
  state.storageMode = stored.mode;
  state.rawBackup = stored.raw;
  showRecovery();
  if (stored.mode === "ok") setStatus("Saved on this browser");
  else if (stored.mode === "corrupt") setStatus("The saved list could not be read.", { error: true });
  else setStatus("This browser can't store the list.", { error: true });
}

function meterHtml(item) {
  const steps = item.checklist.length;
  const done = item.checklist.filter((entry) => entry.done).length;
  const percent = steps ? Math.round((done / steps) * 100) : 0;
  return `
    <span class="meter" aria-label="${done} of ${steps} tasks, ${percent}%">
      <span class="track" aria-hidden="true"><span class="fill" style="width:${percent}%"></span></span>
      <span class="frac">${done}/${steps}</span>
      <span class="pct">${percent}%</span>
    </span>
  `;
}

function renderNext() {
  const lines = model.nextThree(state.items);
  const body = lines.length
    ? lines
        .map((line, index) => {
          const tag = line.blocked ? `<span class="blocked-tag">Blocked</span>` : "";
          const detail = line.nextStep || "No next step";
          return `
            <button type="button" class="next-line" data-open="${escapeHtml(line.id)}" style="--accent:${escapeHtml(line.color)}">
              <span class="n">${index + 1}</span>
              <span>
                <strong>${escapeHtml(line.title)}</strong>
                <em>${tag}<span class="next-detail">${escapeHtml(detail)}</span></em>
              </span>
            </button>
          `;
        })
        .join("")
    : `<p class="next-empty">No open projects.</p>`;
  return `<section class="next" aria-label="Next 3"><h2>Next 3</h2>${body}</section>`;
}

function categoryOf(item) {
  return model.CATEGORIES.find((entry) => entry.id === item.category) || null;
}

function canReorder() {
  return state.view === "projects";
}

function sizeLabel(item) {
  return model.SIZES.find((entry) => entry.id === item.size)?.label || "";
}

function effortShort(item) {
  return model.SIZES.find((entry) => entry.id === item.size)?.short || "";
}

function stageBadge(item) {
  const phase = phaseOf(item.stage);
  return `<span class="stage-badge" data-stage="${escapeHtml(item.stage)}">${escapeHtml(phase.short || phase.label)}</span>`;
}

function progressHtml(item) {
  const steps = item.checklist.length;
  const done = item.checklist.filter((entry) => entry.done).length;
  const percent = steps ? model.progressOf(item).percent : 0;
  const letter = effortShort(item);
  const mark = letter ? `<span class="size-letter">${escapeHtml(letter)}</span>` : "";
  return `
    <span class="meter-line">
      ${mark}
      <span class="meter" aria-label="${done} of ${steps} work items, ${percent} percent">
        <span class="track" aria-hidden="true"><span class="fill" style="width:${percent}%"></span></span>
        <span class="frac">${done}/${steps}</span>
        <span class="pct">${percent}%</span>
      </span>
    </span>
  `;
}

function dueParts(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
  return match ? { year: match[1], month: match[2], day: match[3] } : { year: "", month: "", day: "" };
}

function realDate(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return "";
  const parsed = new Date(Date.UTC(y, m - 1, d));
  if (parsed.getUTCFullYear() !== y || parsed.getUTCMonth() !== m - 1 || parsed.getUTCDate() !== d) return "";
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function deliveryHtml(item) {
  const due = dueParts(item.targetDate);
  return `
    <div class="delivery${due.month ? "" : " is-empty"}">
      <input class="due-part" inputmode="numeric" maxlength="2" size="2" data-due-month="${escapeHtml(item.id)}" value="${escapeHtml(due.month)}" placeholder="MM" aria-label="Due month" />
      <span class="due-dash" aria-hidden="true">–</span>
      <input class="due-part" inputmode="numeric" maxlength="2" size="2" data-due-day="${escapeHtml(item.id)}" value="${escapeHtml(due.day)}" placeholder="DD" aria-label="Due day" />
    </div>
  `;
}

function commitDue(input) {
  const root = input.closest(".delivery");
  const id = input.dataset.dueMonth || input.dataset.dueDay;
  const item = itemById(id);
  if (!item || !root) return;
  const monthField = root.querySelector("[data-due-month]");
  const dayField = root.querySelector("[data-due-day]");
  const month = monthField.value.replace(/\D/g, "").slice(0, 2);
  const day = dayField.value.replace(/\D/g, "").slice(0, 2);
  if (monthField.value !== month) monthField.value = month;
  if (dayField.value !== day) dayField.value = day;
  root.classList.toggle("is-empty", !month && !day);
  if (!month && !day) {
    if (item.targetDate) {
      item.targetDate = "";
      touch(item);
      save();
    }
    return;
  }
  if (month.length < 2 || day.length < 2) return;
  const year = dueParts(item.targetDate).year || String(new Date().getFullYear());
  const iso = realDate(year, month, day);
  if (!iso || iso === item.targetDate) return;
  item.targetDate = iso;
  touch(item);
  save();
}

function effortControl(item) {
  const short = effortShort(item);
  const open = state.effortMenuId === item.id;
  const options = model.SIZES.map((entry) => {
    const selected = item.size === entry.id ? "true" : "false";
    return `<button type="button" role="option" data-effort-choice="${escapeHtml(entry.id)}" data-effort-for="${escapeHtml(item.id)}" aria-selected="${selected}">${escapeHtml(entry.label)}</button>`;
  }).join("");
  const face = short ? `Effort: ${short}` : "Set effort";
  return `
    <div class="effort">
      <button type="button" class="effort-btn" data-effort-toggle="${escapeHtml(item.id)}" aria-haspopup="listbox" aria-expanded="${open ? "true" : "false"}" aria-label="${escapeHtml(face)}">
        <span class="effort-label">${escapeHtml(face)}</span>
        <span class="caret" aria-hidden="true"></span>
      </button>
      ${open ? `<div class="effort-menu" role="listbox" aria-label="Effort">${options}</div>` : ""}
    </div>
  `;
}

function rowFace(item, index) {
  const title = item.title || "New project";
  const expanded = state.openId === item.id;
  return `
    <div class="row-face">
      <button type="button" class="handle" aria-label="Drag to reorder ${escapeHtml(title)}"><span class="grip" aria-hidden="true"></span></button>
      <span class="rank">${index + 1}</span>
      <div class="card-main">
        <button type="button" class="open" data-open="${escapeHtml(item.id)}" aria-expanded="${expanded ? "true" : "false"}">
          <span class="title-row">
            <span class="title${item.title ? "" : " is-placeholder"}">${escapeHtml(title)}</span>
          </span>
          <span class="progress-slot">${progressHtml(item)}</span>
        </button>
      </div>
      ${deliveryHtml(item)}
    </div>
  `;
}

function projectArticle(item, index) {
  const open = item.id === state.openId;
  const shown = open && state.animateId !== item.id;
  const classes = ["row", item.review ? "is-review" : "", item.stage === "completed" ? "is-completed" : "", item.stage === "blocked" ? "is-blocked" : "", shown ? "is-open" : ""]
    .filter(Boolean)
    .join(" ");
  return `
    <article class="${classes}" data-id="${escapeHtml(item.id)}" style="--accent:${escapeHtml(item.color)}">
      ${rowFace(item, index)}
      <div class="drawer">
        <div class="drawer-inner">${open ? insideHtml(item) : ""}</div>
      </div>
    </article>
  `;
}

function archivedArticle(item) {
  const title = item.title || "New project";
  const selected = item.id === state.openId ? " is-selected" : "";
  return `
    <article class="row is-archived${selected}" data-id="${escapeHtml(item.id)}">
      <div class="row-face archived-face">
        <button type="button" class="open" data-open="${escapeHtml(item.id)}" aria-expanded="${selected ? "true" : "false"}">
          <span class="title${item.title ? "" : " is-placeholder"}">${escapeHtml(title)}</span>
          ${stageBadge(item)}
          <span class="progress-slot">${progressHtml(item)}</span>
        </button>
        <button type="button" class="btn secondary restore" data-restore="${escapeHtml(item.id)}">Restore</button>
      </div>
    </article>
  `;
}

function renderList() {
  const active = activeItems();
  const archived = state.items.filter((item) => item.archived);
  const list = active.map((item, index) => projectArticle(item, index)).join("");
  const archivedHtml = archived.length
    ? `<section class="archived-list" aria-label="Archived projects"><h2>Archived</h2>${archived.map(archivedArticle).join("")}</section>`
    : "";
  return `
    <div class="layout">
      <header class="page-head">
        <div>
          <h2>Project roadmap</h2>
          <p class="intro">Drag a card to change the order. This order is the priority.</p>
        </div>
        <button type="button" class="btn primary" data-add-project>+ New project</button>
      </header>
      <div id="list">${list}</div>
      ${archivedHtml}
    </div>
  `;
}

function optionsHtml(pairs, selected) {
  return pairs
    .map(([value, label]) => `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(label)}</option>`)
    .join("");
}

function annualCell(row, key) {
  if (row.frequency === "one-time") return "Not annualized";
  if (row.frequency === "unknown") return "Unknown";
  const amount = model.annualAmount(row[key], row.frequency);
  return amount == null ? "Unknown" : moneyLabel(amount);
}

function rowDifference(row) {
  if (row.frequency === "one-time" || row.frequency === "unknown") return "—";
  const current = model.annualAmount(row.currentCost, row.frequency);
  const proposed = model.annualAmount(row.proposedCost, row.frequency);
  if (current == null || proposed == null) return "—";
  return moneyLabel(Math.round((proposed - current) * 100) / 100);
}

function budgetSummaryHtml(rows) {
  const summary = model.budgetSummary(rows);
  const difference = summary.difference == null ? "—" : moneyLabel(summary.difference);
  return `
    <div class="budget-summary" data-budget-summary>
      <span>Recurring annual current (calculated): ${escapeHtml(moneyLabel(summary.recurringCurrent))}</span>
      <span>Recurring annual proposed (calculated): ${escapeHtml(moneyLabel(summary.recurringProposed))}</span>
      <span>Difference, proposed minus current (calculated): ${escapeHtml(difference)}</span>
      <span>One-time current, not annualized: ${escapeHtml(moneyLabel(summary.oneTimeCurrent))}</span>
      <span>One-time proposed, not annualized: ${escapeHtml(moneyLabel(summary.oneTimeProposed))}</span>
      <span>Rows with an unknown current cost: ${summary.unknownRows}</span>
    </div>
  `;
}

function budgetHtml(item) {
  if (!Array.isArray(item.budget)) return "";
  const frequencies = model.FREQUENCIES.map((entry) => [entry.id, entry.label]);
  const rows = item.budget
    .map((row) => `
      <tr>
        <td><input class="field" data-budget-id="${escapeHtml(row.id)}" data-budget-field="vendor" value="${escapeHtml(row.vendor)}" aria-label="Expense or vendor" /></td>
        <td><input class="field" data-budget-id="${escapeHtml(row.id)}" data-budget-field="category" value="${escapeHtml(row.category)}" aria-label="Category" /></td>
        <td><select class="field" data-budget-id="${escapeHtml(row.id)}" data-budget-field="frequency" aria-label="Billing frequency">${optionsHtml(frequencies, row.frequency)}</select></td>
        <td><input class="field" inputmode="decimal" placeholder="Unknown" data-budget-id="${escapeHtml(row.id)}" data-budget-field="currentCost" value="${moneyField(row.currentCost)}" aria-label="Current cost in dollars" /></td>
        <td><input class="field" inputmode="decimal" placeholder="Unknown" data-budget-id="${escapeHtml(row.id)}" data-budget-field="proposedCost" value="${moneyField(row.proposedCost)}" aria-label="Proposed cost in dollars" /></td>
        <td><input class="field" type="date" data-budget-id="${escapeHtml(row.id)}" data-budget-field="renewal" value="${escapeHtml(row.renewal)}" aria-label="Contract or renewal date" /></td>
        <td><input class="field" data-budget-id="${escapeHtml(row.id)}" data-budget-field="notes" value="${escapeHtml(row.notes)}" aria-label="Notes" /></td>
        <td class="calc">${escapeHtml(annualCell(row, "currentCost"))}</td>
        <td class="calc">${escapeHtml(annualCell(row, "proposedCost"))}</td>
        <td class="calc">${escapeHtml(rowDifference(row))}</td>
        <td><button type="button" class="remove" data-remove-budget="${escapeHtml(row.id)}">Remove</button></td>
      </tr>
    `)
    .join("");
  return `
    <section>
      <h3>Budget</h3>
      <p class="hint">Enter each expense once. Leave a cost blank when it is unknown. Blank is not zero. Annual columns are calculated. One-time costs stay out of those annual totals.</p>
      <div class="budget-scroll">
        <table class="budget">
          <caption>Amounts are dollars. Calculated figures are labeled. Do not add a row that totals the other rows.</caption>
          <thead>
            <tr>
              <th>Expense or vendor</th>
              <th>Category</th>
              <th>Billing frequency</th>
              <th>Current cost</th>
              <th>Proposed cost</th>
              <th>Contract or renewal</th>
              <th>Notes</th>
              <th>Annual current (calculated)</th>
              <th>Annual proposed (calculated)</th>
              <th>Difference (calculated)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${budgetSummaryHtml(item.budget)}
      <button type="button" class="add-line" data-add-budget>Add a cost row</button>
    </section>
  `;
}

function laneMap(blocks) {
  const sorted = blocks.slice().sort((left, right) => {
    const delta = model.parseTime(left.start) - model.parseTime(right.start);
    return delta || left.id.localeCompare(right.id);
  });
  const laneEnds = [];
  const placement = new Map();
  for (const block of sorted) {
    const start = model.parseTime(block.start);
    const end = model.parseTime(block.end);
    let lane = laneEnds.findIndex((until) => until <= start);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else laneEnds[lane] = end;
    placement.set(block.id, lane);
  }
  return { count: Math.max(laneEnds.length, 1), placement };
}

function blockFormHtml(item) {
  const editing = state.blockForm && state.blockForm.projectId === item.id ? state.blockForm : null;
  const block = editing || { id: "", activity: "", day: "Monday", start: "08:00", end: "09:00", staffCount: "", names: "", notes: "" };
  const times = [];
  for (let minute = model.DAY_START; minute <= model.DAY_END; minute += 30) times.push(model.formatTime(minute));
  const timePairs = times.map((time) => [time, clockLabel(time)]);
  const dayPairs = model.DAYS.map((day) => [day, day]);
  const error = state.blockError && editing ? `<p class="hint">${escapeHtml(state.blockError)}</p>` : "";
  return `
    <form class="block-form" data-editing="${escapeHtml(block.id)}">
      <h4>${block.id ? "Edit activity" : "Add activity"}</h4>
      <p class="hint">Use this form if you are not dragging. End time has to be after the start, inside 8:00 a.m. to 6:00 p.m.</p>
      ${error}
      <label class="stack-field">Activity
        <input class="field" data-block-field="activity" value="${escapeHtml(block.activity)}" />
      </label>
      <label class="stack-field">Day
        <select class="field" data-block-field="day">${optionsHtml(dayPairs, block.day)}</select>
      </label>
      <label class="stack-field">Start
        <select class="field" data-block-field="start">${optionsHtml(timePairs, block.start)}</select>
      </label>
      <label class="stack-field">End
        <select class="field" data-block-field="end">${optionsHtml(timePairs, block.end)}</select>
      </label>
      <label class="stack-field">Staffing count, optional
        <input class="field" inputmode="numeric" data-block-field="staff" value="${escapeHtml(block.staffCount)}" />
      </label>
      <label class="stack-field">Names, optional notes
        <input class="field" data-block-field="names" value="${escapeHtml(block.names)}" />
      </label>
      <label class="stack-field">Notes
        <textarea class="field" data-block-field="notes">${escapeHtml(block.notes)}</textarea>
      </label>
      <div class="inline-actions">
        <button type="submit">${block.id ? "Save activity" : "Add activity"}</button>
        ${block.id ? `<button type="button" data-cancel-block>Cancel</button><button type="button" class="remove" data-delete-block="${escapeHtml(block.id)}">Delete activity</button>` : ""}
      </div>
    </form>
  `;
}

function scheduleHtml(item) {
  if (!item.schedule) return "";
  const rows = (model.DAY_END - model.DAY_START) / 30;
  const labels = [];
  for (let minute = model.DAY_START; minute < model.DAY_END; minute += 30) {
    labels.push(`<div class="slot-label">${minute % 60 === 0 ? escapeHtml(clockLabel(model.formatTime(minute))) : ""}</div>`);
  }
  const headers = model.DAYS.map((day) => `<div class="day-head">${escapeHtml(day.slice(0, 3))}</div>`).join("");
  const columns = model.DAYS.map((day) => {
    const blocks = item.schedule.blocks.filter((block) => block.day === day);
    const lanes = laneMap(blocks);
    const blocksHtml = blocks
      .map((block) => {
        const start = model.parseTime(block.start);
        const end = model.parseTime(block.end);
        const top = ((start - model.DAY_START) / 30) * 28;
        const height = Math.max(28, ((end - start) / 30) * 28);
        const lane = lanes.placement.get(block.id) || 0;
        const width = 100 / lanes.count;
        const extra = [block.staffCount ? `${block.staffCount} staff` : "", block.names].filter(Boolean).join(" · ");
        return `
          <div class="block" data-block-id="${escapeHtml(block.id)}" style="top:${top}px;height:${height}px;left:${lane * width}%;width:${width}%">
            <div class="block-move" data-block-drag="move">
              <strong>${escapeHtml(block.activity || "Untitled")}</strong>
              <span>${escapeHtml(clockLabel(block.start))}–${escapeHtml(clockLabel(block.end))}</span>
              ${extra ? `<span>${escapeHtml(extra)}</span>` : ""}
            </div>
            <button type="button" class="block-edit" data-edit-block="${escapeHtml(block.id)}" aria-label="Edit ${escapeHtml(block.activity || "activity")} on ${escapeHtml(day)}">Edit</button>
            <div class="block-resize" data-block-drag="resize" aria-hidden="true"></div>
          </div>
        `;
      })
      .join("");
    const slots = Array.from({ length: rows }, () => `<div class="slot"></div>`).join("");
    return `<div class="day-col" data-day="${escapeHtml(day)}">${slots}${blocksHtml}</div>`;
  }).join("");
  return `
    <section class="schedule-section">
      <h3>Weekly template</h3>
      <p class="hint">Monday through Saturday, 8:00 a.m. to 6:00 p.m., in 30-minute steps. This is a weekly template, not a dated employee calendar. Names are notes on the template, not assignments.</p>
      <div class="board-scroll">
        <div class="board" role="group" aria-label="Weekly template">
          <div></div>
          ${headers}
          <div class="time-gutter">${labels.join("")}</div>
          ${columns}
        </div>
      </div>
      ${blockFormHtml(item)}
    </section>
  `;
}

function journalLinkHtml(item, entry) {
  if (!entry.journalId) return "";
  const source = item.journal.find((journal) => journal.id === entry.journalId);
  if (!source) return `<p class="link-note">The linked journal entry is no longer in this project.</p>`;
  return `<button type="button" class="text-btn" data-show-journal="${escapeHtml(entry.journalId)}">From journal: ${escapeHtml(source.title || "Untitled entry")}</button>`;
}

function checkHtml(item, entry, visible) {
  const index = visible.findIndex((line) => line.id === entry.id);
  const types = model.CHECK_TYPES.map((type) => [type.id, type.label]);
  const horizons = [["", "No horizon"], ...model.HORIZONS.map((entry) => [entry.id, entry.label])];
  const streams = item.workstreams.length
    ? `<select class="field" data-check-stream="${escapeHtml(entry.id)}" aria-label="Workstream">
        ${optionsHtml([["", "Unassigned"], ...item.workstreams.map((name) => [name, name])], entry.workstream)}
      </select>`
    : "";
  const kind = model.reviewKind(entry.text);
  const answer = kind === "date"
    ? `<input class="field" type="date" value="${escapeHtml(entry.answer)}" data-check-answer="${escapeHtml(entry.id)}" aria-label="Answer for ${escapeHtml(entry.text)}" />`
    : kind === "text" || entry.answer
      ? `<input class="field" type="text" maxlength="500" value="${escapeHtml(entry.answer)}" data-check-answer="${escapeHtml(entry.id)}" aria-label="Answer for ${escapeHtml(entry.text || "checklist item")}" placeholder="Short answer" />`
      : "";
  return `
    <div class="check-row${entry.done ? " is-done" : ""}">
      <input type="checkbox" data-check-id="${escapeHtml(entry.id)}" ${entry.done ? "checked" : ""} aria-label="Done: ${escapeHtml(entry.text || "Checklist item")}" />
      <select class="field" data-check-type="${escapeHtml(entry.id)}" aria-label="Item type">${optionsHtml(types, entry.type)}</select>
      <select class="field" data-check-horizon="${escapeHtml(entry.id)}" aria-label="Planning horizon">${optionsHtml(horizons, entry.horizon || "")}</select>
      ${streams}
      <input class="field check-text" type="text" value="${escapeHtml(entry.text)}" data-check-text="${escapeHtml(entry.id)}" aria-label="Checklist item" />
      <input class="field" type="date" value="${escapeHtml(entry.due)}" data-check-due="${escapeHtml(entry.id)}" aria-label="Due date, optional" />
      <span class="check-moves">
        <button type="button" data-check-move="up" data-check-target="${escapeHtml(entry.id)}" ${index === 0 ? "disabled" : ""} aria-label="Move checklist item up">Up</button>
        <button type="button" data-check-move="down" data-check-target="${escapeHtml(entry.id)}" ${index === visible.length - 1 ? "disabled" : ""} aria-label="Move checklist item down">Down</button>
      </span>
      <button type="button" class="remove" data-remove-check="${escapeHtml(entry.id)}">Remove</button>
      ${journalLinkHtml(item, entry)}
      ${answer}
    </div>
  `;
}

function checklistHtml(item) {
  const visible = visibleChecks(item);
  const progress = model.progressOf(item);
  const counts = {
    open: item.checklist.filter((entry) => !entry.done).length,
    done: item.checklist.filter((entry) => entry.done).length,
    all: item.checklist.length,
  };
  const filters = ["open", "done", "all"]
    .map((filter) => {
      const label = filter === "open" ? "Open" : filter === "done" ? "Completed" : "All";
      return `<button type="button" data-filter="${filter}" aria-pressed="${state.checkFilter === filter ? "true" : "false"}">${label} (${counts[filter]})</button>`;
    })
    .join("");
  const groups = item.workstreams.length
    ? [
        ...item.workstreams.map((name) => ({ name, entries: visible.filter((entry) => entry.workstream === name) })),
        { name: "Other", entries: visible.filter((entry) => !item.workstreams.includes(entry.workstream)) },
      ]
    : [{ name: "", entries: visible }];
  const body = groups
    .map((group) => {
      if (group.name === "Other" && !group.entries.length) return "";
      const lines = group.entries.length
        ? group.entries.map((entry) => checkHtml(item, entry, visible)).join("")
        : `<p class="hint">No checklist items in this filter.</p>`;
      return group.name ? `<section class="workstream"><h4>${escapeHtml(group.name)}</h4>${lines}</section>` : lines;
    })
    .join("");
  const draft = draftHtml(item);
  return `
    <section>
      <div class="key-head"><h3>To complete</h3></div>
      <p class="check-line">${escapeHtml(progress.label)} · ${escapeHtml(progress.fraction)} · ${escapeHtml(progress.percentLabel)}</p>
      <p class="hint">Checking an item does not complete the project. Change the stage when the project itself is done.</p>
      <div class="filters" role="group" aria-label="Checklist filter">${filters}</div>
      ${draft}
      ${body || `<p class="hint">No checklist items yet.</p>`}
      <button type="button" class="add-line" data-add-check>Add checklist item</button>
    </section>
  `;
}

function draftHtml(item) {
  if (!state.draft || state.draft.projectId !== item.id) return "";
  const types = model.CHECK_TYPES.map((type) => [type.id, type.label]);
  const streams = item.workstreams.length
    ? `<label class="stack-field">Workstream
        <select class="field" data-draft-stream>${optionsHtml([["", "Unassigned"], ...item.workstreams.map((name) => [name, name])], state.draft.workstream || "")}</select>
      </label>`
    : "";
  return `
    <div class="draft">
      <h4>Checklist draft</h4>
      <p class="hint">Linked to the journal entry. Nothing is added until you keep this draft.</p>
      <label class="stack-field">Item
        <input class="field" data-draft-text value="${escapeHtml(state.draft.text)}" />
      </label>
      <label class="stack-field">Type
        <select class="field" data-draft-type>${optionsHtml(types, state.draft.type || "action")}</select>
      </label>
      ${streams}
      <label class="stack-field">Due date, optional
        <input class="field" type="date" data-draft-due value="${escapeHtml(state.draft.due || "")}" />
      </label>
      <div class="inline-actions">
        <button type="button" data-save-draft>Add to checklist</button>
        <button type="button" data-cancel-draft>Discard draft</button>
      </div>
    </div>
  `;
}

function journalHtml(item) {
  const entries = item.journal.slice().sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const list = entries
    .map((entry) => {
      const text = [entry.title, entry.body].map((part) => String(part || "").trim()).filter(Boolean).join("\n");
      return `
        <article class="entry" data-journal-id="${escapeHtml(entry.id)}">
          <div class="entry-meta">
            <time datetime="${escapeHtml(entry.createdAt)}">${escapeHtml(formatStamp(entry.createdAt))}</time>
            <button type="button" class="remove" data-delete-journal="${escapeHtml(entry.id)}">Delete</button>
          </div>
          <p class="entry-body">${escapeHtml(text || "Update")}</p>
        </article>
      `;
    })
    .join("");
  return `
    <section class="updates">
      <h3>Updates</h3>
      <div class="draft">
        <label class="stack-field">Update
          <textarea class="field" maxlength="8000" data-journal-body>${escapeHtml(state.journalComposer.body)}</textarea>
        </label>
        <button type="button" class="add-line" data-add-journal>Add update</button>
      </div>
      ${list || `<p class="hint">No updates yet.</p>`}
    </section>
  `;
}

function materialsHtml(item) {
  const rows = item.materials
    .map((material) => {
      const href = model.safeUrl(material.url);
      const link = href
        ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">Open link</a>`
        : material.url
          ? `<span class="link-note">This address is not shown as a link.</span>`
          : "";
      return `
        <div class="material">
          <label class="stack-field">Reference title
            <input class="field" data-material-id="${escapeHtml(material.id)}" data-material-field="title" value="${escapeHtml(material.title)}" />
          </label>
          <label class="stack-field">URL
            <input class="field" data-material-id="${escapeHtml(material.id)}" data-material-field="url" value="${escapeHtml(material.url)}" placeholder="https://" />
          </label>
          ${link}
          <label class="stack-field">Notes
            <textarea class="field" data-material-id="${escapeHtml(material.id)}" data-material-field="notes">${escapeHtml(material.notes)}</textarea>
          </label>
          <button type="button" class="remove" data-remove-material="${escapeHtml(material.id)}">Remove reference</button>
        </div>
      `;
    })
    .join("");
  return `
    <section>
      <h3>Supporting material</h3>
      <p class="hint">Add a reference title, a URL, and notes. Files are not uploaded.</p>
      ${rows || `<p class="hint">No references yet.</p>`}
      <button type="button" class="add-line" data-add-material>Add a reference</button>
    </section>
  `;
}

function relatedHtml(item) {
  const rows = item.relatedIds
    .map((id) => {
      const related = itemById(id);
      if (!related) {
        return `<div class="related"><span>A linked project is no longer in this list.</span><button type="button" class="remove" data-unlink="${escapeHtml(id)}">Remove link</button></div>`;
      }
      const archived = related.archived ? " (archived)" : "";
      return `
        <div class="related">
          <button type="button" class="open-related" data-open="${escapeHtml(related.id)}">${escapeHtml(related.title || "New project")}${archived}</button>
          <button type="button" class="remove" data-unlink="${escapeHtml(id)}">Remove link</button>
        </div>
      `;
    })
    .join("");
  const choices = state.items
    .filter((other) => other.id !== item.id && !item.relatedIds.includes(other.id))
    .map((other) => [other.id, other.title || "New project"]);
  const picker = choices.length
    ? `<label class="stack-field">Link a project
        <select class="field" data-related-pick>${optionsHtml(choices, choices[0][0])}</select>
      </label>
      <button type="button" class="add-line" data-link-related>Link project</button>`
    : `<p class="hint">No other projects left to link.</p>`;
  return `
    <section>
      <h3>Related projects</h3>
      <p class="hint">A link points at the other project. It does not copy that project's notes.</p>
      ${rows || `<p class="hint">No related projects yet.</p>`}
      ${picker}
    </section>
  `;
}

function labelOf(list, id) {
  return list.find((entry) => entry.id === id)?.label || "";
}

function deliverableAttrs(deliverable, project, key) {
  return `data-deliverable-id="${escapeHtml(deliverable.id)}" data-deliverable-field="${key}" data-project="${escapeHtml(project.id)}"`;
}

function deliverableCard(project, deliverable) {
  const horizons = [["", "No horizon"], ...model.HORIZONS.map((entry) => [entry.id, `${entry.label} — ${entry.described}`])];
  const quarters = [["", "No quarter"], ...model.quartersFor(state.items, currentQuarter().year).map((quarter) => [quarter, quarterLabel(quarter)])];
  const gaps = model.commitmentGaps(deliverable);
  const line = (key, label) => `<label class="stack-field">${label}<input class="field" ${deliverableAttrs(deliverable, project, key)} value="${escapeHtml(deliverable[key] || "")}" /></label>`;
  const area = (key, label) => `<label class="stack-field">${label}<textarea class="field" ${deliverableAttrs(deliverable, project, key)}>${escapeHtml(deliverable[key] || "")}</textarea></label>`;
  const linked = state.recommendations.filter((entry) => !entry.projectId || entry.projectId === project.id);
  const boxes = linked.length
    ? linked.map((entry) => `
        <label class="check-inline">
          <input type="checkbox" data-link-rec="${escapeHtml(entry.id)}" data-deliverable="${escapeHtml(deliverable.id)}" data-project="${escapeHtml(project.id)}" ${deliverable.recommendationIds.includes(entry.id) ? "checked" : ""} />
          <span>${escapeHtml(entry.originalText)}</span>
        </label>
      `).join("")
    : `<p class="hint">No recommendations are available to link yet.</p>`;
  return `
    <article class="deliverable-card">
      <p class="chips">
        <span class="chip">${escapeHtml(labelOf(model.COMMITMENTS, deliverable.commitment) || "Candidate")}</span>
        <span class="chip">${escapeHtml(labelOf(model.HORIZONS, deliverable.horizon) || "No horizon")}</span>
        <span class="chip">${escapeHtml(labelOf(model.DELIVERY_STATUSES, deliverable.status) || "Not started")}</span>
        ${deliverable.quarter ? `<span class="chip">${escapeHtml(quarterLabel(deliverable.quarter))}</span>` : ""}
      </p>
      ${line("outcome", "Outcome")}
      ${area("definitionOfDone", "Definition of done")}
      <div class="field-row cols-3">
        ${line("baseline", "Baseline")}
        ${line("targetResult", "Target result")}
        ${line("actualResult", "Actual result")}
      </div>
      <div class="field-row cols-2">
        <label class="stack-field">Target date<input class="field" type="date" ${deliverableAttrs(deliverable, project, "targetDate")} value="${escapeHtml(deliverable.targetDate || "")}" /></label>
        ${line("lead", "Accountable lead, optional")}
      </div>
      <label class="stack-field">Planning horizon
        <select class="field" ${deliverableAttrs(deliverable, project, "horizon")}>${optionsHtml(horizons, deliverable.horizon || "")}</select>
      </label>
      <p class="hint">A planning horizon is not a commitment. NOW and NEXT overlap around month three, and neither date is calculated until a baseline is set.</p>
      <label class="stack-field">Calendar quarter, separate from the horizon
        <select class="field" ${deliverableAttrs(deliverable, project, "quarter")}>${optionsHtml(quarters, deliverable.quarter || "")}</select>
      </label>
      <label class="stack-field">Candidate, Committed, or Deferred
        <select class="field" ${deliverableAttrs(deliverable, project, "commitment")}>${optionsHtml(model.COMMITMENTS.map((entry) => [entry.id, entry.label]), deliverable.commitment)}</select>
      </label>
      <label class="stack-field">Delivery status
        <select class="field" ${deliverableAttrs(deliverable, project, "status")}>${optionsHtml(model.DELIVERY_STATUSES.map((entry) => [entry.id, entry.label]), deliverable.status)}</select>
      </label>
      ${area("dependencies", "Dependencies")}
      ${area("evidence", "Evidence or source links")}
      <h4>Capacity and readiness review</h4>
      <p class="hint">${gaps.length ? `Still missing: ${escapeHtml(gaps.join(", "))}.` : "The definition, dependencies, and readiness fields are filled in."} Marking Committed does not approve the work.</p>
      ${area("requiredCapabilities", "Required capabilities and capacity")}
      ${area("stabilityConcerns", "Operating stability concerns")}
      ${area("coverageConcerns", "People or coverage concerns")}
      ${area("readinessEvidence", "Readiness evidence")}
      ${area("unresolvedConstraints", "Unresolved constraints")}
      <h4>Linked recommendations</h4>
      ${boxes}
      <button type="button" class="remove" data-remove-deliverable="${escapeHtml(deliverable.id)}" data-project="${escapeHtml(project.id)}">Remove deliverable</button>
    </article>
  `;
}

function deliverablesHtml(item) {
  const horizons = model.HORIZONS.map((entry) => [entry.id, `${entry.label} — ${entry.described}`]);
  const quarters = [["", "No quarter"], ...model.quartersFor(state.items, currentQuarter().year).map((quarter) => [quarter, quarterLabel(quarter)])];
  const cards = item.deliverables.map((deliverable) => deliverableCard(item, deliverable)).join("");
  return `
    <section>
      <h3>Deliverables</h3>
      <p class="hint">A deliverable is a measurable outcome. Candidate means it is still an idea. Committed means it is scoped enough to pursue. Deferred means it waits. None of those is a calendar quarter.</p>
      ${cards || `<p class="hint">No deliverables yet.</p>`}
      <div class="draft">
        <label class="stack-field">Outcome
          <input class="field" data-new-outcome maxlength="500" />
        </label>
        <label class="stack-field">Planning horizon
          <select class="field" data-new-horizon>${optionsHtml(horizons, "now")}</select>
        </label>
        <label class="stack-field">Calendar quarter, optional
          <select class="field" data-new-quarter>${optionsHtml(quarters, "")}</select>
        </label>
        <button type="button" class="add-line" data-add-deliverable>Add deliverable</button>
      </div>
    </section>
  `;
}

function toolAttrs(collection, id, field, parent) {
  const parentAttr = parent ? ` data-parent="${escapeHtml(parent)}"` : "";
  return `data-collection="${collection}" data-tool-id="${escapeHtml(id)}" data-tool-field="${field}"${parentAttr}`;
}

function toolControl(row, column, collection, parent) {
  const attrs = toolAttrs(collection, row.id, column.key, parent);
  const value = row[column.key];
  if (column.kind === "number") {
    return `<input class="field" inputmode="decimal" placeholder="Unknown" ${attrs} value="${value == null ? "" : escapeHtml(value)}" aria-label="${escapeHtml(column.label)}" />`;
  }
  if (column.kind === "date") return `<input class="field" type="date" ${attrs} value="${escapeHtml(value || "")}" aria-label="${escapeHtml(column.label)}" />`;
  if (column.kind === "area") return `<textarea class="field" ${attrs} aria-label="${escapeHtml(column.label)}">${escapeHtml(value || "")}</textarea>`;
  if (column.kind === "select") return `<select class="field" ${attrs} aria-label="${escapeHtml(column.label)}">${optionsHtml(column.options, value || "")}</select>`;
  return `<input class="field" ${attrs} value="${escapeHtml(value || "")}" aria-label="${escapeHtml(column.label)}" />`;
}

function toolTable(title, hint, rows, columns, collection) {
  const head = columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("");
  const body = (rows || []).map((row) => `
    <tr>
      ${columns.map((column) => `<td>${toolControl(row, column, collection)}</td>`).join("")}
      <td><button type="button" class="remove" data-remove-tool="${collection}" data-tool-id="${escapeHtml(row.id)}">Remove</button></td>
    </tr>
  `).join("");
  return `
    <h4>${escapeHtml(title)}</h4>
    <p class="hint">${hint}</p>
    <div class="budget-scroll">
      <table class="budget"><thead><tr>${head}<th></th></tr></thead><tbody>${body}</tbody></table>
    </div>
    <button type="button" class="add-line" data-add-tool="${collection}">Add a row</button>
  `;
}

function wipText(row) {
  const balance = model.operatingBalance(row);
  if (balance.unknown) return "Projected end WIP: unknown. Missing inputs stay unknown.";
  if (balance.spare > 0) return `Raw balance ${balance.raw} (${row.unit || "no unit"}) is spare capacity. Projected remaining queue: 0.`;
  return `Projected end WIP: ${balance.projected} ${row.unit || ""}. Spare capacity: 0.`;
}

function thresholdReading(row, threshold) {
  if (!threshold.field || threshold.value == null) return "Not assessed.";
  const numeric = ["startWip", "incoming", "capacity", "actualEnd", "projected"];
  if (!numeric.includes(threshold.field)) return "Not assessed. Aging and staffing are not scored against a number here.";
  if (!threshold.unit || !row.unit || threshold.unit !== row.unit) return "Not assessed. The unit is missing or does not match this row.";
  const balance = model.operatingBalance(row);
  const value = threshold.field === "projected" ? balance.projected : row[threshold.field];
  if (value == null || (threshold.field === "projected" && balance.unknown)) return "Not assessed.";
  const outside = threshold.direction === "below" ? value < threshold.value : value > threshold.value;
  return outside ? "Outside the threshold you set." : "Inside the threshold you set.";
}

function operatingHtml(operating) {
  const columns = [
    { key: "date", label: "Date", kind: "date" },
    { key: "queue", label: "Queue or workflow" },
    { key: "client", label: "Client, optional" },
    { key: "workType", label: "Work type" },
    { key: "unit", label: "Unit of work" },
    { key: "startWip", label: "Start WIP", kind: "number" },
    { key: "incoming", label: "Incoming demand", kind: "number" },
    { key: "capacity", label: "Planned completion capacity", kind: "number" },
    { key: "actualEnd", label: "Actual end WIP", kind: "number" },
    { key: "dueWork", label: "Due work" },
    { key: "aging", label: "Aging" },
    { key: "bottleneck", label: "Bottleneck" },
    { key: "staffing", label: "Available staffing" },
    { key: "source", label: "Data source" },
    { key: "verifiedAt", label: "Last verified" },
    { key: "notes", label: "Notes" },
    { key: "recovery", label: "Recovery action" },
  ];
  const readings = (operating.rows || []).map((row) => {
    const checks = (operating.thresholds || []).map((threshold) => `${threshold.name || threshold.field || "Threshold"}: ${thresholdReading(row, threshold)}`);
    return `<p class="hint"><strong>${escapeHtml(row.queue || "Untitled queue")}</strong> — ${escapeHtml(wipText(row))}${checks.length ? ` ${escapeHtml(checks.join(" "))}` : ""}</p>`;
  }).join("");
  const total = model.operatingTotal(operating.rows || []);
  const totalText = total.ok
    ? `Same-unit total (${total.unit}): projected remaining queue ${total.projected}, spare capacity ${total.spare}.`
    : total.reason;
  const thresholdColumns = [
    { key: "name", label: "Threshold" },
    { key: "field", label: "Field", kind: "select", options: [["", "Choose"], ["projected", "Projected end WIP"], ["aging", "Aging"], ["staffing", "Staffing"], ["startWip", "Start WIP"], ["actualEnd", "Actual end WIP"]] },
    { key: "direction", label: "Direction", kind: "select", options: [["above", "Above"], ["below", "Below"]] },
    { key: "value", label: "Value", kind: "number" },
    { key: "unit", label: "Unit" },
    { key: "notes", label: "Notes" },
  ];
  return `
    <h4>Daily operating control</h4>
    <p class="hint">Manual planning view, not a live feed. Projected end WIP = Start WIP + Incoming demand − Planned completion capacity. Unlike units are not added. A negative raw balance is spare capacity, and the projected remaining queue is zero.</p>
    ${toolTable("Operating rows", "Leave a number blank when it is unknown. Blank is not zero.", operating.rows, columns, "operating.rows")}
    ${readings}
    <p class="hint">${escapeHtml(totalText)}</p>
    ${toolTable("Thresholds you define", "No aging, staffing, or recovery threshold is assumed. Missing data stays “Not assessed.”", operating.thresholds, thresholdColumns, "operating.thresholds")}
  `;
}

function launchHtml(launches) {
  const statuses = model.LAUNCH_STATUSES.map((entry) => [entry.id, entry.label]);
  const blocks = (launches || []).map((launch) => {
    const rows = launch.items.map((item) => {
      const gaps = [];
      if (item.status !== "not-applicable" && !item.owner) gaps.push("Missing owner");
      if (item.status !== "not-applicable" && !item.evidence) gaps.push("Missing evidence");
      return `
        <tr>
          <td>${toolControl(item, { key: "function", label: "Function" }, "launch-items", launch.id)}</td>
          <td>${toolControl(item, { key: "requirement", label: "Requirement", kind: "area" }, "launch-items", launch.id)}</td>
          <td>${toolControl(item, { key: "owner", label: "Responsible person, optional" }, "launch-items", launch.id)}</td>
          <td>${toolControl(item, { key: "status", label: "Status", kind: "select", options: statuses }, "launch-items", launch.id)}</td>
          <td>${toolControl(item, { key: "evidence", label: "Evidence", kind: "area" }, "launch-items", launch.id)}</td>
          <td>${toolControl(item, { key: "issue", label: "Open issue", kind: "area" }, "launch-items", launch.id)}</td>
          <td>${toolControl(item, { key: "targetDate", label: "Target date", kind: "date" }, "launch-items", launch.id)}</td>
          <td>${gaps.length ? escapeHtml(gaps.join(", ")) : "Owner and evidence are recorded."}</td>
          <td><button type="button" class="remove" data-remove-tool="launch-items" data-parent="${escapeHtml(launch.id)}" data-tool-id="${escapeHtml(item.id)}">Remove</button></td>
        </tr>
      `;
    }).join("");
    return `
      <article class="tool-block">
        <label class="stack-field">Launch record
          <input class="field" ${toolAttrs("launches", launch.id, "name")} value="${escapeHtml(launch.name)}" />
        </label>
        <p class="hint">Ready is not approval. A complete checklist does not approve a launch.</p>
        <div class="budget-scroll">
          <table class="budget">
            <thead><tr><th>Function</th><th>Requirement</th><th>Responsible person</th><th>Status</th><th>Evidence</th><th>Open issue</th><th>Target date</th><th>Gaps</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <button type="button" class="add-line" data-add-tool="launch-items" data-parent="${escapeHtml(launch.id)}">Add a readiness item</button>
        <button type="button" class="remove" data-remove-tool="launches" data-tool-id="${escapeHtml(launch.id)}">Remove launch record</button>
      </article>
    `;
  }).join("");
  return `
    <h4>Launch readiness</h4>
    <p class="hint">One reusable checklist, and a separate record for each client or offering. Copy the template instead of treating one checklist as every launch.</p>
    ${blocks || `<p class="hint">No launch records yet.</p>`}
    <button type="button" class="add-line" data-copy-launch>Copy the checklist into a new launch record</button>
  `;
}

function playbookHtml(playbooks) {
  const fields = [
    ["trigger", "Trigger"],
    ["impact", "Impact"],
    ["response", "Immediate response"],
    ["escalation", "Escalation and contacts"],
    ["fallback", "Fallback procedure"],
    ["recovery", "Recovery steps"],
    ["verification", "Return-to-service verification"],
    ["gaps", "Gaps and follow-up actions"],
  ];
  return `
    <h4>Continuity playbooks</h4>
    <p class="hint">Procedures start blank. A playbook with no exercise date has not been tested.</p>
    ${(playbooks || []).map((book) => `
      <article class="tool-block">
        <h4>${escapeHtml(book.name || "Playbook")}</h4>
        <p class="hint">${book.exercised ? `Last exercise date: ${escapeHtml(book.exercised)}. This is the date you entered, not a claim that the test passed.` : "Not tested. No exercise date is recorded."}</p>
        ${fields.map(([key, label]) => `<label class="stack-field">${label}<textarea class="field" ${toolAttrs("playbooks", book.id, key)}>${escapeHtml(book[key] || "")}</textarea></label>`).join("")}
        <label class="stack-field">Last exercise date
          <input class="field" type="date" ${toolAttrs("playbooks", book.id, "exercised")} value="${escapeHtml(book.exercised || "")}" />
        </label>
      </article>
    `).join("")}
  `;
}

function economicsHtml(commercial) {
  const columns = [
    { key: "client", label: "Client or service" },
    { key: "period", label: "Period" },
    { key: "unit", label: "Unit" },
    { key: "revenue", label: "Revenue", kind: "number" },
    { key: "labor", label: "Direct labor", kind: "number" },
    { key: "packaging", label: "Packaging", kind: "number" },
    { key: "support", label: "Support", kind: "number" },
    { key: "engineering", label: "Engineering / implementation", kind: "number" },
    { key: "inventory", label: "Inventory", kind: "number" },
    { key: "exceptions", label: "Exception burden", kind: "number" },
    { key: "notes", label: "Notes" },
  ];
  const notes = (commercial.economics || []).map((row) => {
    const money = model.contributionOf(row);
    const text = money.incomplete
      ? `${row.client || "Untitled row"}: incomplete. Missing ${money.missing.join(", ")}. No profitability conclusion is shown.`
      : `${row.client || "Untitled row"}: revenue minus entered cost components = ${money.amount} ${row.unit} for ${row.period}. This is not a profitability conclusion.`;
    return `<p class="hint">${escapeHtml(text)}</p>`;
  }).join("");
  return `
    ${toolTable("Commercial rules and exceptions", "Standard, configurable, and custom rules stay as text you enter.", commercial.rules, [
      { key: "name", label: "Rule" },
      { key: "rule", label: "What it says", kind: "area" },
      { key: "exceptions", label: "Exceptions", kind: "area" },
      { key: "notes", label: "Notes", kind: "area" },
    ], "commercial.rules")}
    ${toolTable("Revenue and cost components", "Label the period and the unit on every row. Leave an unknown cost blank.", commercial.economics, columns, "commercial.economics")}
    ${notes}
    ${toolTable("Client feedback", "Record the note, the evidence, what it implies, and the follow-up. This is not a completed Voice-of-Customer study.", commercial.feedback, [
      { key: "client", label: "Client" },
      { key: "note", label: "Feedback", kind: "area" },
      { key: "evidence", label: "Evidence", kind: "area" },
      { key: "implication", label: "Implication", kind: "area" },
      { key: "followUp", label: "Follow-up", kind: "area" },
    ], "commercial.feedback")}
  `;
}

function toolsHtml(item) {
  const tools = item.tools || {};
  const parts = [];
  if (tools.portfolioReview) {
    parts.push(`<p class="hint">The weekly review is a journal template. Inserting it does not record a meeting that already happened.</p><button type="button" class="add-line" data-portfolio-review>Insert weekly portfolio-review entry</button>`);
  }
  if (Array.isArray(tools.scorecard)) {
    parts.push(toolTable("Pause and harden scorecard", "Suggested measures are not approved targets. Leave numbers blank until you enter them.", tools.scorecard, [
      { key: "measure", label: "Measure" },
      { key: "baseline", label: "Baseline" },
      { key: "target", label: "Target or exit condition" },
      { key: "actual", label: "Actual result" },
      { key: "evidence", label: "Evidence" },
      { key: "reviewDate", label: "Review date", kind: "date" },
      { key: "status", label: "Status", kind: "select", options: [["suggestion", "Suggestion"], ["not-set", "Not set"], ["watching", "Watching"], ["met", "Met"], ["missed", "Missed"]] },
    ], "scorecard"));
  }
  if (tools.operating) parts.push(operatingHtml(tools.operating));
  if (Array.isArray(tools.workflow)) {
    parts.push(`<p class="hint">PV1 and PV2 are not defined here. A proposed workflow is not compliance-approved, and this register assigns no legal responsibility.</p>`);
    parts.push(toolTable("Workflow and control register", "Classify a control only when you know which kind it is.", tools.workflow, [
      { key: "step", label: "Process step" },
      { key: "current", label: "Current workflow", kind: "area" },
      { key: "proposed", label: "Proposed workflow", kind: "area" },
      { key: "control", label: "Control classification", kind: "select", options: [["", "Not classified"], ["clinical", "Clinical"], ["clerical", "Clerical"], ["deterministic", "Deterministic"], ["exception", "Exception based"]] },
      { key: "exception", label: "Exception handling", kind: "area" },
      { key: "measurement", label: "Measurement and evidence", kind: "area" },
      { key: "compliance", label: "Compliance review", kind: "select", options: [["not-reviewed", "Not reviewed"], ["in-review", "In review"], ["questions-open", "Questions open"]] },
      { key: "questions", label: "Open questions", kind: "area" },
    ], "workflow"));
  }
  if (Array.isArray(tools.launches)) parts.push(launchHtml(tools.launches));
  if (Array.isArray(tools.bridges)) {
    parts.push(toolTable("System bridges and exceptions", "Manual effort stays blank until it is known. Disposition is a proposal until you choose it.", tools.bridges, [
      { key: "name", label: "Bridge or exception" },
      { key: "systems", label: "Systems involved" },
      { key: "frequency", label: "Frequency and impact" },
      { key: "effort", label: "Manual effort, when known" },
      { key: "disposition", label: "Proposed disposition", kind: "select", options: [["", "Not chosen"], ["automate", "Automate"], ["eliminate", "Eliminate"], ["own", "Explicitly own"]] },
      { key: "lead", label: "Accountable lead, optional" },
      { key: "dependencies", label: "Dependencies" },
      { key: "status", label: "Status" },
      { key: "evidence", label: "Evidence and notes", kind: "area" },
    ], "bridges"));
  }
  if (Array.isArray(tools.playbooks)) parts.push(playbookHtml(tools.playbooks));
  if (tools.commercial) parts.push(economicsHtml(tools.commercial));
  if (Array.isArray(tools.decisions)) {
    parts.push(toolTable("Decision rights", "Authority is optional text. Empty rules are not guardrails yet.", tools.decisions, [
      { key: "category", label: "Decision category" },
      { key: "rule", label: "Decision rule or boundary", kind: "area" },
      { key: "authority", label: "Decision authority, optional" },
      { key: "trigger", label: "Escalation trigger", kind: "area" },
      { key: "exceptions", label: "Exceptions", kind: "area" },
      { key: "reviewDate", label: "Review date", kind: "date" },
      { key: "notes", label: "Notes", kind: "area" },
    ], "decisions"));
  }
  if (tools.capacity) {
    parts.push(`<p class="hint">Workload quantity and staffing hours stay in separate columns unless you write a conversion assumption on the row.</p>`);
    parts.push(toolTable("Capacity planning", "A quantity is not a staffing hour.", tools.capacity.rows, [
      { key: "day", label: "Day" },
      { key: "client", label: "Client" },
      { key: "workType", label: "Work type" },
      { key: "quantity", label: "Workload quantity", kind: "number" },
      { key: "quantityUnit", label: "Quantity unit" },
      { key: "hours", label: "Staffing hours", kind: "number" },
      { key: "conversion", label: "Conversion assumption, if you have one" },
      { key: "notes", label: "Notes" },
    ], "capacity.rows"));
    parts.push(toolTable("Coverage", "Names here are notes, not accounts or assignments.", tools.capacity.coverage, [
      { key: "role", label: "Role, client, system, or equipment" },
      { key: "primary", label: "Primary coverage" },
      { key: "secondary", label: "Secondary coverage" },
      { key: "notes", label: "Notes" },
    ], "capacity.coverage"));
  }
  if (!parts.length) return "";
  return `<section><h3>Planning tools</h3><p class="hint">These tables are manual. Future integrations and AI interpretation are not part of this version.</p>${parts.join("")}</section>`;
}

function tasksHtml(item) {
  const rows = item.checklist
    .map(
      (entry) => `
        <div class="work-check${entry.done ? " is-done" : ""}">
          <input type="checkbox" data-check-id="${escapeHtml(entry.id)}" ${entry.done ? "checked" : ""} aria-label="Done: ${escapeHtml(entry.text || "Work item")}" />
          <input class="work-name" type="text" maxlength="2000" value="${escapeHtml(entry.text)}" data-check-text="${escapeHtml(entry.id)}" aria-label="Work item" />
          <button type="button" class="work-x" data-remove-check="${escapeHtml(entry.id)}" aria-label="Remove ${escapeHtml(entry.text || "work item")}">×</button>
        </div>
      `,
    )
    .join("");
  return `
    <section class="work-frame">
      <div class="section-head">
        <h3>Work items</h3>
        <button type="button" class="head-plus" data-add-check aria-label="Add a work item">+</button>
      </div>
      <div class="work-grid">${rows}</div>
    </section>
  `;
}

function updatesHtml(item) {
  const draft = state.addingUpdate
    ? `
      <li class="update-draft">
        <input class="update-date-input" type="date" data-update-date value="${escapeHtml(state.updateDate || todayInput())}" aria-label="Update date" />
        <input class="line-text" type="text" maxlength="500" data-update-draft value="${escapeHtml(state.updateDraft || "")}" placeholder="Comment" aria-label="Update comment" />
        <button type="button" class="text-save" data-save-update>Save</button>
      </li>
    `
    : "";
  const lines = (item.updates || [])
    .map((entry, index) => {
      const when = formatDateLabel(entry.date);
      return `
        <li class="update-line">
          ${when ? `<time class="update-date" datetime="${escapeHtml(entry.date)}">${escapeHtml(when)}</time>` : ""}
          <span class="update-text">${escapeHtml(entry.text || "")}</span>
          <button type="button" class="line-x" data-remove-update="${index}" aria-label="Remove update" tabindex="-1">×</button>
        </li>
      `;
    })
    .join("");
  return `
    <section class="lines">
      <div class="section-head">
        <h3>Updates</h3>
        <button type="button" class="head-plus" data-add-update-line aria-label="Add an update">+</button>
      </div>
      <ul class="line-list">${draft}${lines}</ul>
    </section>
  `;
}

function nextItemHtml(item) {
  const writing = state.editingNext || !item.nextStep;
  if (!writing) {
    return `
      <section class="lines next-read">
        <h3>Next item</h3>
        <p class="next-text"><button type="button" data-edit-next>${escapeHtml(item.nextStep)}</button></p>
      </section>
    `;
  }
  return `
    <label class="stack-field next-item">Next item
      <span class="next-edit">
        <input class="field" type="text" maxlength="200" data-field="nextStep" data-next-draft value="${escapeHtml(item.nextStep || "")}" placeholder="What's next" aria-label="Next item" />
        <button type="button" class="text-save" data-save-next>Save</button>
      </span>
    </label>
  `;
}

function sizePicker(item) {
  const buttons = model.SIZES.map(
    (entry) => `<button type="button" data-choose-size="${escapeHtml(entry.id)}" aria-pressed="${item.size === entry.id ? "true" : "false"}" aria-label="${escapeHtml(entry.label)}">${escapeHtml(entry.short)}</button>`,
  ).join("");
  return `
    <section class="size-section">
      <h3>Size</h3>
      <div class="size-pick" role="group" aria-label="Project size">${buttons}</div>
    </section>
  `;
}

function editFieldsHtml(item) {
  const phases = model.PHASES.map(
    (phase) => `<button type="button" data-stage="${escapeHtml(phase.id)}" aria-pressed="${item.stage === phase.id ? "true" : "false"}">${escapeHtml(phase.label)}</button>`,
  ).join("");
  const sizes = model.SIZES.map(
    (entry) => `<button type="button" data-choose-size="${escapeHtml(entry.id)}" aria-pressed="${item.size === entry.id ? "true" : "false"}">${escapeHtml(entry.label)}</button>`,
  ).join("");
  return `
    <div class="edit-fields">
      <label class="stack-field">Project name
        <input class="field" maxlength="2000" data-field="title" value="${escapeHtml(item.title)}" />
      </label>
      <label class="stack-field">Summary
        <textarea class="field" rows="3" maxlength="2000" data-field="summary">${escapeHtml(item.summary || "")}</textarea>
      </label>
      <div class="stack-field"><span class="label">Stage</span>
        <div class="segments" role="group" aria-label="Current stage">${phases}</div>
      </div>
      <div class="stack-field"><span class="label">Effort</span>
        <div class="segments" role="group" aria-label="Effort">${sizes}</div>
      </div>
      <label class="stack-field">Next step
        <input class="field" maxlength="200" data-field="nextStep" value="${escapeHtml(item.nextStep || "")}" />
      </label>
      <label class="stack-field">Notes
        <textarea class="field" rows="4" maxlength="8000" data-field="notes">${escapeHtml(item.notes || "")}</textarea>
      </label>
    </div>
  `;
}

function overviewHtml(item) {
  if (state.editingFields) return editFieldsHtml(item);
  const summary = item.summary && item.summary.trim() ? escapeHtml(item.summary) : `<span class="muted">No summary yet</span>`;
  const next = item.nextStep && item.nextStep.trim() ? escapeHtml(item.nextStep) : `<span class="muted">No next step</span>`;
  const effort = sizeLabel(item) || "Not set";
  return `
    <dl class="facts">
      <div><dt>Summary</dt><dd class="pre">${summary}</dd></div>
      <div><dt>Stage</dt><dd>${stageBadge(item)}</dd></div>
      <div><dt>Effort</dt><dd>${escapeHtml(effort)}</dd></div>
      <div><dt>Next step</dt><dd>${next}</dd></div>
    </dl>
  `;
}

function updatesPanel(item) {
  const entries = item.journal.slice().sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const list = entries
    .map((entry) => {
      if (state.editingJournalId === entry.id) {
        return `
          <article class="entry" data-journal-id="${escapeHtml(entry.id)}">
            <label class="stack-field">Title
              <input class="field" data-edit-journal-title="${escapeHtml(entry.id)}" value="${escapeHtml(entry.title)}" />
            </label>
            <label class="stack-field">Update
              <textarea class="field" data-edit-journal-body="${escapeHtml(entry.id)}">${escapeHtml(entry.body)}</textarea>
            </label>
            <div class="inline-actions">
              <button type="button" class="btn primary" data-save-journal="${escapeHtml(entry.id)}">Save update</button>
              <button type="button" class="btn secondary" data-cancel-journal>Cancel</button>
            </div>
          </article>
        `;
      }
      const text = [entry.title, entry.body].map((part) => String(part || "").trim()).filter(Boolean).join("\n");
      return `
        <article class="entry" data-journal-id="${escapeHtml(entry.id)}">
          <div class="entry-meta">
            <time datetime="${escapeHtml(entry.createdAt)}">${escapeHtml(formatStamp(entry.createdAt))}</time>
            <button type="button" class="text-btn" data-edit-journal="${escapeHtml(entry.id)}">Edit</button>
            <button type="button" class="text-btn danger" data-delete-journal="${escapeHtml(entry.id)}">Delete</button>
          </div>
          <p class="entry-body">${escapeHtml(text || "Update")}</p>
        </article>
      `;
    })
    .join("");
  const composer = state.updateComposerOpen
    ? `
      <div class="draft">
        <label class="stack-field">Date and time
          <input class="field" type="datetime-local" data-journal-when value="${escapeHtml(state.journalComposer.when || toLocalInput())}" />
        </label>
        <label class="stack-field">Title, optional
          <input class="field" type="text" maxlength="200" data-journal-title value="${escapeHtml(state.journalComposer.title)}" />
        </label>
        <label class="stack-field">Update
          <textarea class="field" maxlength="8000" data-journal-body>${escapeHtml(state.journalComposer.body)}</textarea>
        </label>
        <div class="inline-actions">
          <button type="button" class="btn primary" data-add-journal>Save update</button>
          <button type="button" class="btn secondary" data-cancel-update>Cancel</button>
        </div>
      </div>
    `
    : `<button type="button" class="btn secondary" data-add-update>+ Add update</button>`;
  return `
    <section class="updates">
      ${composer}
      ${list || `<p class="hint">No updates yet.</p>`}
    </section>
  `;
}

function statusUpdatesHtml(item) {
  const entries = item.journal.slice().sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const list = entries
    .map((entry) => {
      const text = [entry.title, entry.body].map((part) => String(part || "").trim()).filter(Boolean).join("\n");
      return `
        <article class="entry" data-journal-id="${escapeHtml(entry.id)}">
          <div class="entry-meta">
            <time datetime="${escapeHtml(entry.createdAt)}">${escapeHtml(formatStamp(entry.createdAt))}</time>
            <button type="button" class="text-btn danger" data-delete-journal="${escapeHtml(entry.id)}">Delete</button>
          </div>
          <p class="entry-body">${escapeHtml(text || "Update")}</p>
        </article>
      `;
    })
    .join("");
  return `
    <section class="updates">
      <h3>Updates</h3>
      <textarea class="field bullet-note" rows="3" maxlength="8000" data-journal-body placeholder="• " aria-label="Status update">${escapeHtml(state.journalComposer.body || "• ")}</textarea>
      <button type="button" class="btn secondary" data-add-journal>Add update</button>
      ${list}
    </section>
  `;
}

function insideHtml(item) {
  return `
    <div class="workspace" id="workspace">
      <div class="inside-tools">
        <label class="card-review">
          <input type="checkbox" data-card-review="${escapeHtml(item.id)}" ${item.review ? "checked" : ""} aria-label="Review ${escapeHtml(item.title || "project")}" />
          Review
        </label>
        <button type="button" class="text-btn" data-close>Close</button>
      </div>
      <label class="stack-field">Name
        <input class="field name-input" maxlength="2000" data-field="title" value="${escapeHtml(item.title)}" />
      </label>
      ${sizePicker(item)}
      ${tasksHtml(item)}
      ${updatesHtml(item)}
      ${nextItemHtml(item)}
      <div class="save-row"><button type="button" class="btn primary" data-save-card>Save</button></div>
    </div>
  `;
}

function workspaceHtml(item) {
  return insideHtml(item);
}

function horizonSummary(deliverable) {
  const gaps = model.commitmentGaps(deliverable);
  const tone = deliverable.commitment === "committed" ? "is-committed" : deliverable.commitment === "deferred" ? "is-deferred" : "is-candidate";
  return `
    <article class="horizon-card ${tone}">
      <p class="chips">
        <span class="chip">${escapeHtml(labelOf(model.COMMITMENTS, deliverable.commitment) || "Candidate")}</span>
        <span class="chip">${escapeHtml(labelOf(model.DELIVERY_STATUSES, deliverable.status) || "Not started")}</span>
      </p>
      <h4>${escapeHtml(deliverable.outcome || "Untitled deliverable")}</h4>
      <p class="hint">${gaps.length ? `Not yet scoped: ${escapeHtml(gaps.join(", "))}.` : "Definition, dependencies, and readiness fields are filled in."}</p>
      <button type="button" class="open-related" data-open="${escapeHtml(deliverable.projectId)}">Open project</button>
    </article>
  `;
}

function renderRoadmap() {
  const { year, quarter } = currentQuarter();
  const windows = model.horizonWindows(state.settings.baselineDate);
  const windowNote = windows
    ? `${windows.note} NOW runs ${windows.now.from} through ${windows.now.through}. NEXT runs ${windows.next.from} through ${windows.next.through}. Later stays unscheduled.`
    : "Set a planning baseline before any horizon window is calculated. The labels stay NOW, NEXT, and Later because the supplied ranges overlap around month three.";
  const horizonGroups = model.HORIZONS.map((horizon) => {
    const cards = state.items.flatMap((item) => item.deliverables.filter((deliverable) => deliverable.horizon === horizon.id).map((deliverable) => horizonSummary({ ...deliverable, projectId: item.id }))).join("");
    return `
      <section class="quarter">
        <h3>${escapeHtml(horizon.label)}</h3>
        <p class="hint">${escapeHtml(horizon.described)}. A horizon is not a commitment status.</p>
        ${cards || `<p class="hint">No deliverables in this horizon.</p>`}
      </section>
    `;
  }).join("");
  const quarters = model.quartersFor(state.items, year);
  const calendar = quarters.map((name) => {
    const lines = state.items.flatMap((item) => item.deliverables.filter((deliverable) => deliverable.quarter === name).map((deliverable) => `
      <div class="roadmap-item">
        <span class="chip">${escapeHtml(labelOf(model.COMMITMENTS, deliverable.commitment) || "Candidate")}</span>
        <button type="button" class="open-related" data-open="${escapeHtml(item.id)}">${escapeHtml(item.title || "New project")}</button>
        <span>${escapeHtml(deliverable.outcome || "Untitled deliverable")}</span>
      </div>
    `)).join("");
    return `<section class="quarter"><h3>${escapeHtml(quarterLabel(name))}</h3>${lines || `<p class="hint">Nothing placed in this quarter.</p>`}</section>`;
  }).join("");
  const projectPairs = state.items.map((item) => [item.id, `${item.title || "New project"}${item.archived ? " (archived)" : ""}`]);
  const horizons = model.HORIZONS.map((entry) => [entry.id, entry.label]);
  const picker = projectPairs.length
    ? `<label class="stack-field">Project
        <select class="field" data-roadmap-project>${optionsHtml(projectPairs, projectPairs[0][0])}</select>
      </label>
      <label class="stack-field">Outcome
        <input class="field" data-roadmap-text maxlength="500" />
      </label>
      <label class="stack-field">Planning horizon
        <select class="field" data-roadmap-horizon>${optionsHtml(horizons, "now")}</select>
      </label>
      <label class="stack-field">Calendar quarter, optional
        <select class="field" data-roadmap-quarter>${optionsHtml([["", "No quarter"], ...quarters.map((name) => [name, quarterLabel(name)])], quarter)}</select>
      </label>
      <button type="button" class="add-line" data-add-roadmap>Add deliverable</button>`
    : `<p class="hint">Add a project before planning a deliverable.</p>`;
  return `
    <section class="roadmap">
      <h2>Planning horizons</h2>
      <p class="intro">NOW, NEXT, and Later are separate from the calendar quarters below. An attractive idea stays a Candidate until its definition and readiness are filled in.</p>
      <label class="stack-field">Planning baseline date
        <input class="field" type="date" data-baseline value="${escapeHtml(state.settings.baselineDate || "")}" />
      </label>
      <p class="hint">${escapeHtml(windowNote)}</p>
      ${horizonGroups}
      <h2>Calendar quarters</h2>
      <p class="hint">A quarter is a calendar bucket. It does not change the planning horizon or the commitment.</p>
      <div class="draft">${picker}</div>
      ${calendar}
    </section>
  `;
}

function recommendationCard(entry) {
  const project = itemById(entry.projectId);
  const deliverables = project?.deliverables || [];
  const projects = [["", "No project"], ...state.items.map((item) => [item.id, item.title || "New project"])];
  const choices = [["", "No deliverable"], ...deliverables.map((deliverable) => [deliverable.id, deliverable.outcome || "Untitled deliverable"])];
  return `
    <article class="recommendation">
      <p class="source">${escapeHtml(entry.sourceLabel)}</p>
      <p class="hint">${escapeHtml(entry.sourceName)}${entry.sourceCitation ? ` · ${escapeHtml(entry.sourceCitation)}` : ""}</p>
      <p class="original">${escapeHtml(entry.originalText)}</p>
      <p class="hint">${escapeHtml(labelOf(model.HORIZONS, entry.horizon) || "Later")} · ${escapeHtml(model.HORIZONS.find((item) => item.id === entry.horizon)?.described || "")}</p>
      <label class="stack-field">Linked project
        <select class="field" data-rec-id="${escapeHtml(entry.id)}" data-rec-field="projectId">${optionsHtml(projects, entry.projectId || "")}</select>
      </label>
      <label class="stack-field">Response
        <textarea class="field" data-rec-id="${escapeHtml(entry.id)}" data-rec-field="response">${escapeHtml(entry.response)}</textarea>
      </label>
      <label class="stack-field">Action plan
        <textarea class="field" data-rec-id="${escapeHtml(entry.id)}" data-rec-field="actionPlan">${escapeHtml(entry.actionPlan)}</textarea>
      </label>
      <label class="stack-field">Linked deliverable
        <select class="field" data-rec-id="${escapeHtml(entry.id)}" data-rec-field="deliverableId">${optionsHtml(choices, entry.deliverableId || "")}</select>
      </label>
    </article>
  `;
}

function recommendationsHtml(item) {
  const entries = item?.reviewHost
    ? state.recommendations
    : state.recommendations.filter((entry) => entry.projectId === item?.id);
  if (!item?.reviewHost && !entries.length) return "";
  const note = item?.reviewHost
    ? "Every recommendation from the user-provided diagnostic is listed here. The original wording stays fixed. The response is separate."
    : "Recommendations linked to this project. The original wording stays fixed.";
  return `
    <section>
      <h3>${item?.reviewHost ? "SCALE Business Review" : "Recommendations"}</h3>
      <p class="hint">${note}</p>
      ${entries.map(recommendationCard).join("") || `<p class="hint">No recommendations are linked here.</p>`}
    </section>
  `;
}

function renderRecommendations() {
  const groups = model.HORIZONS.map((horizon) => {
    const entries = state.recommendations.filter((entry) => entry.horizon === horizon.id);
    return `
      <section class="quarter">
        <h3>${escapeHtml(horizon.label)}</h3>
        <p class="hint">${escapeHtml(horizon.described)}</p>
        ${entries.map(recommendationCard).join("") || `<p class="hint">No recommendations in this horizon.</p>`}
      </section>
    `;
  }).join("");
  return `
    <section class="roadmap">
      <h2>Recommendations</h2>
      <p class="intro">These are user-provided consultant findings. They are planning inputs, not approved commitments. The source wording does not change when you write a response.</p>
      ${groups}
    </section>
  `;
}

function renderBoard() {
  if (state.view === "roadmap") app.innerHTML = renderRoadmap();
  else if (state.view === "recommendations") app.innerHTML = renderRecommendations();
  else app.innerHTML = renderList();
}

function renderSheet() {
  sheetRoot.innerHTML = "";
  document.body.classList.remove("sheet-open");
}

function render(options = {}) {
  const y = window.scrollY;
  const panel = document.querySelector(".sheet-body, .desk");
  const panelTop = panel ? panel.scrollTop : 0;
  renderBoard();
  renderSheet();
  const nextPanel = document.querySelector(".sheet-body, .desk");
  if (nextPanel) nextPanel.scrollTop = panelTop;
  if (window.scrollY !== y) window.scrollTo(0, y);
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.setAttribute("aria-selected", button.dataset.view === state.view ? "true" : "false");
  });
  if (options.focus) {
    const focused = document.querySelector(options.focus);
    focused?.focus({ preventScroll: true });
    if (focused?.classList.contains("title-rename")) focused.select();
  }
  fitOpenWriting();
  if (options.reveal) {
    const target = document.querySelector(options.reveal);
    const scroller = target?.closest(".sheet-body, .desk");
    if (target && scroller) {
      const top = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
      scroller.scrollTop = Math.max(0, top - 12);
    } else if (target) {
      target.scrollIntoView({ block: "nearest" });
    }
  }
  if (!focusPanel) return;
  focusPanel = false;
  requestAnimationFrame(() => {
    const sheet = document.querySelector(".sheet");
    const backdrop = document.querySelector(".backdrop");
    if (sheet) {
      sheet.classList.add("is-in");
      backdrop?.classList.add("is-in");
      sheet.focus({ preventScroll: true });
      return;
    }
    document.querySelector(".workspace")?.focus({ preventScroll: true });
  });
}

function rememberOpener(node) {
  const next = node.closest(".next-line");
  const row = node.closest(".row");
  if (next) returnFocus = { source: "next", id: next.dataset.open };
  else if (node.closest(".workspace") && node.dataset.open) returnFocus = { source: "row", id: node.dataset.open };
  else if (row) returnFocus = { source: "row", id: row.dataset.id };
  else returnFocus = { source: "add" };
}

function restoreFocus() {
  const target = returnFocus;
  returnFocus = null;
  if (!target) return;
  if (target.source === "next") {
    document.querySelector(`.next-line[data-open="${CSS.escape(target.id)}"]`)?.focus();
    return;
  }
  if (target.source === "row") {
    const opener = document.querySelector(`.row[data-id="${CSS.escape(target.id)}"] .open`);
    if (opener) {
      opener.focus();
      return;
    }
  }
  document.querySelector("[data-add-project]")?.focus();
}

function fitWriting(field) {
  if (!(field instanceof HTMLTextAreaElement)) return;
  field.style.height = "0px";
  const border = field.offsetHeight - field.clientHeight;
  field.style.height = `${field.scrollHeight + Math.max(0, border)}px`;
}

function measureDrawer(drawer) {
  if (!drawer) return 0;
  drawer.querySelectorAll("textarea.bullet-note, textarea.history-note").forEach(fitWriting);
  const prior = drawer.style.maxHeight;
  drawer.style.maxHeight = "none";
  const height = drawer.scrollHeight;
  drawer.style.maxHeight = prior;
  return height;
}

function fitOpenWriting() {
  const id = state.openId;
  if (!id) return;
  const row = document.querySelector(`.row[data-id="${CSS.escape(id)}"]`);
  const drawer = row?.querySelector(".drawer");
  if (!drawer || !row.classList.contains("is-open")) {
    drawer?.querySelectorAll("textarea.bullet-note, textarea.history-note").forEach(fitWriting);
    return;
  }
  drawer.classList.add("is-sizing");
  const height = measureDrawer(drawer);
  if (height) drawer.style.maxHeight = `${height}px`;
  drawer.offsetHeight;
  drawer.classList.remove("is-sizing");
}

function settleOpen(id) {
  const row = document.querySelector(`.row[data-id="${CSS.escape(id)}"]`);
  const drawer = row?.querySelector(".drawer");
  const reveal = () => {
    if (state.openId !== id || !row) return;
    state.animateId = null;
    row.classList.add("is-open");
    const height = measureDrawer(drawer);
    if (drawer && height) drawer.style.maxHeight = `${height}px`;
  };
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    reveal();
    return;
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(reveal);
  });
}

function openProject(id) {
  if (!itemById(id)) return;
  closing = false;
  focusPanel = false;
  const opening = state.openId !== id;
  state.openId = id;
  if (opening) state.animateId = id;
  state.editingJournalId = null;
  state.renamingId = null;
  state.panelTab = "overview";
  state.editingFields = false;
  state.updateComposerOpen = false;
  state.addingUpdate = false;
  state.updateDraft = "";
  state.updateDate = "";
  state.editingNext = false;
  state.menuOpen = false;
  state.effortMenuId = null;
  state.draft = null;
  state.blockForm = null;
  state.blockError = "";
  render();
  if (opening) settleOpen(id);
}

function closeProject() {
  const id = state.openId;
  const row = id ? document.querySelector(`.row[data-id="${CSS.escape(id)}"]`) : null;
  if (!row) {
    state.openId = null;
    render();
    restoreFocus();
    return;
  }
  if (closing) return;
  closing = true;
  const drawer = row.querySelector(".drawer");
  if (drawer) {
    const height = Math.ceil(drawer.getBoundingClientRect().height);
    drawer.style.maxHeight = `${height}px`;
    drawer.offsetHeight;
    drawer.style.maxHeight = "0px";
  }
  row.classList.remove("is-open");
  let done = false;
  const finish = () => {
    if (done || state.openId !== id) return;
    done = true;
    closing = false;
    state.openId = null;
    state.editingJournalId = null;
    render();
    restoreFocus();
  };
  row.querySelector(".drawer")?.addEventListener("transitionend", (event) => {
    if (event.propertyName === "max-height") finish();
  });
  window.setTimeout(finish, 480);
}

function addProject() {
  const item = model.normalizeItem({
    id: crypto.randomUUID(),
    title: "",
    summary: "",
    color: model.COLORS[state.items.length % model.COLORS.length],
    stage: "evaluate",
    checklist: [{ text: "Get Insights", type: "action", done: false }],
    updatedAt: new Date().toISOString(),
  });
  const archived = state.items.filter((entry) => entry.archived);
  state.items = [item, ...activeItems(), ...archived];
  closing = false;
  focusPanel = false;
  returnFocus = { source: "add" };
  state.openId = item.id;
  state.view = "projects";
  state.panelTab = "overview";
  state.editingFields = true;
  state.updateComposerOpen = false;
  state.menuOpen = false;
  state.effortMenuId = null;
  save();
  render({ focus: "[data-field='title']" });
}

function duplicateOpen() {
  const item = itemById(state.openId);
  if (!item) return;
  const copy = model.duplicateProject(item);
  const index = state.items.findIndex((entry) => entry.id === item.id);
  state.items.splice(index + 1, 0, copy);
  const archived = state.items.filter((entry) => entry.archived);
  state.items = [...state.items.filter((entry) => !entry.archived), ...archived];
  state.openId = copy.id;
  state.panelTab = "overview";
  state.editingFields = false;
  state.menuOpen = false;
  state.updateComposerOpen = false;
  focusPanel = true;
  save();
  render();
  setStatus("Duplicated. Checklist progress and journal history were not copied.", { sticky: true });
}

function archiveOpen() {
  const item = itemById(state.openId);
  if (!item) return;
  item.archived = true;
  touch(item);
  state.items = [...state.items.filter((entry) => entry.id !== item.id), item];
  state.openId = null;
  undo = { kind: "archive", itemId: item.id };
  commit();
  render({ focus: `[data-restore="${CSS.escape(item.id)}"]` });
  setStatus(`Archived “${item.title || "New project"}”.`, { undo: true });
}

function restoreProject(id) {
  const item = itemById(id);
  if (!item) return;
  item.archived = false;
  touch(item);
  const rest = state.items.filter((entry) => entry.id !== id);
  state.items = [...rest.filter((entry) => !entry.archived), item, ...rest.filter((entry) => entry.archived)];
  if (state.openId === id) state.openId = null;
  save();
  render({ focus: `.row[data-id="${CSS.escape(id)}"] .open` });
  setStatus(`Restored “${item.title || "New project"}”.`, { sticky: true });
}

function deleteOpenProject() {
  const index = state.items.findIndex((item) => item.id === state.openId);
  if (index < 0) return;
  const item = state.items[index];
  undo = { kind: "item", index, item: structuredClone(item) };
  state.items.splice(index, 1);
  state.openId = null;
  returnFocus = { source: "add" };
  commit();
  render();
  setStatus(`Removed “${item.title || "New project"}”.`, { undo: true });
  document.querySelector("[data-add-project]")?.focus();
}

function undoDelete() {
  if (!undo) return;
  const record = undo;
  undo = null;
  if (record.kind === "item") {
    state.items.splice(Math.min(record.index, state.items.length), 0, record.item);
    save();
    render();
    setStatus("Restored.", { sticky: true });
    document.querySelector(`.row[data-id="${CSS.escape(record.item.id)}"] .open`)?.focus();
    return;
  }
  const item = itemById(record.itemId);
  if (!item) {
    setStatus("Could not undo that removal.", { error: true, sticky: true });
    return;
  }
  if (record.kind === "archive") {
    item.archived = false;
    const rest = state.items.filter((entry) => entry.id !== item.id);
    state.items = [...rest.filter((entry) => !entry.archived), item, ...rest.filter((entry) => entry.archived)];
  } else if (record.kind === "check") item.checklist.splice(Math.min(record.index, item.checklist.length), 0, record.entry);
  else if (record.kind === "journal") item.journal.push(record.entry);
  else if (record.kind === "material") item.materials.splice(Math.min(record.index, item.materials.length), 0, record.entry);
  else if (record.kind === "deliverable") item.deliverables.splice(Math.min(record.index, item.deliverables.length), 0, record.entry);
  else if (record.kind === "budget" && item.budget) item.budget.splice(Math.min(record.index, item.budget.length), 0, record.entry);
  else if (record.kind === "block" && item.schedule) item.schedule.blocks.splice(Math.min(record.index, item.schedule.blocks.length), 0, record.entry);
  touch(item);
  save();
  render();
  setStatus("Restored.", { sticky: true });
}

function syncCard(item) {
  const row = document.querySelector(`.row[data-id="${CSS.escape(item.id)}"]`);
  if (row) {
    const title = row.querySelector(".title");
    const label = item.title || "New project";
    if (title) {
      title.textContent = label;
      title.classList.toggle("is-placeholder", !item.title);
    }
    const badge = row.querySelector(".stage-badge");
    if (badge) {
      const phase = phaseOf(item.stage);
      badge.textContent = phase.short || phase.label;
      badge.dataset.stage = item.stage;
    }
    const slot = row.querySelector(".progress-slot");
    if (slot) slot.innerHTML = progressHtml(item);
    const effortLabel = row.querySelector(".effort-label");
    if (effortLabel) {
      const short = effortShort(item);
      effortLabel.textContent = short ? `Effort: ${short}` : "Set effort";
    }
    const blurb = row.querySelector(".blurb");
    if (blurb) {
      blurb.textContent = item.summary || "No summary yet";
      blurb.classList.toggle("is-placeholder", !item.summary);
    }
    const stage = row.querySelector(".stage-line");
    if (stage) stage.textContent = `Stage: ${phaseOf(item.stage).short}`;
    const next = row.querySelector(".next-step");
    if (next) next.textContent = `Next step: ${item.nextStep || "—"}`;
    const updated = row.querySelector(".updated");
    if (updated) updated.textContent = updatedLabel(item);
    const meter = meterHtml(item);
    row.querySelectorAll(".meter").forEach((node) => {
      node.outerHTML = meter;
    });
    row.classList.toggle("is-completed", item.stage === "completed");
    row.classList.toggle("is-blocked", item.stage === "blocked");
    row.querySelector(".handle")?.setAttribute("aria-label", `Drag to reorder ${label}`);
  }
  const heading = document.querySelector("#workspace-title");
  if (heading && state.openId === item.id) heading.textContent = item.title || "New project";
  const line = document.querySelector(".check-line");
  if (line && state.openId === item.id) {
    const progress = model.progressOf(item);
    line.textContent = `${progress.label} · ${progress.fraction} · ${progress.percentLabel}`;
  }
  const next = app.querySelector(".next");
  if (next && state.view === "projects") next.outerHTML = renderNext();
}

function applyActiveOrder(ids) {
  const active = ids.map((id) => state.items.find((item) => item.id === id)).filter(Boolean);
  const archived = state.items.filter((item) => item.archived);
  state.items = [...active, ...archived];
}

function rowTops() {
  return new Map([...document.querySelectorAll("#list .row")].map((row) => [row.dataset.id, row.getBoundingClientRect().top]));
}

function pinRow(row, delta) {
  row.style.transition = "none";
  row.style.transform = `translateY(${delta}px)`;
}

function releaseRows(rows) {
  if (!rows.length) return;
  document.querySelector("#list").getBoundingClientRect();
  for (const row of rows) {
    row.style.transition = "";
    row.style.transform = "";
  }
}

function slideRows(before, movedId) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const moving = [];
  for (const row of document.querySelectorAll("#list .row")) {
    const previous = before.get(row.dataset.id);
    if (previous == null) continue;
    const delta = previous - row.getBoundingClientRect().top;
    if (!delta) continue;
    pinRow(row, delta);
    moving.push(row);
  }
  const moved = movedId ? document.querySelector(`#list .row[data-id="${CSS.escape(movedId)}"]`) : null;
  if (moved) moved.classList.add("is-settling");
  releaseRows(moving);
  if (!moved) return;
  window.setTimeout(() => moved.classList.remove("is-settling"), 380);
}

function moveItem(id, direction) {
  if (!canReorder()) return;
  const ids = activeItems().map((item) => item.id);
  const index = ids.indexOf(id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= ids.length) return;
  const before = rowTops();
  const [moved] = ids.splice(index, 1);
  ids.splice(target, 0, moved);
  applyActiveOrder(ids);
  save();
  render();
  slideRows(before, id);
  const move = direction < 0 ? "up" : "down";
  const pressed = document.querySelector(`.nudge[data-id="${CSS.escape(id)}"][data-move="${move}"]`);
  if (pressed && !pressed.disabled) pressed.focus();
  else document.querySelector(`.row[data-id="${CSS.escape(id)}"] .nudge:not(:disabled)`)?.focus();
}

function syncOrderFromDom() {
  applyActiveOrder([...document.querySelectorAll("#list .row")].map((row) => row.dataset.id));
}

function placeDrag(event) {
  drag.row.style.transform = `translateY(${event.clientY - drag.startY - drag.compensation}px)`;
}

function onPointerMove(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const list = document.querySelector("#list");
  placeDrag(event);
  const tops = new Map([...list.querySelectorAll(".row")].map((row) => [row, row.getBoundingClientRect().top]));
  let swapped = false;
  for (let guard = 0; guard < 12; guard += 1) {
    const rows = [...list.querySelectorAll(".row")];
    const current = rows.indexOf(drag.row);
    const box = drag.row.getBoundingClientRect();
    const center = box.top + box.height / 2;
    let placed = false;
    let beforeNode = null;
    if (current > 0) {
      const previous = rows[current - 1];
      const rect = previous.getBoundingClientRect();
      if (center < rect.top + rect.height / 2) {
        placed = true;
        beforeNode = previous;
      }
    }
    if (!placed && current < rows.length - 1) {
      const next = rows[current + 1];
      const rect = next.getBoundingClientRect();
      if (center > rect.top + rect.height / 2) {
        placed = true;
        beforeNode = next.nextSibling;
      }
    }
    if (!placed) break;
    const beforeTop = drag.row.offsetTop;
    list.insertBefore(drag.row, beforeNode);
    drag.compensation += drag.row.offsetTop - beforeTop;
    placeDrag(event);
    swapped = true;
  }
  if (!swapped) return;
  [...list.querySelectorAll(".row")].forEach((row, index, rows) => {
    const rank = row.querySelector(".rank");
    if (rank) rank.textContent = String(index + 1);
    const up = row.querySelector('[data-move="up"]');
    const down = row.querySelector('[data-move="down"]');
    if (up) up.disabled = index === 0;
    if (down) down.disabled = index === rows.length - 1;
  });
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const moving = [];
  for (const row of list.querySelectorAll(".row")) {
    if (row === drag.row) continue;
    const delta = tops.get(row) - row.getBoundingClientRect().top;
    if (!delta) continue;
    pinRow(row, delta);
    moving.push(row);
  }
  releaseRows(moving);
}

function moveCheck(id, direction) {
  const item = itemById(state.openId);
  if (!item) return;
  const visible = visibleChecks(item);
  const pos = visible.findIndex((entry) => entry.id === id);
  const neighbor = visible[pos + direction];
  if (!neighbor) return;
  const from = item.checklist.findIndex((entry) => entry.id === id);
  const [entry] = item.checklist.splice(from, 1);
  const to = item.checklist.findIndex((line) => line.id === neighbor.id);
  item.checklist.splice(direction < 0 ? to : to + 1, 0, entry);
  touch(item);
  save();
  render();
  const name = direction < 0 ? "up" : "down";
  const pressed = document.querySelector(`[data-check-move="${name}"][data-check-target="${CSS.escape(id)}"]`);
  if (pressed && !pressed.disabled) pressed.focus();
}

function startUpdate() {
  if (!itemById(state.openId)) return;
  state.addingUpdate = true;
  state.updateDraft = "";
  state.updateDate = todayInput();
  render({ focus: "[data-update-draft]" });
}

function commitUpdate() {
  const item = itemById(state.openId);
  const field = document.querySelector("[data-update-draft]");
  const dateField = document.querySelector("[data-update-date]");
  if (!item || !field) return;
  const text = field.value.replace(/\s+/g, " ").trim().slice(0, 500);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateField?.value || "") ? dateField.value : state.updateDate || todayInput();
  state.addingUpdate = false;
  state.updateDraft = "";
  state.updateDate = "";
  if (text) {
    item.updates = [{ date, text }, ...(item.updates || [])];
    touch(item);
    save();
  }
  render({ focus: "[data-add-update-line]" });
}

function saveNextItem() {
  const item = itemById(state.openId);
  const field = document.querySelector("[data-next-draft]");
  if (!item || !field) return;
  applyText(item, field);
  state.editingNext = false;
  save();
  render();
}

function removeUpdate(index) {
  const item = itemById(state.openId);
  const at = Number(index);
  if (!item || !item.updates || at < 0 || at >= item.updates.length) return;
  item.updates.splice(at, 1);
  touch(item);
  save();
  render({ focus: "[data-add-update-line]" });
}

function addCheck() {
  const item = itemById(state.openId);
  if (!item) return;
  const blank = item.checklist.find((entry) => !entry.text.trim());
  if (blank) {
    render({ focus: `[data-check-text="${CSS.escape(blank.id)}"]` });
    return;
  }
  const entry = {
    id: crypto.randomUUID(),
    text: "",
    done: false,
    type: "action",
    due: "",
    journalId: "",
    workstream: "",
    answer: "",
  };
  item.checklist.push(entry);
  state.checkFilter = state.checkFilter === "done" ? "all" : state.checkFilter;
  touch(item);
  save();
  render({ focus: `[data-check-text="${CSS.escape(entry.id)}"]` });
}

function updateText(value) {
  return String(value || "")
    .split("\n")
    .map((line) => line.replace(/^[\s•]+/, "").trim())
    .filter(Boolean)
    .join("\n");
}

let lineBlank = null;

function linePoints(text) {
  if (!String(text || "").trim()) return [];
  return String(text)
    .split("\n")
    .map((line) => line.replace(/^[\s]*[•\-*]\s?/, "").trim())
    .filter(Boolean);
}

function lineText(lines) {
  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `• ${line}`)
    .join("\n");
}

function lineAttr(kind) {
  return kind === "notes" ? "note" : "summary";
}

function displayedLines(text, kind) {
  const lines = linePoints(text);
  if (lineBlank && lineBlank.kind === kind) {
    const at = lineBlank.index;
    lineBlank = null;
    lines.splice(Math.max(0, Math.min(at, lines.length)), 0, "");
  }
  if (!lines.length || lines[lines.length - 1].trim()) lines.push("");
  return lines;
}

function linesSection(title, kind, text, placeholder) {
  const attr = lineAttr(kind);
  const rows = displayedLines(text, kind)
    .map(
      (line, index) => `
        <li class="line">
          <span class="line-mark" aria-hidden="true"></span>
          <input class="line-text" type="text" maxlength="500" value="${escapeHtml(line)}" data-${attr}-index="${index}" placeholder="${escapeHtml(placeholder)}" aria-label="${escapeHtml(placeholder)}" />
          <button type="button" class="line-x" data-remove-${attr}="${index}" aria-label="Delete ${escapeHtml(placeholder.toLowerCase())}" tabindex="-1">×</button>
        </li>
      `,
    )
    .join("");
  return `
    <section class="lines">
      <h3>${escapeHtml(title)}</h3>
      <ul class="line-list">${rows}</ul>
    </section>
  `;
}

function writeLines(item, kind, lines) {
  item[kind] = lineText(lines);
  touch(item);
}

function ensureTrailingLine(root, kind) {
  const attr = lineAttr(kind);
  const fields = [...root.querySelectorAll(`[data-${attr}-index]`)];
  if (!fields.length || fields.some((field) => !field.value.trim())) return;
  const list = fields.at(-1).closest(".line-list");
  if (!list) return;
  const index = fields.length;
  const placeholder = kind === "notes" ? "Add a note" : "Add an update";
  const row = document.createElement("li");
  row.className = "line";
  row.innerHTML = `<span class="line-mark" aria-hidden="true"></span><input class="line-text" type="text" maxlength="500" data-${attr}-index="${index}" placeholder="${placeholder}" aria-label="${placeholder}" /><button type="button" class="line-x" data-remove-${attr}="${index}" aria-label="Delete ${placeholder.toLowerCase()}" tabindex="-1">×</button>`;
  list.appendChild(row);
}

function addLine(kind, afterIndex) {
  const item = itemById(state.openId);
  const root = document.querySelector(".row.is-open .workspace");
  if (!item || !root) return;
  const attr = lineAttr(kind);
  const lines = [...root.querySelectorAll(`[data-${attr}-index]`)].map((field) => field.value.trim());
  writeLines(item, kind, lines);
  const focusAt = afterIndex == null ? linePoints(item[kind]).length : lines.slice(0, afterIndex + 1).filter(Boolean).length;
  lineBlank = { kind, index: focusAt };
  save();
  render({ focus: `[data-${attr}-index="${focusAt}"]` });
}

function removeLine(kind, index) {
  const item = itemById(state.openId);
  const root = document.querySelector(".row.is-open .workspace");
  if (!item || !root) return;
  const attr = lineAttr(kind);
  const lines = [...root.querySelectorAll(`[data-${attr}-index]`)].map((field) => field.value);
  lines.splice(Number(index), 1);
  writeLines(item, kind, lines);
  save();
  const next = Math.max(0, Math.min(Number(index), Math.max(0, lines.filter((line) => line.trim()).length)));
  render({ focus: `[data-${attr}-index="${next}"]` });
}

function bulletDraft(text) {
  const value = String(text || "");
  if (!value.trim()) return "• ";
  return value
    .split("\n")
    .map((line) => {
      const lead = line.match(/^\s*/)[0];
      const body = line.slice(lead.length);
      if (!body || body.startsWith("• ")) return line;
      return `${lead}• ${body.replace(/^[•\-*]\s?/, "")}`;
    })
    .join("\n");
}

function bulletField(field) {
  const start = field.selectionStart ?? field.value.length;
  const lines = field.value.split("\n");
  let pos = 0;
  let caret = start;
  const nextLines = lines.map((line) => {
    const lead = line.match(/^\s*/)[0];
    const body = line.slice(lead.length);
    let rewritten = line;
    if (body && !body.startsWith("• ")) {
      rewritten = `${lead}• ${body.replace(/^[•\-*]\s?/, "")}`;
    }
    const lineEnd = pos + line.length;
    const added = rewritten.length - line.length;
    if (added && start > pos) caret += start >= lineEnd || start - pos >= lead.length ? added : 0;
    pos = lineEnd + 1;
    return rewritten;
  });
  const next = nextLines.join("\n");
  if (next === field.value) return;
  field.value = next;
  const point = Math.max(0, Math.min(next.length, caret));
  field.selectionStart = field.selectionEnd = point;
}

function saveOpenCard() {
  const item = itemById(state.openId);
  const root = item ? document.querySelector(`.row[data-id="${CSS.escape(item.id)}"] .workspace`) : null;
  if (!item || !root) return;
  const title = root.querySelector("[data-field='title']");
  const notes = root.querySelector("[data-field='notes']");
  if (title) applyText(item, title);
  const nextItem = root.querySelector("[data-field='nextStep']");
  if (nextItem) applyText(item, nextItem);
  const updateDraft = root.querySelector("[data-update-draft]");
  if (updateDraft) {
    const text = updateDraft.value.replace(/\s+/g, " ").trim().slice(0, 500);
    const dateField = root.querySelector("[data-update-date]");
    const date = /^\d{4}-\d{2}-\d{2}$/.test(dateField?.value || "") ? dateField.value : todayInput();
    if (text) {
      item.updates = [{ date, text }, ...(item.updates || [])];
      touch(item);
    }
    state.addingUpdate = false;
    state.updateDraft = "";
    state.updateDate = "";
  }
  state.editingNext = false;
  if (root.querySelector("[data-summary-index]")) writeLines(item, "summary", [...root.querySelectorAll("[data-summary-index]")].map((field) => field.value));
  if (root.querySelector("[data-note-index]")) writeLines(item, "notes", [...root.querySelectorAll("[data-note-index]")].map((field) => field.value));
  if (notes && notes.tagName === "TEXTAREA") applyText(item, notes);
  root.querySelectorAll("[data-check-text]").forEach((field) => applyText(item, field));
  save();
  closeProject();
}

function removeCheck(id) {
  const item = itemById(state.openId);
  const index = item?.checklist.findIndex((entry) => entry.id === id) ?? -1;
  if (index < 0) return;
  undo = { kind: "check", itemId: item.id, index, entry: structuredClone(item.checklist[index]) };
  item.checklist.splice(index, 1);
  touch(item);
  commit();
  render();
  setStatus("Removed a work item.", { undo: true });
}

function addJournal() {
  const item = itemById(state.openId);
  if (!item) return;
  const title = state.journalComposer.title.trim();
  const body = state.journalComposer.body;
  if (!title && !updateText(body)) {
    setStatus("Write a title or some text before adding the update.", { error: true, sticky: true });
    return;
  }
  const createdAt = fromLocalInput(state.journalComposer.when);
  const entry = {
    id: crypto.randomUUID(),
    createdAt,
    updatedAt: createdAt,
    title: title.replace(/\n/g, " ").slice(0, 200),
    body: body.slice(0, 8000),
  };
  item.journal.push(entry);
  state.expandedJournal.add(entry.id);
  state.journalComposer = { when: "", title: "", body: "" };
  state.updateComposerOpen = false;
  touch(item);
  save();
  render({ reveal: `[data-journal-id="${CSS.escape(entry.id)}"]` });
}

function saveJournalEdit(id) {
  const item = itemById(state.openId);
  const entry = item?.journal.find((journal) => journal.id === id);
  const titleEl = document.querySelector(`[data-edit-journal-title="${CSS.escape(id)}"]`);
  const bodyEl = document.querySelector(`[data-edit-journal-body="${CSS.escape(id)}"]`);
  if (!entry || !titleEl || !bodyEl) return;
  const title = titleEl.value.replace(/\n/g, " ").trim().slice(0, 200);
  const body = bodyEl.value.slice(0, 8000);
  if (!title && !body.trim()) {
    setStatus("Write a title or some text, or delete the entry.", { error: true, sticky: true });
    return;
  }
  if (title !== entry.title || body !== entry.body) entry.updatedAt = new Date().toISOString();
  entry.title = title;
  entry.body = body;
  state.editingJournalId = null;
  touch(item);
  save();
  render({ reveal: `[data-journal-id="${CSS.escape(id)}"]` });
}

function deleteJournal(id) {
  const item = itemById(state.openId);
  const index = item?.journal.findIndex((entry) => entry.id === id) ?? -1;
  if (index < 0) return;
  undo = { kind: "journal", itemId: item.id, entry: structuredClone(item.journal[index]) };
  item.journal.splice(index, 1);
  state.expandedJournal.delete(id);
  if (state.editingJournalId === id) state.editingJournalId = null;
  if (state.draft?.journalId === id) state.draft = null;
  touch(item);
  commit();
  render();
  setStatus("Removed an update.", { undo: true });
}

function draftFromJournal(id) {
  const item = itemById(state.openId);
  const entry = item?.journal.find((journal) => journal.id === id);
  if (!entry) return;
  const text = (entry.title || entry.body.split("\n")[0] || "").slice(0, 300);
  state.draft = { projectId: item.id, journalId: entry.id, text, type: "action", due: "", workstream: "" };
  state.checkFilter = "open";
  render({ reveal: "[data-draft-text]", focus: "[data-draft-text]" });
}

function saveDraft() {
  const item = itemById(state.openId);
  if (!item || !state.draft) return;
  const text = document.querySelector("[data-draft-text]")?.value || "";
  const type = document.querySelector("[data-draft-type]")?.value || "action";
  const due = document.querySelector("[data-draft-due]")?.value || "";
  const workstream = document.querySelector("[data-draft-stream]")?.value || "";
  item.checklist.push({
    id: crypto.randomUUID(),
    text: text.slice(0, 2000),
    done: false,
    type: model.CHECK_TYPES.some((entry) => entry.id === type) ? type : "action",
    due: /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : "",
    journalId: state.draft.journalId,
    workstream,
    answer: "",
  });
  state.draft = null;
  touch(item);
  save();
  render();
  setStatus("Added a checklist item linked to that journal entry.", { sticky: true });
}

function showJournal(id) {
  state.expandedJournal.add(id);
  state.editingJournalId = null;
  render({ reveal: `[data-journal-id="${CSS.escape(id)}"]` });
}

function toggleJournal(id) {
  if (state.expandedJournal.has(id)) state.expandedJournal.delete(id);
  else state.expandedJournal.add(id);
  const article = document.querySelector(`[data-journal-id="${CSS.escape(id)}"]`);
  if (!article || state.editingJournalId === id) {
    render();
    return;
  }
  const open = state.expandedJournal.has(id);
  article.querySelector(".entry-body")?.toggleAttribute("hidden", !open);
  article.querySelector(".entry-actions")?.toggleAttribute("hidden", !open);
  const previewLine = article.querySelector(".hint");
  if (previewLine) previewLine.hidden = open;
  const button = article.querySelector("[data-toggle-journal]");
  if (button) {
    button.textContent = open ? "Hide entry" : "Show entry";
    button.setAttribute("aria-expanded", open ? "true" : "false");
  }
}

function addMaterial() {
  const item = itemById(state.openId);
  if (!item) return;
  const material = { id: crypto.randomUUID(), title: "", url: "", notes: "" };
  item.materials.push(material);
  touch(item);
  save();
  render({ focus: `[data-material-id="${CSS.escape(material.id)}"][data-material-field="title"]` });
}

function removeMaterial(id) {
  const item = itemById(state.openId);
  const index = item?.materials.findIndex((entry) => entry.id === id) ?? -1;
  if (index < 0) return;
  undo = { kind: "material", itemId: item.id, index, entry: structuredClone(item.materials[index]) };
  item.materials.splice(index, 1);
  touch(item);
  commit();
  render();
  setStatus("Removed a reference.", { undo: true });
}

function linkRelated() {
  const item = itemById(state.openId);
  const id = document.querySelector("[data-related-pick]")?.value;
  if (!item || !id || id === item.id || item.relatedIds.includes(id)) return;
  item.relatedIds.push(id);
  touch(item);
  save();
  render();
}

function addDeliverable(projectId, raw) {
  const item = itemById(projectId);
  const deliverable = model.normalizeDeliverable({ id: crypto.randomUUID(), commitment: "candidate", status: "not-started", ...raw });
  if (!item || !deliverable) {
    setStatus("Write an outcome before adding a deliverable.", { error: true, sticky: true });
    return;
  }
  item.deliverables.push(deliverable);
  touch(item);
  save();
  render();
}

function toolRows(item, collection, parentId) {
  const tools = item.tools;
  if (collection === "scorecard") return tools.scorecard;
  if (collection === "operating.rows") return tools.operating?.rows;
  if (collection === "operating.thresholds") return tools.operating?.thresholds;
  if (collection === "workflow") return tools.workflow;
  if (collection === "bridges") return tools.bridges;
  if (collection === "playbooks") return tools.playbooks;
  if (collection === "commercial.rules") return tools.commercial?.rules;
  if (collection === "commercial.economics") return tools.commercial?.economics;
  if (collection === "commercial.feedback") return tools.commercial?.feedback;
  if (collection === "decisions") return tools.decisions;
  if (collection === "capacity.rows") return tools.capacity?.rows;
  if (collection === "capacity.coverage") return tools.capacity?.coverage;
  if (collection === "launches") return tools.launches;
  if (collection === "launch-items") return tools.launches?.find((entry) => entry.id === parentId)?.items;
  return null;
}

function blankTool(collection) {
  const id = crypto.randomUUID();
  if (collection === "scorecard") return { id, measure: "", baseline: "", target: "", actual: "", evidence: "", reviewDate: "", status: "not-set" };
  if (collection === "operating.rows") return { id, date: "", queue: "", client: "", workType: "", unit: "", startWip: null, incoming: null, capacity: null, actualEnd: null, dueWork: "", aging: "", bottleneck: "", staffing: "", source: "", verifiedAt: "", notes: "", recovery: "" };
  if (collection === "operating.thresholds") return { id, name: "", field: "", direction: "above", value: null, unit: "", notes: "" };
  if (collection === "workflow") return { id, step: "", current: "", proposed: "", control: "", exception: "", measurement: "", compliance: "not-reviewed", questions: "" };
  if (collection === "bridges") return { id, name: "", systems: "", frequency: "", effort: "", disposition: "", lead: "", dependencies: "", status: "", evidence: "" };
  if (collection === "commercial.rules") return { id, name: "", rule: "", exceptions: "", notes: "" };
  if (collection === "commercial.economics") return { id, client: "", period: "", unit: "", revenue: null, labor: null, packaging: null, support: null, engineering: null, inventory: null, exceptions: null, notes: "" };
  if (collection === "commercial.feedback") return { id, client: "", note: "", evidence: "", implication: "", followUp: "" };
  if (collection === "decisions") return { id, category: "", rule: "", authority: "", trigger: "", exceptions: "", reviewDate: "", notes: "" };
  if (collection === "capacity.rows") return { id, day: "", client: "", workType: "", quantity: null, quantityUnit: "", hours: null, conversion: "", notes: "" };
  if (collection === "capacity.coverage") return { id, role: "", primary: "", secondary: "", notes: "" };
  if (collection === "launch-items") return { id, function: "", requirement: "", owner: "", status: "not-assessed", evidence: "", issue: "", targetDate: "" };
  return null;
}

function parseQuantity(value) {
  const trimmed = String(value).trim().replace(/[$,]/g, "");
  if (!trimmed) return { ok: true, value: null };
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return { ok: false };
  return { ok: true, value: Math.round(Number(trimmed) * 100) / 100 };
}

function removeDeliverable(projectId, id) {
  const item = itemById(projectId);
  const index = item?.deliverables.findIndex((entry) => entry.id === id) ?? -1;
  if (index < 0) return;
  undo = { kind: "deliverable", itemId: item.id, index, entry: structuredClone(item.deliverables[index]) };
  item.deliverables.splice(index, 1);
  touch(item);
  commit();
  render();
  setStatus("Removed a deliverable.", { undo: true });
}

function addBudgetRow() {
  const item = itemById(state.openId);
  if (!item) return;
  if (!Array.isArray(item.budget)) item.budget = [];
  const row = {
    id: crypto.randomUUID(),
    vendor: "",
    category: "",
    frequency: "unknown",
    currentCost: null,
    proposedCost: null,
    renewal: "",
    notes: "",
  };
  item.budget.push(row);
  touch(item);
  save();
  render({ focus: `[data-budget-id="${CSS.escape(row.id)}"][data-budget-field="vendor"]` });
}

function removeBudgetRow(id) {
  const item = itemById(state.openId);
  const index = item?.budget?.findIndex((entry) => entry.id === id) ?? -1;
  if (index < 0) return;
  undo = { kind: "budget", itemId: item.id, index, entry: structuredClone(item.budget[index]) };
  item.budget.splice(index, 1);
  touch(item);
  commit();
  render();
  setStatus("Removed a cost row.", { undo: true });
}

function readBlockForm() {
  const root = document.querySelector(".block-form");
  if (!root) return null;
  return {
    projectId: state.openId,
    id: root.dataset.editing || "",
    activity: root.querySelector("[data-block-field='activity']")?.value || "",
    day: root.querySelector("[data-block-field='day']")?.value || "Monday",
    start: root.querySelector("[data-block-field='start']")?.value || "08:00",
    end: root.querySelector("[data-block-field='end']")?.value || "09:00",
    staffCount: root.querySelector("[data-block-field='staff']")?.value.trim() || "",
    names: root.querySelector("[data-block-field='names']")?.value || "",
    notes: root.querySelector("[data-block-field='notes']")?.value || "",
  };
}

function saveBlockForm(event) {
  event.preventDefault();
  const item = itemById(state.openId);
  const attempt = readBlockForm();
  if (!item?.schedule || !attempt) return;
  let error = model.blockError(attempt);
  if (!error && attempt.staffCount && !/^\d{1,2}$/.test(attempt.staffCount)) {
    error = "Staffing count has to be a whole number, or left blank.";
  }
  if (!error && attempt.staffCount && Number(attempt.staffCount) > 99) error = "Staffing count has to be 99 or less.";
  if (error) {
    state.blockForm = attempt;
    state.blockError = error;
    render({ focus: "[data-block-field='activity']" });
    return;
  }
  const stored = {
    activity: attempt.activity.replace(/\n/g, " ").trim().slice(0, 160),
    day: attempt.day,
    start: attempt.start,
    end: attempt.end,
    staffCount: attempt.staffCount,
    names: attempt.names.replace(/\n/g, " ").trim().slice(0, 200),
    notes: attempt.notes.replace(/\n/g, " ").trim().slice(0, 300),
  };
  if (attempt.id) {
    const block = item.schedule.blocks.find((entry) => entry.id === attempt.id);
    if (block) Object.assign(block, stored);
  } else item.schedule.blocks.push({ ...stored, id: crypto.randomUUID() });
  state.blockForm = null;
  state.blockError = "";
  touch(item);
  save();
  render();
  setStatus("Saved the weekly template.", { sticky: true });
}

function deleteBlock(id) {
  const item = itemById(state.openId);
  const index = item?.schedule?.blocks.findIndex((entry) => entry.id === id) ?? -1;
  if (index < 0) return;
  undo = { kind: "block", itemId: item.id, index, entry: structuredClone(item.schedule.blocks[index]) };
  item.schedule.blocks.splice(index, 1);
  state.blockForm = null;
  state.blockError = "";
  touch(item);
  commit();
  render();
  setStatus("Removed an activity.", { undo: true });
}

function paintBlock(block) {
  const shell = document.querySelector(`[data-block-id="${CSS.escape(block.id)}"]`);
  const column = document.querySelector(`.day-col[data-day="${CSS.escape(block.day)}"]`);
  if (!shell || !column) return;
  if (shell.parentElement !== column) column.append(shell);
  const start = model.parseTime(block.start);
  const end = model.parseTime(block.end);
  const slot = blockDrag?.slot || 28;
  shell.style.top = `${((start - model.DAY_START) / 30) * slot}px`;
  shell.style.height = `${Math.max(slot, ((end - start) / 30) * slot)}px`;
  const time = shell.querySelector(".block-move span");
  if (time) time.textContent = `${clockLabel(block.start)}–${clockLabel(block.end)}`;
}

function columnAt(x) {
  return [...document.querySelectorAll(".day-col")].find((column) => {
    const rect = column.getBoundingClientRect();
    return x >= rect.left && x <= rect.right;
  });
}

function exportList() {
  const blob = new Blob([JSON.stringify(model.exportDocument(state.items, state.recommendations, state.settings), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "pocket-work-tracker.json";
  link.click();
  URL.revokeObjectURL(url);
  if (!undo) setStatus("Exported a backup of this list.", { sticky: true });
}

function downloadRaw() {
  const blob = new Blob([state.rawBackup], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "pocket-unreadable-backup.json";
  link.click();
  URL.revokeObjectURL(url);
}

function openConfirm(options) {
  confirmReturn = document.activeElement;
  pendingConfirm = options;
  renderConfirm();
}

function closeConfirm() {
  pendingConfirm = null;
  confirmRoot.innerHTML = "";
  if (confirmReturn && document.contains(confirmReturn)) confirmReturn.focus();
  confirmReturn = null;
}

function acceptConfirm() {
  const action = pendingConfirm;
  pendingConfirm = null;
  confirmReturn = null;
  confirmRoot.innerHTML = "";
  if (action) action.onOk();
}

function renderConfirm() {
  if (!pendingConfirm) {
    confirmRoot.innerHTML = "";
    return;
  }
  confirmRoot.innerHTML = `
    <div class="confirm-backdrop" data-confirm-cancel></div>
    <div class="confirm" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <h2 id="confirm-title">${escapeHtml(pendingConfirm.title)}</h2>
      <p>${escapeHtml(pendingConfirm.body)}</p>
      <div class="confirm-actions">
        <button type="button" class="confirm-cancel" data-confirm-cancel>Cancel</button>
        <button type="button" class="confirm-ok${pendingConfirm.danger ? " is-danger" : ""}" data-confirm-ok>${escapeHtml(pendingConfirm.okLabel)}</button>
      </div>
    </div>
  `;
  confirmRoot.querySelector(".confirm-cancel")?.focus();
}

function countLabel(count, suffix) {
  return `${count} ${count === 1 ? "project" : "projects"}${suffix}`;
}

function askImport(result) {
  const incoming = countLabel(result.items.length, "");
  const current = state.storageMode === "corrupt" ? "the unreadable save in this browser" : countLabel(state.items.length, " saved on this browser");
  openConfirm({
    title: "Replace this list?",
    body: `This will overwrite ${current} with ${incoming} and ${result.recommendations.length} recommendations from the file.`,
    okLabel: "Replace",
    onOk() {
      undo = null;
      state.items = result.items;
      state.recommendations = result.recommendations;
      state.settings = result.settings;
      state.openId = null;
      state.editingJournalId = null;
      state.view = "projects";
      commit();
      render();
      setStatus("Saved on this browser");
      document.querySelector("[data-add-project]")?.focus();
    },
  });
}

function askFresh() {
  openConfirm({
    title: "Start a fresh list?",
    body: "This replaces the unreadable save with the starter projects. Download the backup first if you still need that file.",
    okLabel: "Start fresh",
    onOk() {
      undo = null;
      applyPlan(model.migratePlan([], null));
      state.openId = null;
      state.view = "projects";
      commit();
      render();
    },
  });
}

function retrySave() {
  undo = null;
  commit();
}

function focusables(root) {
  if (!root) return [];
  return [...root.querySelectorAll("button, input, select, textarea, a[href]")].filter((el) => {
    if (el.disabled || el.hidden) return false;
    if (el.closest("[hidden]")) return false;
    return el.getClientRects().length > 0;
  });
}

function trapTab(event, root) {
  if (event.key !== "Tab" || !root) return;
  const items = focusables(root);
  if (!items.length) {
    event.preventDefault();
    return;
  }
  const active = document.activeElement;
  if (!items.includes(active)) {
    event.preventDefault();
    (event.shiftKey ? items[items.length - 1] : items[0]).focus();
    return;
  }
  if (event.shiftKey && active === items[0]) {
    event.preventDefault();
    items[items.length - 1].focus();
  } else if (!event.shiftKey && active === items[items.length - 1]) {
    event.preventDefault();
    items[0].focus();
  }
}

function applyText(item, target) {
  const field = target.dataset.field;
  if (field === "title") {
    const cleaned = target.value.replace(/\n/g, " ").slice(0, 2000);
    if (cleaned !== target.value) target.value = cleaned;
    item.title = cleaned;
    touch(item);
    syncCard(item);
    return true;
  }
  if (field === "notes") {
    item.notes = target.value.slice(0, 8000);
    touch(item);
    return true;
  }
  if (field === "summary") {
    bulletField(target);
    const limit = 2000;
    const shown = target.value.slice(0, limit);
    const stored = updateText(shown) ? shown : "";
    if (!stored && target.value !== "• ") {
      target.value = "• ";
      target.selectionStart = target.selectionEnd = target.value.length;
    }
    item[field] = stored;
    touch(item);
    return true;
  }
  if (field === "nextStep") {
    item.nextStep = target.value.slice(0, 200);
    touch(item);
    syncCard(item);
    return true;
  }
  if (field === "purpose" || field === "scope" || field === "outcome") {
    item.brief[field] = target.value.slice(0, 4000);
    if (field === "scope") item.statusNote = "";
    touch(item);
    return true;
  }
  if (target.dataset.checkText) {
    const entry = item.checklist.find((line) => line.id === target.dataset.checkText);
    if (!entry) return false;
    entry.text = target.value.slice(0, 2000);
    touch(item);
    return true;
  }
  if (target.dataset.checkAnswer && target.type !== "date") {
    const entry = item.checklist.find((line) => line.id === target.dataset.checkAnswer);
    if (!entry) return false;
    entry.answer = target.value.slice(0, 500);
    touch(item);
    return true;
  }
  if (target.dataset.journalTitle != null) {
    state.journalComposer.title = target.value.slice(0, 200);
    return false;
  }
  if (target.dataset.journalBody != null) {
    state.journalComposer.body = target.value.slice(0, 8000);
    return false;
  }
  if (target.dataset.journalWhen != null) {
    state.journalComposer.when = target.value;
    return false;
  }
  if (target.dataset.draftText != null && state.draft) {
    state.draft.text = target.value;
    return false;
  }
  if (target.dataset.materialId && target.dataset.materialField) {
    const material = item.materials.find((entry) => entry.id === target.dataset.materialId);
    if (!material) return false;
    const max = target.dataset.materialField === "notes" ? 2000 : target.dataset.materialField === "url" ? 500 : 200;
    material[target.dataset.materialField] = target.value.slice(0, max);
    touch(item);
    return true;
  }
  if (target.dataset.budgetId && target.dataset.budgetField) {
    const row = item.budget?.find((entry) => entry.id === target.dataset.budgetId);
    if (!row) return false;
    const key = target.dataset.budgetField;
    if (key === "currentCost" || key === "proposedCost" || key === "frequency" || key === "renewal") return false;
    const max = key === "notes" ? 300 : key === "category" ? 80 : 160;
    row[key] = target.value.slice(0, max);
    touch(item);
    return true;
  }
  if (target.closest(".block-form")) {
    state.blockForm = readBlockForm();
    return false;
  }
  if (target.dataset.deliverableId && target.dataset.deliverableField) {
    const project = itemById(target.dataset.project) || item;
    const deliverable = project?.deliverables.find((entry) => entry.id === target.dataset.deliverableId);
    if (!deliverable || target.tagName === "SELECT") return false;
    const limit = target.tagName === "TEXTAREA" ? 2000 : 500;
    deliverable[target.dataset.deliverableField] = target.value.slice(0, limit);
    touch(project);
    return true;
  }
  if (target.dataset.recId && target.dataset.recField) {
    const recommendation = state.recommendations.find((entry) => entry.id === target.dataset.recId);
    if (!recommendation || target.tagName === "SELECT") return false;
    recommendation[target.dataset.recField] = target.value.slice(0, 4000);
    return true;
  }
  if (target.dataset.collection && target.dataset.toolField && target.tagName !== "SELECT" && target.type !== "date" && target.placeholder !== "Unknown") {
    const project = item;
    const row = toolRows(project, target.dataset.collection, target.dataset.parent)?.find((entry) => entry.id === target.dataset.toolId);
    if (!row) return false;
    const limit = target.tagName === "TEXTAREA" ? 2000 : 300;
    row[target.dataset.toolField] = target.value.slice(0, limit);
    touch(project);
    return true;
  }
  return false;
}

document.addEventListener("pointerdown", (event) => {
  const blockHandle = event.target.closest("[data-block-drag]");
  if (blockHandle && !pendingConfirm) {
    const shell = blockHandle.closest("[data-block-id]");
    const item = itemById(state.openId);
    const block = item?.schedule?.blocks.find((entry) => entry.id === shell?.dataset.blockId);
    if (block) {
      event.preventDefault();
      blockDrag = {
        pointerId: event.pointerId,
        mode: blockHandle.dataset.blockDrag,
        itemId: item.id,
        blockId: block.id,
        origin: structuredClone(block),
        grabY: event.clientY - shell.getBoundingClientRect().top,
        slot: document.querySelector(".day-col .slot")?.getBoundingClientRect().height || 28,
      };
      shell.classList.add("is-dragging");
      try {
        blockHandle.setPointerCapture(event.pointerId);
      } catch (error) {
        /* The document listener still receives the move. */
      }
      return;
    }
  }
  const handle = event.target.closest(".handle");
  if (!handle || pendingConfirm || handle.closest(".workspace") || !canReorder()) return;
  if (!desktopQuery.matches && state.openId) return;
  event.preventDefault();
  state.effortMenuId = null;
  const row = handle.closest(".row");
  drag = { row, pointerId: event.pointerId, startY: event.clientY, compensation: 0 };
  row.classList.add("is-dragging");
  try {
    handle.setPointerCapture(event.pointerId);
  } catch (error) {
    /* The document listener still receives the move. */
  }
});

document.addEventListener("pointermove", (event) => {
  if (blockDrag && event.pointerId === blockDrag.pointerId) {
    const item = itemById(blockDrag.itemId);
    const block = item?.schedule?.blocks.find((entry) => entry.id === blockDrag.blockId);
    if (!block) return;
    const originStart = model.parseTime(blockDrag.origin.start);
    const originEnd = model.parseTime(blockDrag.origin.end);
    const duration = originEnd - originStart;
    if (blockDrag.mode === "move") {
      const column = columnAt(event.clientX) || document.querySelector(`.day-col[data-day="${CSS.escape(block.day)}"]`);
      if (!column) return;
      let start = model.DAY_START + Math.round((event.clientY - column.getBoundingClientRect().top - blockDrag.grabY) / blockDrag.slot) * 30;
      start = Math.max(model.DAY_START, Math.min(model.DAY_END - duration, start));
      block.day = column.dataset.day;
      block.start = model.formatTime(start);
      block.end = model.formatTime(start + duration);
    } else {
      const column = document.querySelector(`.day-col[data-day="${CSS.escape(block.day)}"]`);
      if (!column) return;
      let end = model.DAY_START + Math.round((event.clientY - column.getBoundingClientRect().top) / blockDrag.slot) * 30;
      end = Math.max(originStart + 30, Math.min(model.DAY_END, end));
      block.end = model.formatTime(end);
    }
    paintBlock(block);
    return;
  }
  onPointerMove(event);
});

document.addEventListener("pointerup", (event) => {
  if (blockDrag && event.pointerId === blockDrag.pointerId) {
    const item = itemById(blockDrag.itemId);
    const block = item?.schedule?.blocks.find((entry) => entry.id === blockDrag.blockId);
    const failed = block ? model.blockError(block) : "That activity could not be moved.";
    if (block && failed) Object.assign(block, blockDrag.origin);
    blockDrag = null;
    if (item) touch(item);
    save();
    render();
    if (failed && block) setStatus(failed, { error: true, sticky: true });
    return;
  }
  if (!drag || event.pointerId !== drag.pointerId) return;
  const before = rowTops();
  const movedId = drag.row.dataset.id;
  drag.row.classList.remove("is-dragging");
  drag.row.style.transform = "";
  drag = null;
  syncOrderFromDom();
  save();
  render();
  slideRows(before, movedId);
});

document.addEventListener("pointercancel", (event) => {
  if (blockDrag && event.pointerId === blockDrag.pointerId) {
    const item = itemById(blockDrag.itemId);
    const block = item?.schedule?.blocks.find((entry) => entry.id === blockDrag.blockId);
    if (block) Object.assign(block, blockDrag.origin);
    blockDrag = null;
    render();
    return;
  }
  if (!drag || event.pointerId !== drag.pointerId) return;
  drag.row.classList.remove("is-dragging");
  drag = null;
  render();
});

document.addEventListener("click", (event) => {
  try {
    if (event.target.closest("[data-undo]")) {
      undoDelete();
      return;
    }
    if (event.target.closest("[data-confirm-ok]")) {
      acceptConfirm();
      return;
    }
    if (event.target.closest("[data-confirm-cancel]")) {
      closeConfirm();
      return;
    }
    if (pendingConfirm) return;
    const insideEffort = event.target.closest(".effort");
    const insideMenu = event.target.closest(".overflow");
    const closedEffort = Boolean(state.effortMenuId && !insideEffort);
    const closedMenu = Boolean(state.menuOpen && !insideMenu);
    if (closedEffort) state.effortMenuId = null;
    if (closedMenu) state.menuOpen = false;
    const continues = event.target.closest("[data-open], [data-add-project], [data-close], [data-tab], [data-edit-toggle], [data-duplicate], [data-archive], [data-restore], [data-delete-project], [data-add-check], [data-remove-check], [data-add-journal], [data-add-update], [data-view], [data-stage], [data-choose-size]");
    if ((closedEffort || closedMenu) && !continues) {
      render();
      return;
    }
    if (event.target.closest("[data-download-raw]")) {
      downloadRaw();
      return;
    }
    if (event.target.closest("[data-retry-save]")) {
      retrySave();
      return;
    }
    if (event.target.closest("[data-start-fresh]")) {
      askFresh();
      return;
    }
    const view = event.target.closest("[data-view]");
    if (view) {
      state.view = view.dataset.view;
      if (state.view !== "projects") {
        state.openId = null;
        sheetRoot.innerHTML = "";
        document.body.classList.remove("sheet-open");
      }
      render();
      return;
    }
    if (event.target.closest("[data-rank-mode]")) {
      state.rankMode = !state.rankMode;
      if (state.rankMode) {
        state.categoryFilter = "";
        state.collapsedCategories.clear();
      }
      render({ focus: "[data-rank-mode]" });
      return;
    }
    const categoryToggle = event.target.closest("[data-toggle-category]");
    if (categoryToggle) {
      const id = categoryToggle.dataset.toggleCategory;
      if (state.collapsedCategories.has(id)) state.collapsedCategories.delete(id);
      else state.collapsedCategories.add(id);
      render({ focus: `[data-toggle-category="${CSS.escape(id)}"]` });
      return;
    }
    if (event.target.closest("[data-add-project]")) {
      addProject();
      return;
    }
    if (event.target.closest("[data-duplicate]")) {
      duplicateOpen();
      return;
    }
    if (event.target.closest("[data-archive]")) {
      archiveOpen();
      return;
    }
    const restore = event.target.closest("[data-restore]");
    if (restore) {
      restoreProject(restore.dataset.restore);
      return;
    }
    if (event.target.closest("[data-delete-project]")) {
      const removing = itemById(state.openId);
      state.menuOpen = false;
      openConfirm({
        title: "Remove this project?",
        body: `“${removing?.title || "New project"}” will leave this list. You can undo that from the save line.`,
        okLabel: "Remove project",
        danger: true,
        onOk() {
          deleteOpenProject();
        },
      });
      return;
    }
    const move = event.target.closest("[data-move]");
    if (move && !move.disabled) {
      moveItem(move.dataset.id, move.dataset.move === "up" ? -1 : 1);
      return;
    }
    const filter = event.target.closest("[data-filter]");
    if (filter) {
      state.checkFilter = filter.dataset.filter;
      render({ focus: `[data-filter="${state.checkFilter}"]` });
      return;
    }
    const checkMove = event.target.closest("[data-check-move]");
    if (checkMove && !checkMove.disabled) {
      moveCheck(checkMove.dataset.checkTarget, checkMove.dataset.checkMove === "up" ? -1 : 1);
      return;
    }
    const removeCheckButton = event.target.closest("[data-remove-check]");
    if (removeCheckButton) {
      removeCheck(removeCheckButton.dataset.removeCheck);
      return;
    }
    if (event.target.closest("[data-add-check]")) {
      addCheck();
      return;
    }
    if (event.target.closest("[data-add-update-line]")) {
      startUpdate();
      return;
    }
    if (event.target.closest("[data-save-update]")) {
      commitUpdate();
      return;
    }
    if (event.target.closest("[data-save-next]")) {
      saveNextItem();
      return;
    }
    if (event.target.closest("[data-edit-next]")) {
      state.editingNext = true;
      render({ focus: "[data-next-draft]" });
      return;
    }
    const removeUpdateButton = event.target.closest("[data-remove-update]");
    if (removeUpdateButton) {
      removeUpdate(removeUpdateButton.dataset.removeUpdate);
      return;
    }
    const removeSummary = event.target.closest("[data-remove-summary]");
    if (removeSummary) {
      removeLine("summary", removeSummary.dataset.removeSummary);
      return;
    }
    const removeNote = event.target.closest("[data-remove-note]");
    if (removeNote) {
      removeLine("notes", removeNote.dataset.removeNote);
      return;
    }
    if (event.target.closest("[data-add-journal]")) {
      addJournal();
      return;
    }
    const toggle = event.target.closest("[data-toggle-journal]");
    if (toggle) {
      toggleJournal(toggle.dataset.toggleJournal);
      return;
    }
    const editJournal = event.target.closest("[data-edit-journal]");
    if (editJournal) {
      state.editingJournalId = editJournal.dataset.editJournal;
      state.expandedJournal.add(state.editingJournalId);
      render({ focus: `[data-edit-journal-title="${CSS.escape(state.editingJournalId)}"]` });
      return;
    }
    if (event.target.closest("[data-cancel-journal]")) {
      state.editingJournalId = null;
      render();
      return;
    }
    const saveJournal = event.target.closest("[data-save-journal]");
    if (saveJournal) {
      saveJournalEdit(saveJournal.dataset.saveJournal);
      return;
    }
    const deleteJournalButton = event.target.closest("[data-delete-journal]");
    if (deleteJournalButton) {
      deleteJournal(deleteJournalButton.dataset.deleteJournal);
      return;
    }
    const fromJournal = event.target.closest("[data-check-from-journal]");
    if (fromJournal) {
      draftFromJournal(fromJournal.dataset.checkFromJournal);
      return;
    }
    if (event.target.closest("[data-save-draft]")) {
      saveDraft();
      return;
    }
    if (event.target.closest("[data-cancel-draft]")) {
      state.draft = null;
      render();
      return;
    }
    const show = event.target.closest("[data-show-journal]");
    if (show) {
      showJournal(show.dataset.showJournal);
      return;
    }
    if (event.target.closest("[data-add-material]")) {
      addMaterial();
      return;
    }
    const removeMaterialButton = event.target.closest("[data-remove-material]");
    if (removeMaterialButton) {
      removeMaterial(removeMaterialButton.dataset.removeMaterial);
      return;
    }
    if (event.target.closest("[data-link-related]")) {
      linkRelated();
      return;
    }
    const unlink = event.target.closest("[data-unlink]");
    if (unlink) {
      const item = itemById(state.openId);
      if (item) {
        item.relatedIds = item.relatedIds.filter((id) => id !== unlink.dataset.unlink);
        touch(item);
        save();
        render();
      }
      return;
    }
    if (event.target.closest("[data-add-deliverable]")) {
      const item = itemById(state.openId);
      if (item) {
        addDeliverable(item.id, {
          outcome: document.querySelector("[data-new-outcome]")?.value || "",
          horizon: document.querySelector("[data-new-horizon]")?.value || "",
          quarter: document.querySelector("[data-new-quarter]")?.value || "",
        });
      }
      return;
    }
    if (event.target.closest("[data-add-roadmap]")) {
      addDeliverable(document.querySelector("[data-roadmap-project]")?.value || "", {
        outcome: document.querySelector("[data-roadmap-text]")?.value || "",
        horizon: document.querySelector("[data-roadmap-horizon]")?.value || "",
        quarter: document.querySelector("[data-roadmap-quarter]")?.value || "",
      });
      return;
    }
    if (event.target.closest("[data-portfolio-review]")) {
      const item = itemById(state.openId);
      if (!item) return;
      const now = new Date().toISOString();
      const entry = { id: crypto.randomUUID(), createdAt: now, updatedAt: now, title: "Weekly portfolio review", body: model.PORTFOLIO_REVIEW_TEMPLATE };
      item.journal.unshift(entry);
      state.expandedJournal.add(entry.id);
      touch(item);
      save();
      render({ reveal: `[data-journal-id="${CSS.escape(entry.id)}"]` });
      return;
    }
    if (event.target.closest("[data-copy-launch]")) {
      const item = itemById(state.openId);
      const source = item?.tools.launches?.[0];
      if (!item || !source) return;
      item.tools.launches.push({
        id: crypto.randomUUID(),
        name: "New launch record",
        items: source.items.map((entry) => ({ ...structuredClone(entry), id: crypto.randomUUID(), owner: "", status: "not-assessed", evidence: "", issue: "", targetDate: "" })),
      });
      touch(item);
      save();
      render();
      return;
    }
    const addTool = event.target.closest("[data-add-tool]");
    if (addTool) {
      const item = itemById(state.openId);
      const rows = item ? toolRows(item, addTool.dataset.addTool, addTool.dataset.parent) : null;
      const blank = blankTool(addTool.dataset.addTool);
      if (rows && blank) {
        rows.push(blank);
        touch(item);
        save();
        render({ focus: `[data-tool-id="${CSS.escape(blank.id)}"]` });
      }
      return;
    }
    const removeTool = event.target.closest("[data-remove-tool]");
    if (removeTool) {
      const item = itemById(state.openId);
      const rows = item ? toolRows(item, removeTool.dataset.removeTool, removeTool.dataset.parent) : null;
      const index = rows?.findIndex((entry) => entry.id === removeTool.dataset.toolId) ?? -1;
      if (index >= 0) {
        rows.splice(index, 1);
        touch(item);
        save();
        render();
      }
      return;
    }
    const removeDeliverableButton = event.target.closest("[data-remove-deliverable]");
    if (removeDeliverableButton) {
      removeDeliverable(removeDeliverableButton.dataset.project, removeDeliverableButton.dataset.removeDeliverable);
      return;
    }
    if (event.target.closest("[data-add-budget]")) {
      addBudgetRow();
      return;
    }
    const removeBudget = event.target.closest("[data-remove-budget]");
    if (removeBudget) {
      removeBudgetRow(removeBudget.dataset.removeBudget);
      return;
    }
    const editBlock = event.target.closest("[data-edit-block]");
    if (editBlock) {
      const item = itemById(state.openId);
      const block = item?.schedule?.blocks.find((entry) => entry.id === editBlock.dataset.editBlock);
      if (block) {
        state.blockForm = { ...structuredClone(block), projectId: item.id };
        state.blockError = "";
        render({ focus: "[data-block-field='activity']" });
      }
      return;
    }
    if (event.target.closest("[data-cancel-block]")) {
      state.blockForm = null;
      state.blockError = "";
      render();
      return;
    }
    const deleteBlockButton = event.target.closest("[data-delete-block]");
    if (deleteBlockButton) {
      deleteBlock(deleteBlockButton.dataset.deleteBlock);
      return;
    }
    const tab = event.target.closest("[data-tab]");
    if (tab) {
      state.panelTab = tab.dataset.tab;
      state.menuOpen = false;
      render({ focus: `[data-tab="${CSS.escape(state.panelTab)}"]` });
      return;
    }
    if (event.target.closest("[data-edit-toggle]")) {
      state.editingFields = !state.editingFields;
      state.panelTab = "overview";
      state.menuOpen = false;
      render({ focus: state.editingFields ? "[data-field='title']" : "[data-edit-toggle]" });
      return;
    }
    if (event.target.closest("[data-menu-toggle]")) {
      state.menuOpen = !state.menuOpen;
      render({ focus: "[data-menu-toggle]" });
      return;
    }
    if (event.target.closest("[data-add-update]")) {
      state.updateComposerOpen = true;
      state.panelTab = "updates";
      render({ focus: "[data-journal-body]" });
      return;
    }
    if (event.target.closest("[data-cancel-update]")) {
      state.updateComposerOpen = false;
      render({ focus: "[data-add-update]" });
      return;
    }
    const effortToggle = event.target.closest("[data-effort-toggle]");
    if (effortToggle) {
      const id = effortToggle.dataset.effortToggle;
      state.effortMenuId = state.effortMenuId === id ? null : id;
      render({ focus: `[data-effort-toggle="${CSS.escape(id)}"]` });
      return;
    }
    const effortChoice = event.target.closest("[data-effort-choice]");
    if (effortChoice) {
      const sized = itemById(effortChoice.dataset.effortFor);
      if (!sized) return;
      const value = effortChoice.dataset.effortChoice;
      sized.size = model.SIZES.some((entry) => entry.id === value) ? value : "";
      state.effortMenuId = null;
      touch(sized);
      save();
      render({ focus: `[data-effort-toggle="${CSS.escape(sized.id)}"]` });
      return;
    }
    const chooseSize = event.target.closest("[data-choose-size]");
    if (chooseSize) {
      const sized = itemById(state.openId);
      if (!sized) return;
      sized.size = chooseSize.dataset.chooseSize;
      touch(sized);
      save();
      render({ focus: `[data-choose-size="${CSS.escape(sized.size)}"]` });
      return;
    }
    const stage = event.target.closest("[data-stage]");
    if (stage) {
      const item = itemById(state.openId);
      if (!item) return;
      item.stage = stage.dataset.stage;
      touch(item);
      save();
      render({ focus: `[data-stage="${CSS.escape(item.stage)}"]` });
      return;
    }
    if (event.target.closest("[data-save-card]")) {
      saveOpenCard();
      return;
    }
    if (event.target.closest("[data-close]")) {
      closeProject();
      return;
    }
    const opener = event.target.closest("[data-open]");
    if (opener) {
    if (opener.dataset.open === state.openId) {
      closeProject();
      return;
    }
      rememberOpener(opener);
      if (opener.closest(".roadmap")) state.view = "projects";
      openProject(opener.dataset.open);
    }
  } catch (error) {
    setStatus("Could not update the list.", { error: true, sticky: true });
  }
});

document.addEventListener("change", (event) => {
  const reviewBox = event.target.closest("[data-card-review]");
  if (reviewBox) {
    const item = itemById(reviewBox.dataset.cardReview);
    if (!item) return;
    item.review = Boolean(reviewBox.checked);
    touch(item);
    save();
    render({ focus: `[data-card-review="${CSS.escape(item.id)}"]` });
    return;
  }
  const item = state.openId ? itemById(state.openId) : null;
  try {
    const box = event.target.closest("[data-check-id]");
    if (box && item) {
      const entry = item.checklist.find((line) => line.id === box.dataset.checkId);
      if (!entry) return;
      entry.done = box.checked;
      touch(item);
      save();
      render({ focus: `[data-check-id="${CSS.escape(entry.id)}"]` });
      return;
    }
    const linkRec = event.target.closest("[data-link-rec]");
    if (linkRec) {
      const project = itemById(linkRec.dataset.project);
      const deliverable = project?.deliverables.find((entry) => entry.id === linkRec.dataset.deliverable);
      const recommendation = state.recommendations.find((entry) => entry.id === linkRec.dataset.linkRec);
      if (!project || !deliverable || !recommendation) return;
      if (linkRec.checked) {
        if (!deliverable.recommendationIds.includes(recommendation.id)) deliverable.recommendationIds.push(recommendation.id);
        recommendation.deliverableId = deliverable.id;
        if (!recommendation.projectId) recommendation.projectId = project.id;
      } else {
        deliverable.recommendationIds = deliverable.recommendationIds.filter((id) => id !== recommendation.id);
        if (recommendation.deliverableId === deliverable.id) recommendation.deliverableId = "";
      }
      touch(project);
      save();
      return;
    }
    if (event.target.dataset?.baseline != null) {
      state.settings.baselineDate = event.target.value;
      save();
      render({ focus: "[data-baseline]" });
      return;
    }
    if (event.target.dataset?.categoryFilter != null) {
      state.categoryFilter = event.target.value;
      if (state.categoryFilter) state.rankMode = false;
      render({ focus: "[data-category-filter]" });
      return;
    }
    if (event.target.dataset?.field === "category" && item) {
      item.category = event.target.value;
      touch(item);
      save();
      render({ focus: "[data-field='category']" });
      return;
    }
    if (event.target.dataset?.checkHorizon && item) {
      const entry = item.checklist.find((line) => line.id === event.target.dataset.checkHorizon);
      if (entry) entry.horizon = event.target.value;
      touch(item);
      save();
      return;
    }
    if (event.target.dataset?.deliverableField && event.target.dataset.deliverableId) {
      const project = itemById(event.target.dataset.project);
      const deliverable = project?.deliverables.find((entry) => entry.id === event.target.dataset.deliverableId);
      if (!project || !deliverable) return;
      const key = event.target.dataset.deliverableField;
      const value = event.target.value;
      if (key === "commitment" && value === "committed" && deliverable.commitment !== "committed") {
        const gaps = model.commitmentGaps(deliverable);
        if (gaps.length) {
          openConfirm({
            title: "Mark this deliverable Committed?",
            body: `Still missing: ${gaps.join(", ")}. You can mark it Committed anyway. That is not an approval.`,
            okLabel: "Mark Committed",
            onOk() {
              deliverable.commitment = "committed";
              touch(project);
              save();
              render();
            },
          });
          render();
          return;
        }
      }
      deliverable[key] = value;
      touch(project);
      save();
      if (key === "commitment" || key === "horizon" || key === "status" || key === "quarter") render({ focus: `[data-deliverable-id="${CSS.escape(deliverable.id)}"][data-deliverable-field="${key}"]` });
      return;
    }
    if (event.target.dataset?.recField === "projectId" || event.target.dataset?.recField === "deliverableId") {
      const recommendation = state.recommendations.find((entry) => entry.id === event.target.dataset.recId);
      if (!recommendation) return;
      recommendation[event.target.dataset.recField] = event.target.value;
      if (event.target.dataset.recField === "deliverableId" && recommendation.deliverableId) {
        const project = itemById(recommendation.projectId);
        const deliverable = project?.deliverables.find((entry) => entry.id === recommendation.deliverableId);
        if (deliverable && !deliverable.recommendationIds.includes(recommendation.id)) deliverable.recommendationIds.push(recommendation.id);
      }
      save();
      render({ focus: `[data-rec-id="${CSS.escape(recommendation.id)}"][data-rec-field="${event.target.dataset.recField}"]` });
      return;
    }
    if (event.target.dataset?.collection && (event.target.tagName === "SELECT" || event.target.type === "date")) {
      const project = itemById(state.openId);
      const row = project ? toolRows(project, event.target.dataset.collection, event.target.dataset.parent)?.find((entry) => entry.id === event.target.dataset.toolId) : null;
      if (!project || !row) return;
      row[event.target.dataset.toolField] = event.target.value;
      touch(project);
      save();
      if (event.target.tagName === "SELECT") {
        render({ focus: `[data-tool-id="${CSS.escape(row.id)}"][data-tool-field="${event.target.dataset.toolField}"]` });
      }
      return;
    }
    if (event.target.dataset?.collection && event.target.dataset.toolField && event.target.placeholder === "Unknown") {
      const project = itemById(state.openId);
      const row = project ? toolRows(project, event.target.dataset.collection, event.target.dataset.parent)?.find((entry) => entry.id === event.target.dataset.toolId) : null;
      if (!project || !row) return;
      const parsed = parseQuantity(event.target.value);
      if (!parsed.ok) {
        setStatus("Enter a number, or leave the field blank when it is unknown.", { error: true, sticky: true });
        event.target.value = row[event.target.dataset.toolField] == null ? "" : String(row[event.target.dataset.toolField]);
        return;
      }
      row[event.target.dataset.toolField] = parsed.value;
      touch(project);
      save();
      render({ focus: `[data-tool-id="${CSS.escape(row.id)}"][data-tool-field="${event.target.dataset.toolField}"]` });
      return;
    }
    if (!item) return;
    if (event.target.dataset.checkType) {
      const entry = item.checklist.find((line) => line.id === event.target.dataset.checkType);
      if (entry) entry.type = event.target.value;
      touch(item);
      save();
      return;
    }
    if (event.target.dataset.checkDue) {
      const entry = item.checklist.find((line) => line.id === event.target.dataset.checkDue);
      if (entry) entry.due = event.target.value;
      touch(item);
      save();
      return;
    }
    if (event.target.dataset.checkStream) {
      const entry = item.checklist.find((line) => line.id === event.target.dataset.checkStream);
      if (entry) entry.workstream = event.target.value;
      touch(item);
      save();
      render({ focus: `[data-check-stream="${CSS.escape(event.target.dataset.checkStream)}"]` });
      return;
    }
    if (event.target.dataset.checkAnswer && event.target.type === "date") {
      const entry = item.checklist.find((line) => line.id === event.target.dataset.checkAnswer);
      if (entry) entry.answer = event.target.value;
      touch(item);
      save();
      return;
    }
    if (event.target.dataset.field === "targetDate") {
      item.targetDate = event.target.value;
      touch(item);
      save();
      return;
    }
    if (event.target.dataset.budgetField === "frequency" || event.target.dataset.budgetField === "renewal") {
      const row = item.budget?.find((entry) => entry.id === event.target.dataset.budgetId);
      if (!row) return;
      row[event.target.dataset.budgetField] = event.target.value;
      touch(item);
      save();
      render({ focus: `[data-budget-id="${CSS.escape(row.id)}"][data-budget-field="${event.target.dataset.budgetField}"]` });
      return;
    }
    if (event.target.dataset.budgetField === "currentCost" || event.target.dataset.budgetField === "proposedCost") {
      const row = item.budget?.find((entry) => entry.id === event.target.dataset.budgetId);
      if (!row) return;
      const parsed = parseMoney(event.target.value);
      if (!parsed.ok) {
        event.target.value = moneyField(row[event.target.dataset.budgetField]);
        setStatus("Enter a dollar amount, or leave the cost blank when it is unknown.", { error: true, sticky: true });
        return;
      }
      row[event.target.dataset.budgetField] = parsed.value;
      touch(item);
      save();
      render({ focus: `[data-budget-id="${CSS.escape(row.id)}"][data-budget-field="${event.target.dataset.budgetField}"]` });
    }
  } catch (error) {
    setStatus("Could not update the list.", { error: true, sticky: true });
  }
});

document.addEventListener("input", (event) => {
  if (event.target.dataset?.dueMonth != null || event.target.dataset?.dueDay != null) {
    const field = event.target;
    const digits = field.value.replace(/\D/g, "").slice(0, 2);
    const advance = field.dataset.dueMonth != null && digits.length === 2 && field.value.replace(/\D/g, "").length >= 2;
    if (field.value !== digits) field.value = digits;
    commitDue(field);
    if (advance) field.closest(".delivery")?.querySelector("[data-due-day]")?.focus();
    return;
  }
  if (event.target.dataset?.updateDate != null) {
    state.updateDate = event.target.value;
    return;
  }
  if (event.target.dataset?.updateDraft != null) {
    state.updateDraft = event.target.value.slice(0, 500);
    return;
  }
  if (event.target.dataset?.summaryIndex != null || event.target.dataset?.noteIndex != null) {
    const item = itemById(state.openId);
    const root = event.target.closest(".workspace");
    if (!item || !root) return;
    const kind = event.target.dataset.summaryIndex != null ? "summary" : "notes";
    const attr = lineAttr(kind);
    writeLines(item, kind, [...root.querySelectorAll(`[data-${attr}-index]`)].map((field) => field.value));
    ensureTrailingLine(root, kind);
    save();
    return;
  }
  if (event.target.dataset?.journalWhen != null || event.target.dataset?.journalTitle != null || event.target.dataset?.journalBody != null) {
    applyText(itemById(state.openId) || { brief: {} }, event.target);
    return;
  }
  const item = state.openId ? itemById(state.openId) : null;
  if (pendingConfirm) return;
  if (!item && !event.target.dataset?.recId) return;
  try {
    if (applyText(item || { brief: {} }, event.target)) {
      save();
      if (event.target.matches?.("textarea.bullet-note, textarea.history-note")) fitOpenWriting();
    }
  } catch (error) {
    setStatus("Could not update the list.", { error: true, sticky: true });
  }
});

document.addEventListener("focusout", (event) => {
  if (event.target.dataset?.dueMonth == null && event.target.dataset?.dueDay == null) return;
  const field = event.target;
  if (/^\d$/.test(field.value)) field.value = `0${field.value}`;
  commitDue(field);
});

document.addEventListener("submit", (event) => {
  if (event.target.closest(".block-form")) saveBlockForm(event);
});

let grabDrag = null;

document.addEventListener("pointerdown", (event) => {
  const grab = event.target.closest(".grab");
  if (!grab || pendingConfirm) return;
  grabDrag = { pointerId: event.pointerId, startY: event.clientY };
  try {
    grab.setPointerCapture(event.pointerId);
  } catch (error) {
    /* Release still closes from the document listener. */
  }
});

document.addEventListener("pointermove", (event) => {
  if (!grabDrag || event.pointerId !== grabDrag.pointerId) return;
  const sheet = sheetRoot.querySelector(".sheet");
  if (!sheet) return;
  const dy = Math.max(0, event.clientY - grabDrag.startY);
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  sheet.style.transform = `translate(-50%, ${dy}px)`;
});

document.addEventListener("pointerup", (event) => {
  if (!grabDrag || event.pointerId !== grabDrag.pointerId) return;
  const sheet = sheetRoot.querySelector(".sheet");
  const dy = Math.max(0, event.clientY - grabDrag.startY);
  grabDrag = null;
  if (!sheet) return;
  sheet.style.transform = "";
  if (dy > 90) closeProject();
});

function finishRename() {
  if (!state.renamingId) return;
  state.renamingId = null;
  state.renamePlace = "";
  state.renameOriginal = "";
  render();
}

function cancelRename() {
  const item = itemById(state.renamingId);
  if (item) item.title = state.renameOriginal;
  state.renamingId = null;
  state.renamePlace = "";
  state.renameOriginal = "";
  if (item) {
    save();
    syncCard(item);
  }
  render();
}

document.addEventListener("dblclick", (event) => {
  const name = event.target.closest("[data-rename]");
  if (!name || pendingConfirm) return;
  const item = itemById(name.dataset.rename);
  if (!item) return;
  event.preventDefault();
  state.renameOriginal = item.title;
  state.renamingId = item.id;
  state.renamePlace = name.closest(".workspace, .sheet") ? "inside" : "face";
  if (state.openId !== item.id) state.openId = item.id;
  focusPanel = false;
  render({ focus: ".title-rename" });
});

document.addEventListener("focusout", (event) => {
  if (!event.target.classList?.contains("title-rename")) return;
  const id = state.renamingId;
  setTimeout(() => {
    if (state.renamingId !== id) return;
    if (document.activeElement?.classList.contains("title-rename")) return;
    finishRename();
  }, 0);
});

document.addEventListener("keydown", (event) => {
  if (event.target.classList?.contains("title-rename")) {
    if (event.key === "Enter") {
      event.preventDefault();
      finishRename();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      cancelRename();
      return;
    }
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
    if (state.openId) {
      event.preventDefault();
      saveOpenCard();
    }
    return;
  }
  if (event.key === "Enter" && event.target.dataset?.nextDraft != null) {
    event.preventDefault();
    saveNextItem();
    return;
  }
  if (event.target.dataset?.updateDraft != null && (event.key === "Enter" || event.key === "Escape")) {
    event.preventDefault();
    if (event.key === "Escape") {
      state.addingUpdate = false;
      state.updateDraft = "";
      render({ focus: "[data-add-update-line]" });
      return;
    }
    commitUpdate();
    return;
  }
  if (event.key === "Enter" && event.target.dataset?.checkText) {
    event.preventDefault();
    addCheck();
    return;
  }
  if ((event.target.dataset?.summaryIndex != null || event.target.dataset?.noteIndex != null) && (event.key === "Enter" || (event.key === "Backspace" && event.target.value === ""))) {
    event.preventDefault();
    const kind = event.target.dataset.summaryIndex != null ? "summary" : "notes";
    const attr = lineAttr(kind);
    if (event.key === "Enter") addLine(kind, Number(event.target.dataset.summaryIndex ?? event.target.dataset.noteIndex));
    else if (document.querySelectorAll(`[data-${attr}-index]`).length > 1) removeLine(kind, event.target.dataset.summaryIndex ?? event.target.dataset.noteIndex);
    return;
  }
  if ((event.target.dataset?.dueMonth != null || event.target.dataset?.dueDay != null) && event.key === "Enter") {
    event.preventDefault();
    if (event.target.dataset.dueMonth != null) event.target.closest(".delivery")?.querySelector("[data-due-day]")?.focus();
    else event.target.blur();
    return;
  }
  if (event.key === "Enter" && !event.shiftKey && event.target.dataset?.field === "summary") {
    event.preventDefault();
    const field = event.target;
    const start = field.selectionStart;
    const end = field.selectionEnd;
    field.value = `${field.value.slice(0, start)}\n• ${field.value.slice(end)}`;
    field.selectionStart = field.selectionEnd = start + 3;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }
  if (event.key === "Enter" && !event.shiftKey && event.target.dataset?.journalBody != null) {
    event.preventDefault();
    const field = event.target;
    const start = field.selectionStart;
    const end = field.selectionEnd;
    const next = `${field.value.slice(0, start)}\n• ${field.value.slice(end)}`;
    field.value = next;
    const caret = start + 3;
    field.selectionStart = field.selectionEnd = caret;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }
  if (event.key === "Enter" && event.target.dataset && event.target.dataset.field === "title") event.preventDefault();
  if (pendingConfirm) {
    trapTab(event, confirmRoot.querySelector(".confirm"));
    if (event.key === "Escape") closeConfirm();
    return;
  }
  if (!state.openId) return;
  const sheet = sheetRoot.querySelector(".sheet");
  if (sheet && !desktopQuery.matches) trapTab(event, sheet);
  if (event.key === "Escape") {
    if (state.effortMenuId || state.menuOpen) {
      state.effortMenuId = null;
      state.menuOpen = false;
      render();
      return;
    }
    closeProject();
  }
});

desktopQuery.addEventListener("change", () => {
  if (state.openId) render();
});

load();
render();
