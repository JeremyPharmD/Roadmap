const STORAGE_KEY = "pocket-work-tracker";
const STARTER_KEY = "pocket-work-tracker-starter";
const STARTER_VERSION = "1";
const COLORS = ["#b54a2a", "#1f6f8b", "#6b5e52"];

const STARTER = [
  {
    id: "best-rx-quantity-refill",
    title: "Best RX Quantity and Refill Resolution",
    description: "",
    statusNote: "",
  },
  {
    id: "branding-packaging-onboarding",
    title: "Branding and packaging process onboarding",
    description: "Includes inventory and bottling.",
    statusNote: "",
  },
  {
    id: "compliance-support",
    title: "Compliance support",
    description: "",
    statusNote: "",
  },
  {
    id: "best-rx-enterprise-contract",
    title: "Best RX Enterprise Contract Plan Removal",
    description: "",
    statusNote: "",
  },
  {
    id: "standalone-product-sites",
    title: "Standalone sites for each of our products",
    description: "",
    statusNote: "",
  },
  {
    id: "ai-agents-support",
    title: "AI agents for support",
    description: "",
    statusNote: "",
  },
  {
    id: "try-epiq",
    title: "Try Epiq",
    description: "",
    statusNote: "",
  },
  {
    id: "white-label-offering",
    title: "White label offering",
    description: "",
    statusNote: "",
  },
].map((item, index) => ({
  ...item,
  color: COLORS[index % COLORS.length],
  status: "evaluate",
  tasks: [],
}));

const PHASES = [
  { id: "evaluate", label: "Evaluate", short: "Evaluate" },
  { id: "feasibility", label: "Investigate feasibility", short: "Feasibility" },
  { id: "review", label: "Ready for review", short: "Review" },
];

function normalizeItem(raw) {
  if (!raw || typeof raw !== "object") return null;
  const status = PHASES.some((phase) => phase.id === raw.status) ? raw.status : "evaluate";
  const color = COLORS.includes(raw.color) ? raw.color : COLORS[0];
  const tasks = Array.isArray(raw.tasks)
    ? raw.tasks
        .filter((task) => task && typeof task === "object")
        .map((task) => ({
          text: typeof task.text === "string" ? task.text : "",
          done: Boolean(task.done),
        }))
    : [];
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : crypto.randomUUID(),
    title: typeof raw.title === "string" ? raw.title : "",
    description: typeof raw.description === "string" ? raw.description : "",
    color,
    status,
    statusNote: typeof raw.statusNote === "string" ? raw.statusNote : "",
    tasks,
  };
}

function starterItems() {
  return STARTER.map((item) => normalizeItem(item)).filter(Boolean);
}

function loadItems() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    const saved = Array.isArray(parsed) ? parsed.map(normalizeItem).filter(Boolean) : [];
    const version = localStorage.getItem(STARTER_KEY);
    if (version !== STARTER_VERSION && saved.length === 0) {
      const items = starterItems();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      localStorage.setItem(STARTER_KEY, STARTER_VERSION);
      return items;
    }
    return saved;
  } catch (error) {
    return starterItems();
  }
}

const state = {
  items: loadItems(),
  openId: null,
  editing: false,
  scrollTask: null,
};

let saveToken = 0;
let drag = null;
let closing = false;

const app = document.querySelector("#app");
const sheetRoot = document.querySelector("#sheet-root");
const statusEl = document.querySelector("#status");

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
  return PHASES.find((phase) => phase.id === status) || PHASES[0];
}

function progressOf(item) {
  const steps = item.tasks.length;
  const done = item.tasks.filter((task) => task.done).length;
  if (steps === 0) {
    return { percent: 0, fraction: "—", percentLabel: "0%" };
  }
  const percent = Math.round((done / steps) * 100);
  return { percent, fraction: `${done}/${steps}`, percentLabel: `${percent}%` };
}

