const model = window.PocketModel;

const state = {
  items: [],
  openId: null,
  editing: false,
  scrollTask: null,
  storageMode: "ok",
  rawBackup: "",
};

let saveToken = 0;
let drag = null;
let closing = false;
let undo = null;
let returnFocus = null;
let focusSheet = false;
let pendingConfirm = null;
let confirmReturn = null;

const app = document.querySelector("#app");
const sheetRoot = document.querySelector("#sheet-root");
const confirmRoot = document.querySelector("#confirm-root");
const statusEl = document.querySelector("#status");
const recoveryEl = document.querySelector("#recovery");

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

function phaseOf(status) {
  return model.PHASES.find((phase) => phase.id === status) || model.PHASES[0];
}

function metaLine(item) {
  const owner = item.owner.trim();
  const next = item.nextAction.trim();
  if (owner && next) return `${owner} · ${next}`;
  return owner || next;
}

function setStatus(message, options = {}) {
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
    text.textContent =
      "The saved list could not be read. It is still in this browser and has not been replaced.";
    actions.append(actionButton("Download unreadable backup", "download-raw"));
    actions.append(actionButton("Start a fresh list", "start-fresh"));
  } else {
    text.textContent =
      "This browser can't store the list. You can keep working here, then export a backup before you leave.";
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

function writeStored(items) {
  localStorage.setItem(model.STORAGE_KEY, JSON.stringify(items));
  localStorage.setItem(model.STARTER_KEY, model.STARTER_VERSION);
}

function readStored() {
  try {
    const raw = localStorage.getItem(model.STORAGE_KEY);
    const version = localStorage.getItem(model.STARTER_KEY);
    if (raw == null) {
      const items = model.migrate([], version);
      writeStored(items);
      return { mode: "ok", items, raw: "" };
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return { mode: "corrupt", items: [], raw };
    }
    if (!Array.isArray(parsed)) return { mode: "corrupt", items: [], raw };
    const items = model.migrate(parsed, version);
    if (version !== model.STARTER_VERSION) {
      try {
        writeStored(items);
      } catch (error) {
        return { mode: "unavailable", items, raw: "" };
      }
    }
    return { mode: "ok", items, raw: "" };
  } catch (error) {
    return { mode: "unavailable", items: [], raw: "" };
  }
}

function commit() {
  const token = ++saveToken;
  if (!undo) setStatus("Saving…");
  try {
    writeStored(state.items);
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
    if (token !== saveToken || undo) return;
    setStatus("Saved on this browser");
  }, 160);
}

function save() {
  undo = null;
  commit();
}

function load() {
  const stored = readStored();
  state.items = stored.items;
  state.storageMode = stored.mode;
  state.rawBackup = stored.raw;
  showRecovery();
  if (stored.mode === "ok") setStatus("Saved on this browser");
  else if (stored.mode === "corrupt") setStatus("The saved list could not be read.", { error: true });
  else setStatus("This browser can't store the list.", { error: true });
}

function meterHtml(item) {
  const progress = model.progressOf(item);
  return `
    <span class="meter">
      <span class="size">${escapeHtml(phaseOf(item.status).short)}</span>
      <span class="track" aria-hidden="true"><span class="fill" style="width:${progress.percent}%"></span></span>
      <span class="count">
        <span class="frac">${progress.fraction}</span>
        <span class="pct">${progress.percentLabel}</span>
      </span>
      <span class="check-label">${escapeHtml(progress.label)}</span>
    </span>
  `;
}

function renderNext() {
  const lines = model.nextThree(state.items);
  const body = lines.length
    ? lines
        .map((line, index) => {
          const tag = line.blocked ? `<span class="blocked-tag">Blocked</span>` : "";
          const detail = line.nextAction || "No next action";
          return `
            <button
              type="button"
              class="next-line"
              data-open="${escapeHtml(line.id)}"
              style="--accent:${escapeHtml(line.color)}"
            >
              <span class="n">${index + 1}</span>
              <span>
                <strong>${escapeHtml(line.title)}</strong>
                <em>${tag}<span class="next-detail">${escapeHtml(detail)}</span></em>
              </span>
            </button>
          `;
        })
        .join("")
    : `<p class="next-empty">No open initiatives.</p>`;
  return `<section class="next" aria-label="Next 3"><h2>Next 3</h2>${body}</section>`;
}