function openLines() {
  return state.items.slice(0, 3).map((item) => ({
    itemId: item.id,
    text: item.title || "New task",
    reason: item.statusNote || phaseOf(item.status).label,
    color: item.color,
  }));
}

function commit() {
  const token = ++saveToken;
  statusEl.classList.remove("is-error");
  statusEl.textContent = "Saving…";
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items));
  } catch (error) {
    fail("Could not save on this browser.");
    return;
  }
  window.setTimeout(() => {
    if (token !== saveToken) return;
    statusEl.textContent = "Saved";
  }, 160);
}

function fail(message) {
  statusEl.textContent = message;
  statusEl.classList.add("is-error");
}

function meterHtml(item) {
  const progress = progressOf(item);
  const size = item.size ? escapeHtml(item.size) : escapeHtml(phaseOf(item.status).short);
  return `
    <span class="meter">
      <span class="size">${size}</span>
      <span class="track" aria-hidden="true"><span class="fill" style="width:${progress.percent}%"></span></span>
      <span class="count">
        <span class="frac">${progress.fraction}</span>
        <span class="pct">${progress.percentLabel}</span>
      </span>
    </span>
  `;
}

function renderNext() {
  const lines = openLines();
  const body = lines.length
    ? lines
        .map(
          (line, index) => `
            <button
              type="button"
              class="next-line"
              data-open="${escapeHtml(line.itemId)}"
              style="--accent:${escapeHtml(line.color)}"
            >
              <span class="n">${index + 1}</span>
              <span>
                <strong>${escapeHtml(line.text)}</strong>
                <em>${escapeHtml(line.reason)}</em>
              </span>
            </button>
          `,
        )
        .join("")
    : `<p class="next-empty">No open tasks.</p>`;
  return `<section class="next" aria-label="Next 3"><h2>Next 3</h2>${body}</section>`;
}

function renderList() {
  const rows = state.items
    .map((item, index) => {
      const title = item.title || "New task";
      const placeholder = item.title ? "" : " is-placeholder";
      return `
        <article class="row" data-id="${escapeHtml(item.id)}" style="--accent:${escapeHtml(item.color)}">
          <button type="button" class="handle" aria-label="Reorder ${escapeHtml(title)}">
            <span class="grip" aria-hidden="true"></span>
          </button>
          <span class="rank">${index + 1}</span>
          <button type="button" class="open" data-open="${escapeHtml(item.id)}">
            <span class="title-line">
              <span class="title${placeholder}">${escapeHtml(title)}</span>
              <span class="chevron" aria-hidden="true"></span>
            </span>
            ${meterHtml(item)}
          </button>
          <span class="nudges">
            <button type="button" class="nudge" data-move="up" data-id="${escapeHtml(item.id)}" ${index === 0 ? "disabled" : ""}>Up</button>
            <button type="button" class="nudge" data-move="down" data-id="${escapeHtml(item.id)}" ${index === state.items.length - 1 ? "disabled" : ""}>Down</button>
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

function taskHtml(task, index, editing) {
  const doneClass = task.done ? " is-done" : "";
  if (!editing) {
    return `
      <label class="task${doneClass}" data-task="${index}">
        <input type="checkbox" ${task.done ? "checked" : ""} data-check="${index}" />
        <span class="task-text">${escapeHtml(task.text)}</span>
      </label>
    `;
  }
  return `
    <div class="task${doneClass}" data-task="${index}">
      <input type="checkbox" ${task.done ? "checked" : ""} data-check="${index}" />
      <input class="field task-input" type="text" value="${escapeHtml(task.text)}" data-task-text="${index}" aria-label="Requirement ${index + 1}" />
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
  const phases = PHASES.map(
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
    ? `<input id="sheet-title" class="field title-input" type="text" value="${escapeHtml(item.title)}" data-field="title" aria-label="Title" placeholder="New task" />
       <input class="field desc-input" type="text" value="${escapeHtml(item.description)}" data-field="description" aria-label="Description" />`
    : `<h2 id="sheet-title">${escapeHtml(item.title || "New task")}</h2><p class="desc">${escapeHtml(item.description)}</p>`;
  const tasks = item.tasks.map((task, index) => taskHtml(task, index, state.editing)).join("");
  const add = state.editing ? `<button type="button" class="add-line" data-add>Add a requirement</button>` : "";
  const emptyRequirements = item.tasks.length
    ? ""
    : `<p class="next-empty">No requirements yet. The percent comes from these.</p>`;
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
          <div class="segments" role="radiogroup" aria-label="Phase">${phases}</div>
          ${note}
        </div>
        <div class="key-head">
          <h3>Requirements</h3>
          <button type="button" class="text-btn" data-edit>${state.editing ? "Done" : "Edit"}</button>
        </div>
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
    if (state.scrollTask == null) return;
    const line = body.querySelector(`[data-task="${state.scrollTask}"]`);
    state.scrollTask = null;
    if (!line) return;
    const bodyRect = body.getBoundingClientRect();
    const lineRect = line.getBoundingClientRect();
    body.scrollTop += lineRect.top - bodyRect.top - body.clientHeight / 2 + lineRect.height / 2;
  });
}

function render() {
  const active = document.activeElement;
  const activeTask = active && active.dataset ? active.dataset.taskText : undefined;
  renderBoard();
  renderSheet();
  if (activeTask != null) {
    sheetRoot.querySelector(`[data-task-text="${activeTask}"]`)?.focus();
  }
}

function openSheet(id, taskIndex) {
  closing = false;
  state.openId = id;
  state.editing = false;
  state.scrollTask = taskIndex == null ? null : taskIndex;
  render();
}

function closeSheet() {
  const sheet = sheetRoot.querySelector(".sheet");
  const backdrop = sheetRoot.querySelector(".backdrop");
  const returnId = state.openId;
  if (!sheet || closing) {
    state.openId = null;
    state.editing = false;
    renderSheet();
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
    document.querySelector(`.row[data-id="${CSS.escape(returnId)}"] .open`)?.focus();
  };
  sheet.addEventListener("transitionend", finish, { once: true });
  window.setTimeout(finish, 320);
}

function addTask() {
  const item = {
    id: crypto.randomUUID(),
    title: "",
    description: "",
    color: COLORS[state.items.length % COLORS.length],
    status: "evaluate",
    statusNote: "",
    tasks: [],
  };
  state.items.push(item);
  closing = false;
  state.openId = item.id;
  state.editing = true;
  state.scrollTask = null;
  commit();
  render();
  sheetRoot.querySelector("[data-field='title']")?.focus();
}

function deleteOpenTask() {
  const id = state.openId;
  if (!id) return;
  state.items = state.items.filter((item) => item.id !== id);
  state.openId = null;
  state.editing = false;
  commit();
  render();
}

function moveItem(id, direction) {
  const index = state.items.findIndex((item) => item.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= state.items.length) return;
  const [item] = state.items.splice(index, 1);
  state.items.splice(target, 0, item);
  commit();
  render();
}

function syncOrderFromDom() {
  const order = [...document.querySelectorAll("#list .row")].map((row) => row.dataset.id);
  const byId = new Map(state.items.map((item) => [item.id, item]));
  state.items = order.map((id) => byId.get(id));
}

function onPointerMove(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const list = document.querySelector("#list");
  const rows = [...list.querySelectorAll(".row")];
  let target = rows.length - 1;
  for (let index = 0; index < rows.length; index += 1) {
    const rect = rows[index].getBoundingClientRect();
    if (event.clientY < rect.top + rect.height / 2) {
      target = index;
      break;
    }
  }
  const current = rows.indexOf(drag.row);
  if (target === current) return;
  if (target > current) list.insertBefore(drag.row, rows[target].nextSibling);
  else list.insertBefore(drag.row, rows[target]);
  [...list.querySelectorAll(".row")].forEach((row, index) => {
    row.querySelector(".rank").textContent = String(index + 1);
  });
}

document.addEventListener("pointerdown", (event) => {
  const handle = event.target.closest(".handle");
  if (!handle || state.openId) return;
  event.preventDefault();
  const row = handle.closest(".row");
  drag = { row, pointerId: event.pointerId };
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
  drag.row.classList.remove("is-dragging");
  drag = null;
  syncOrderFromDom();
  commit();
  render();
});

document.addEventListener("pointercancel", (event) => {
  if (!drag || event.pointerId !== drag.pointerId) return;
  drag.row.classList.remove("is-dragging");
  drag = null;
  render();
});

document.addEventListener("click", (event) => {
  try {
    if (event.target.closest("[data-add-task]")) {
      addTask();
      return;
    }
    if (event.target.closest("[data-delete-task]")) {
      deleteOpenTask();
      return;
    }
    const move = event.target.closest("[data-move]");
    if (move) {
      moveItem(move.dataset.id, move.dataset.move === "up" ? -1 : 1);
      return;
    }
    const opener = event.target.closest("[data-open]");
    if (opener && !event.target.closest(".sheet")) {
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
      render();
      if (state.editing) sheetRoot.querySelector("[data-field='title']")?.focus();
      return;
    }
    const remove = event.target.closest("[data-remove]");
    if (remove) {
      const item = itemById(state.openId);
      item.tasks.splice(Number(remove.dataset.remove), 1);
      commit();
      render();
      return;
    }
    if (event.target.closest("[data-add]")) {
      const item = itemById(state.openId);
      item.tasks.push({ text: "", done: false });
      commit();
      render();
      const inputs = sheetRoot.querySelectorAll("[data-task-text]");
      inputs[inputs.length - 1]?.focus();
      return;
    }
    const phase = event.target.closest("[data-status]");
    if (phase) {
      itemById(state.openId).status = phase.dataset.status;
      commit();
      render();
    }
  } catch (error) {
    fail("Could not update the list.");
  }
});

document.addEventListener("change", (event) => {
  const box = event.target.closest("[data-check]");
  if (!box) return;
  try {
    const item = itemById(state.openId);
    const index = Number(box.dataset.check);
    item.tasks[index].done = box.checked;
    box.closest(".task").classList.toggle("is-done", box.checked);
    const row = document.querySelector(`.row[data-id="${CSS.escape(item.id)}"] .meter`);
    if (row) row.outerHTML = meterHtml(item);
    const next = app.querySelector(".next");
    if (next) next.outerHTML = renderNext();
    commit();
  } catch (error) {
    fail("Could not update the list.");
  }
});

document.addEventListener("input", (event) => {
  const item = state.openId ? itemById(state.openId) : null;
  if (!item) return;
  const field = event.target.dataset.field;
  const taskIndex = event.target.dataset.taskText;
  try {
    if (field) item[field] = event.target.value;
    if (taskIndex != null) item.tasks[Number(taskIndex)].text = event.target.value;
    if (field === "title") {
      const title = document.querySelector(`.row[data-id="${CSS.escape(item.id)}"] .title`);
      if (title) {
        title.textContent = item.title || "New task";
        title.classList.toggle("is-placeholder", !item.title);
      }
      const handle = document.querySelector(`.row[data-id="${CSS.escape(item.id)}"] .handle`);
      if (handle) handle.setAttribute("aria-label", `Reorder ${item.title || "New task"}`);
    }
    if (field === "title" || field === "statusNote" || taskIndex != null) {
      const next = app.querySelector(".next");
      if (next) next.outerHTML = renderNext();
    }
    commit();
  } catch (error) {
    fail("Could not update the list.");
  }
});

let grabDrag = null;

document.addEventListener("pointerdown", (event) => {
  const grab = event.target.closest(".grab");
  if (!grab) return;
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
  if (event.key === "Escape" && state.openId) closeSheet();
});

render();