function renderList() {
  const rows = state.items
    .map((item, index) => {
      const title = item.title || "New task";
      const placeholder = item.title ? "" : " is-placeholder";
      const meta = metaLine(item);
      const rowClass = [
        "row",
        item.status === "completed" ? "is-completed" : "",
        item.status === "blocked" ? "is-blocked" : "",
      ]
        .filter(Boolean)
        .join(" ");
      return `
        <article class="${rowClass}" data-id="${escapeHtml(item.id)}" style="--accent:${escapeHtml(item.color)}">
          <button type="button" class="handle" aria-label="Drag to reorder ${escapeHtml(title)}">
            <span class="grip" aria-hidden="true"></span>
          </button>
          <span class="rank">${index + 1}</span>
          <button type="button" class="open" data-open="${escapeHtml(item.id)}">
            <span class="title-line">
              <span class="title${placeholder}">${escapeHtml(title)}</span>
              <span class="chevron" aria-hidden="true"></span>
            </span>
            <span class="meta"${meta ? "" : " hidden"}>${escapeHtml(meta)}</span>
            ${meterHtml(item)}
          </button>
          <span class="nudges">
            <button type="button" class="nudge" data-move="up" data-id="${escapeHtml(item.id)}" aria-label="Move ${escapeHtml(title)} up" ${index === 0 ? "disabled" : ""}>
              <span class="arrow arrow-up" aria-hidden="true"></span>
            </button>
            <button type="button" class="nudge" data-move="down" data-id="${escapeHtml(item.id)}" aria-label="Move ${escapeHtml(title)} down" ${index === state.items.length - 1 ? "disabled" : ""}>
              <span class="arrow arrow-down" aria-hidden="true"></span>
            </button>
          </span>
        </article>
      `;
    })
    .join("");
  return `<div id="list">${rows}</div><button type="button" class="add-task" data-add-task>Add a task</button>`;
}

function renderBoard() {
  app.innerHTML = renderNext() + renderList();
}

function answerField(task, index) {
  const kind = model.reviewKind(task.text);
  if (!kind) return "";
  if (kind === "date") {
    return `<input class="field answer" type="date" value="${escapeHtml(task.answer)}" data-task-answer="${index}" aria-label="Target delivery date" />`;
  }
  return `<input class="field answer" type="text" maxlength="160" value="${escapeHtml(task.answer)}" data-task-answer="${index}" aria-label="Answer for ${escapeHtml(task.text)}" placeholder="Short answer" />`;
}

function taskHtml(task, index, editing) {
  const doneClass = task.done ? " is-done" : "";
  const answer = answerField(task, index);
  if (!editing) {
    return `
      <div class="task${doneClass}" data-task="${index}">
        <label class="check">
          <input type="checkbox" ${task.done ? "checked" : ""} data-check="${index}" />
          <span class="task-text">${escapeHtml(task.text)}</span>
        </label>
        ${answer}
      </div>
    `;
  }
  return `
    <div class="task${doneClass}" data-task="${index}">
      <input type="checkbox" ${task.done ? "checked" : ""} data-check="${index}" aria-label="Done: ${escapeHtml(task.text || "Requirement")}" />
      <div class="task-main">
        <input class="field task-input" type="text" value="${escapeHtml(task.text)}" data-task-text="${index}" aria-label="Requirement ${index + 1}" />
        ${answer}
      </div>
      <button type="button" class="remove" data-remove="${index}">Remove</button>
    </div>
  `;
}

function renderSheet() {
  const item = state.openId ? itemById(state.openId) : null;
  if (!item) {
    sheetRoot.innerHTML = "";
    document.body.classList.remove("sheet-open");
    return;
  }
  const rank = state.items.findIndex((entry) => entry.id === item.id) + 1;
  const previousBody = sheetRoot.querySelector(".sheet-body");
  const keepScroll = previousBody ? previousBody.scrollTop : 0;
  const alreadyOpen = Boolean(sheetRoot.querySelector(".sheet.is-in"));
  const progress = model.progressOf(item);
  const phases = model.PHASES.map(
    (phase) => `
      <button type="button" data-status="${phase.id}" aria-pressed="${item.status === phase.id}">
        ${phase.label}
      </button>
    `,
  ).join("");
  const note = state.editing
    ? `<input class="field note-input" type="text" value="${escapeHtml(item.statusNote)}" data-field="statusNote" aria-label="Status note" />`
    : `<p class="note">${escapeHtml(item.statusNote)}</p>`;
  const heading = state.editing
    ? `<textarea id="sheet-title" class="field title-input" rows="3" data-field="title" aria-label="Title" placeholder="New task">${escapeHtml(item.title)}</textarea>
       <input class="field desc-input" type="text" value="${escapeHtml(item.description)}" data-field="description" aria-label="Description" />`
    : `<h2 id="sheet-title">${escapeHtml(item.title || "New task")}</h2><p class="desc">${escapeHtml(item.description)}</p>`;
  const tasks = item.tasks.map((task, index) => taskHtml(task, index, state.editing)).join("");
  const add = state.editing ? `<button type="button" class="add-line" data-add>Add a requirement</button>` : "";
  const emptyRequirements = item.tasks.length
    ? ""
    : `<p class="next-empty">No requirements yet. Checklist complete stays at 0% until a line is checked.</p>`;
  const removeTask = state.editing
    ? `<button type="button" class="remove-task" data-delete-task>Remove task</button>`
    : "";

  sheetRoot.innerHTML = `
    <div class="backdrop${alreadyOpen ? " is-in" : ""}" data-close></div>
    <div
      class="sheet${alreadyOpen ? " is-in" : ""}"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sheet-title"
      tabindex="-1"
      style="--accent:${escapeHtml(item.color)}"
    >
      <div class="sheet-bar">
        <button type="button" class="grab" aria-label="Drag down to close"></button>
        <button type="button" class="close" data-close>Close</button>
      </div>
      <div class="sheet-body">
        <div class="identity">
          <span class="rank">${rank}</span>
          <div>${heading}</div>
        </div>
        <div class="phase-row">
          <div class="segments" role="group" aria-label="Phase">${phases}</div>
          ${note}
        </div>
        <div class="facts">
          <label class="fact">Owner
            <input class="field" type="text" maxlength="120" value="${escapeHtml(item.owner)}" data-field="owner" />
          </label>
          <label class="fact">Next action
            <input class="field" type="text" maxlength="160" value="${escapeHtml(item.nextAction)}" data-field="nextAction" />
          </label>
          <label class="fact">Target date
            <input class="field" type="date" value="${escapeHtml(item.targetDate)}" data-field="targetDate" />
          </label>
        </div>
        <div class="key-head">
          <h3>Requirements</h3>
          <button type="button" class="text-btn" data-edit>${state.editing ? "Done" : "Edit"}</button>
        </div>
        <p class="check-line">${escapeHtml(progress.label)} · ${escapeHtml(progress.fraction)} · ${escapeHtml(progress.percentLabel)}</p>
        ${item.tasks.length ? `<div class="tasks">${tasks}</div>` : emptyRequirements}
        ${add}
        ${removeTask}
      </div>
    </div>
  `;
  document.body.classList.add("sheet-open");
  const sheet = sheetRoot.querySelector(".sheet");
  const body = sheetRoot.querySelector(".sheet-body");
  if (alreadyOpen) {
    body.scrollTop = keepScroll;
    return;
  }
  requestAnimationFrame(() => {
    sheet.classList.add("is-in");
    sheetRoot.querySelector(".backdrop").classList.add("is-in");
    if (focusSheet) {
      focusSheet = false;
      sheet.focus({ preventScroll: true });
    }
    if (state.scrollTask == null) return;
    const line = body.querySelector(`[data-task="${state.scrollTask}"]`);
    state.scrollTask = null;
    if (!line) return;
    const bodyRect = body.getBoundingClientRect();
    const lineRect = line.getBoundingClientRect();
    body.scrollTop += lineRect.top - bodyRect.top - body.clientHeight / 2 + lineRect.height / 2;
  });
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
        <button type="button" class="confirm-ok" data-confirm-ok>${escapeHtml(pendingConfirm.okLabel)}</button>
      </div>
    </div>
  `;
  confirmRoot.querySelector("[data-confirm-cancel].confirm-cancel").focus();
}

function render() {
  const active = document.activeElement;
  const activeTask = active && active.dataset ? active.dataset.taskText : undefined;
  const activeAnswer = active && active.dataset ? active.dataset.taskAnswer : undefined;
  const activeField = active && active.dataset ? active.dataset.field : undefined;
  const activeStatus = active && active.dataset ? active.dataset.status : undefined;
  renderBoard();
  renderSheet();
  if (activeTask != null) sheetRoot.querySelector(`[data-task-text="${activeTask}"]`)?.focus();
  else if (activeAnswer != null) sheetRoot.querySelector(`[data-task-answer="${activeAnswer}"]`)?.focus();
  else if (activeField) sheetRoot.querySelector(`[data-field="${CSS.escape(activeField)}"]`)?.focus();
  else if (activeStatus) sheetRoot.querySelector(`[data-status="${CSS.escape(activeStatus)}"]`)?.focus();
}

function rememberOpener(node) {
  const next = node.closest(".next-line");
  const row = node.closest(".row");
  if (next) returnFocus = { source: "next", id: next.dataset.open };
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
  document.querySelector("[data-add-task]")?.focus();
}

function openSheet(id, taskIndex) {
  closing = false;
  focusSheet = true;
  state.openId = id;
  state.editing = false;
  state.scrollTask = taskIndex == null ? null : taskIndex;
  render();
}

function closeSheet() {
  const sheet = sheetRoot.querySelector(".sheet");
  const backdrop = sheetRoot.querySelector(".backdrop");
  if (!sheet || closing) {
    state.openId = null;
    state.editing = false;
    renderSheet();
    restoreFocus();
    return;
  }
  closing = true;
  sheet.style.transform = "";
  sheet.classList.remove("is-in");
  backdrop.classList.remove("is-in");
  const finish = () => {
    if (!closing) return;
    closing = false;
    state.openId = null;
    state.editing = false;
    renderSheet();
    restoreFocus();
  };
  sheet.addEventListener("transitionend", finish, { once: true });
  window.setTimeout(finish, 320);
}

function blankItem() {
  return model.normalizeItem({
    id: crypto.randomUUID(),
    title: "",
    description: "",
    color: model.COLORS[state.items.length % model.COLORS.length],
    status: "evaluate",
    tasks: model.REVIEW.map((text) => ({ text, done: false, answer: "" })),
  });
}

function addTask() {
  const item = blankItem();
  state.items.push(item);
  closing = false;
  focusSheet = false;
  returnFocus = { source: "add" };
  state.openId = item.id;
  state.editing = true;
  state.scrollTask = null;
  save();
  render();
  sheetRoot.querySelector("[data-field='title']")?.focus();
}

function deleteOpenTask() {
  const index = state.items.findIndex((item) => item.id === state.openId);
  if (index < 0) return;
  const item = state.items[index];
  undo = { kind: "item", index, item: structuredClone(item) };
  state.items.splice(index, 1);
  state.openId = null;
  state.editing = false;
  returnFocus = { source: "add" };
  commit();
  render();
  setStatus(`Removed “${item.title || "New task"}”.`, { undo: true });
  document.querySelector("[data-add-task]")?.focus();
}

function removeRequirement(index) {
  const item = itemById(state.openId);
  if (!item || !item.tasks[index]) return;
  undo = {
    kind: "requirement",
    itemId: item.id,
    index,
    task: structuredClone(item.tasks[index]),
  };
  item.tasks.splice(index, 1);
  commit();
  render();
  setStatus("Removed a requirement.", { undo: true });
}

function undoDelete() {
  if (!undo) return;
  const record = undo;
  undo = null;
  if (record.kind === "item") {
    state.items.splice(Math.min(record.index, state.items.length), 0, record.item);
    save();
    render();
    setStatus("Restored.");
    document.querySelector(`.row[data-id="${CSS.escape(record.item.id)}"] .open`)?.focus();
    return;
  }
  const item = itemById(record.itemId);
  if (!item) {
    setStatus("Could not undo that removal.");
    return;
  }
  item.tasks.splice(Math.min(record.index, item.tasks.length), 0, record.task);
  if (state.openId !== item.id) {
    state.openId = item.id;
    state.editing = true;
  }
  save();
  render();
  setStatus("Restored.");
}

function syncRow(item) {
  const row = document.querySelector(`.row[data-id="${CSS.escape(item.id)}"]`);
  if (!row) return;
  const title = row.querySelector(".title");
  const label = item.title || "New task";
  if (title) {
    title.textContent = label;
    title.classList.toggle("is-placeholder", !item.title);
  }
  const meta = row.querySelector(".meta");
  if (meta) {
    const text = metaLine(item);
    meta.textContent = text;
    meta.hidden = !text;
  }
  const meter = row.querySelector(".meter");
  if (meter) meter.outerHTML = meterHtml(item);
  row.classList.toggle("is-completed", item.status === "completed");
  row.classList.toggle("is-blocked", item.status === "blocked");
  row.querySelector(".handle")?.setAttribute("aria-label", `Drag to reorder ${label}`);
  row.querySelector('[data-move="up"]')?.setAttribute("aria-label", `Move ${label} up`);
  row.querySelector('[data-move="down"]')?.setAttribute("aria-label", `Move ${label} down`);
  const next = app.querySelector(".next");
  if (next) next.outerHTML = renderNext();
}

function rowTops() {
  return new Map(
    [...document.querySelectorAll("#list .row")].map((row) => [row.dataset.id, row.getBoundingClientRect().top]),
  );
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
  const moved = movedId
    ? document.querySelector(`#list .row[data-id="${CSS.escape(movedId)}"]`)
    : null;
  if (moved) moved.classList.add("is-settling");
  releaseRows(moving);
  if (!moved) return;
  window.setTimeout(() => moved.classList.remove("is-settling"), 380);
}

function moveItem(id, direction) {
  const index = state.items.findIndex((item) => item.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= state.items.length) return;
  const before = rowTops();
  const [item] = state.items.splice(index, 1);
  state.items.splice(target, 0, item);
  save();
  render();
  slideRows(before, id);
  const move = direction < 0 ? "up" : "down";
  const pressed = document.querySelector(`.nudge[data-id="${CSS.escape(id)}"][data-move="${move}"]`);
  if (pressed && !pressed.disabled) pressed.focus();
  else document.querySelector(`.row[data-id="${CSS.escape(id)}"] .nudge:not(:disabled)`)?.focus();
}

function syncOrderFromDom() {
  const order = [...document.querySelectorAll("#list .row")].map((row) => row.dataset.id);
  const byId = new Map(state.items.map((item) => [item.id, item]));
  state.items = order.map((id) => byId.get(id)).filter(Boolean);
}

function placeDrag(event) {
  drag.row.style.transform = `translateY(${event.clientY - drag.startY - drag.compensation}px)`;
}

function onPointerMove(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const list = document.querySelector("#list");
  placeDrag(event);
  const tops = new Map(
    [...list.querySelectorAll(".row")].map((row) => [row, row.getBoundingClientRect().top]),
  );
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
    row.querySelector(".rank").textContent = String(index + 1);
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

function exportList() {
  const blob = new Blob([JSON.stringify(model.exportDocument(state.items), null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "pocket-work-tracker.json";
  link.click();
  URL.revokeObjectURL(url);
  if (!undo) setStatus("Exported a backup of this list.");
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

function countLabel(count, suffix) {
  return `${count} ${count === 1 ? "initiative" : "initiatives"}${suffix}`;
}

function askImport(items) {
  const incoming = countLabel(items.length, "");
  const current =
    state.storageMode === "corrupt"
      ? "the unreadable save in this browser"
      : countLabel(state.items.length, " saved on this browser");
  openConfirm({
    title: "Replace this list?",
    body: `This will overwrite ${current} with ${incoming} from the file.`,
    okLabel: "Replace",
    onOk() {
      undo = null;
      state.items = items;
      state.openId = null;
      state.editing = false;
      commit();
      render();
      setStatus("Saved on this browser");
      document.querySelector("[data-add-task]")?.focus();
    },
  });
}

function askFresh() {
  openConfirm({
    title: "Start a fresh list?",
    body: "This replaces the unreadable save with the starter list. Download the backup first if you still need that file.",
    okLabel: "Start fresh",
    onOk() {
      undo = null;
      state.items = model.starterItems();
      state.openId = null;
      state.editing = false;
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

document.addEventListener("pointerdown", (event) => {
  const handle = event.target.closest(".handle");
  if (!handle || state.openId || pendingConfirm) return;
  event.preventDefault();
  const row = handle.closest(".row");
  drag = { row, pointerId: event.pointerId, startY: event.clientY, compensation: 0 };
  row.classList.add("is-dragging");
  try {
    handle.setPointerCapture(event.pointerId);
  } catch (error) {
    /* The document listener still receives the move. */
  }
});

document.addEventListener("pointermove", onPointerMove);

document.addEventListener("pointerup", (event) => {
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
    if (event.target.closest("[data-export]")) {
      exportList();
      return;
    }
    if (event.target.closest("[data-import]")) {
      document.querySelector("#import-file").click();
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
    if (event.target.closest("[data-add-task]")) {
      addTask();
      return;
    }
    if (event.target.closest("[data-delete-task]")) {
      deleteOpenTask();
      return;
    }
    const move = event.target.closest("[data-move]");
    if (move && !move.disabled) {
      moveItem(move.dataset.id, move.dataset.move === "up" ? -1 : 1);
      return;
    }
    const opener = event.target.closest("[data-open]");
    if (opener && !event.target.closest(".sheet")) {
      rememberOpener(opener);
      const task = opener.dataset.task;
      openSheet(opener.dataset.open, task == null ? null : Number(task));
      return;
    }
    if (event.target.closest("[data-close]")) {
      closeSheet();
      return;
    }
    if (event.target.closest("[data-edit]")) {
      state.editing = !state.editing;
      focusSheet = false;
      render();
      if (state.editing) sheetRoot.querySelector("[data-field='title']")?.focus();
      else sheetRoot.querySelector("[data-edit]")?.focus();
      return;
    }
    const remove = event.target.closest("[data-remove]");
    if (remove) {
      removeRequirement(Number(remove.dataset.remove));
      return;
    }
    if (event.target.closest("[data-add]")) {
      const item = itemById(state.openId);
      item.tasks.push({ text: "", done: false, answer: "" });
      save();
      render();
      const inputs = sheetRoot.querySelectorAll("[data-task-text]");
      inputs[inputs.length - 1]?.focus();
      return;
    }
    const phase = event.target.closest("[data-status]");
    if (phase) {
      itemById(state.openId).status = phase.dataset.status;
      save();
      render();
    }
  } catch (error) {
    setStatus("Could not update the list.", { error: true });
  }
});

document.addEventListener("change", (event) => {
  const box = event.target.closest("[data-check]");
  const dateAnswer = event.target.dataset.taskAnswer != null && event.target.type === "date";
  const dateField = event.target.dataset.field === "targetDate";
  if (!box && !dateAnswer && !dateField) return;
  try {
    const item = itemById(state.openId);
    if (!item) return;
    if (box) {
      const index = Number(box.dataset.check);
      item.tasks[index].done = box.checked;
      box.closest(".task").classList.toggle("is-done", box.checked);
      syncRow(item);
      const line = sheetRoot.querySelector(".check-line");
      if (line) {
        const progress = model.progressOf(item);
        line.textContent = `${progress.label} · ${progress.fraction} · ${progress.percentLabel}`;
      }
    }
    if (dateAnswer) {
      item.tasks[Number(event.target.dataset.taskAnswer)].answer = event.target.value;
    }
    if (dateField) item.targetDate = event.target.value;
    save();
  } catch (error) {
    setStatus("Could not update the list.", { error: true });
  }
});

document.addEventListener("input", (event) => {
  const item = state.openId ? itemById(state.openId) : null;
  if (!item || pendingConfirm) return;
  const field = event.target.dataset.field;
  const taskIndex = event.target.dataset.taskText;
  const answerIndex = event.target.dataset.taskAnswer;
  try {
    if (field === "title") {
      const cleaned = event.target.value.replace(/\n/g, " ");
      if (cleaned !== event.target.value) event.target.value = cleaned;
      item.title = cleaned;
    } else if (field === "description" || field === "statusNote" || field === "owner" || field === "nextAction") {
      item[field] = event.target.value;
    }
    if (field === "targetDate") item.targetDate = event.target.value;
    if (taskIndex != null) item.tasks[Number(taskIndex)].text = event.target.value;
    if (answerIndex != null && event.target.type !== "date") {
      item.tasks[Number(answerIndex)].answer = event.target.value;
    }
    if (field === "title" || field === "owner" || field === "nextAction") syncRow(item);
    save();
  } catch (error) {
    setStatus("Could not update the list.", { error: true });
  }
});

document.querySelector("#import-file").addEventListener("change", (event) => {
  const file = event.target.files && event.target.files[0];
  event.target.value = "";
  if (!file) return;
  if (file.size > 2_000_000) {
    setStatus("That file is too large to import.", { error: true });
    return;
  }
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    const result = model.parseImport(String(reader.result || ""));
    if (!result.ok) {
      setStatus(result.error, { error: true });
      return;
    }
    askImport(result.items);
  });
  reader.addEventListener("error", () => {
    setStatus("That file could not be read.", { error: true });
  });
  reader.readAsText(file);
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
  if (dy > 90) closeSheet();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && event.target.dataset && event.target.dataset.field === "title") {
    event.preventDefault();
  }
  if (pendingConfirm) {
    trapTab(event, confirmRoot.querySelector(".confirm"));
    if (event.key === "Escape") closeConfirm();
    return;
  }
  if (!state.openId) return;
  trapTab(event, sheetRoot.querySelector(".sheet"));
  if (event.key === "Escape") closeSheet();
});

load();
render();
