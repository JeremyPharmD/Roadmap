(function () {
  const model = window.LicenseModel;
  const state = {
    records: [],
    settings: model.defaultSettings(),
    filter: { query: "", kind: "", group: "", status: "" },
    openId: "",
    confirmRemove: false,
    confirmFresh: false,
    confirmWorkbook: false,
    undo: null,
    message: "",
    error: "",
    recovery: "",
    paintedOpenId: "",
    focusName: false,
  };

  const KIND_SHORT = { state: "State", pharmacist: "Pharmacist", technician: "Technician", accreditation: "Accreditation" };
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    const props = attrs || {};
    if (tag === "button" && props.type == null) node.type = "button";
    for (const [key, value] of Object.entries(props)) {
      if (value == null || value === false) continue;
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = String(value);
      else if (key === "value") node.value = String(value);
      else node.setAttribute(key, value === true ? "" : String(value));
    }
    for (const child of children || []) {
      if (child == null || child === false) continue;
      node.append(child.nodeType ? child : document.createTextNode(String(child)));
    }
    return node;
  }

  function option(value, label, selected) {
    const node = el("option", { value, text: label });
    if (selected) node.selected = true;
    return node;
  }

  function today() {
    return model.localToday(new Date());
  }

  function openRecord() {
    return state.records.find((record) => record.id === state.openId) || null;
  }

  function persist() {
    try {
      const document = model.exportDocument(state.records, state.settings);
      localStorage.setItem(model.STORAGE_KEY, JSON.stringify(document));
      if (state.error === "This browser could not save the matrix.") state.error = "";
    } catch (error) {
      state.error = "This browser could not save the matrix.";
    }
  }

  function load() {
    let raw = null;
    try {
      raw = localStorage.getItem(model.STORAGE_KEY);
    } catch (error) {
      state.error = "This browser could not read the saved matrix.";
      const plan = model.initialPlan(null);
      state.records = plan.records;
      state.settings = plan.settings;
      return;
    }
    if (!raw) {
      const plan = model.initialPlan(null);
      state.records = plan.records;
      state.settings = plan.settings;
      persist();
      return;
    }
    try {
      const result = model.planFromStorage(JSON.parse(raw));
      if (!result.ok) {
        state.recovery = raw;
        return;
      }
      state.records = result.plan.records;
      state.settings = result.plan.settings;
    } catch (error) {
      state.recovery = raw;
    }
  }

  function selectionOf(node) {
    if (!node) return null;
    try {
      if (typeof node.selectionStart === "number") return [node.selectionStart, node.selectionEnd];
    } catch (error) {
      return null;
    }
    return null;
  }

  function captureView() {
    const active = document.activeElement;
    const scroll = document.getElementById("matrix-scroll");
    const settings = document.getElementById("settings");
    return {
      id: active && active.id ? active.id : "",
      selection: selectionOf(active),
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      tableX: scroll ? scroll.scrollLeft : 0,
      settingsOpen: Boolean(settings && settings.open),
    };
  }

  function restoreView(view) {
    const settings = document.getElementById("settings");
    if (settings && view.settingsOpen) settings.open = true;
    const scroll = document.getElementById("matrix-scroll");
    if (scroll) scroll.scrollLeft = view.tableX;
    if (view.id) {
      const node = document.getElementById(view.id);
      if (node && typeof node.focus === "function") {
        node.focus({ preventScroll: true });
        if (view.selection && typeof node.setSelectionRange === "function") {
          try {
            node.setSelectionRange(view.selection[0], view.selection[1]);
          } catch (error) {
            /* Date and number inputs do not take a text selection. */
          }
        }
      }
    }
    window.scrollTo(view.scrollX, view.scrollY);
  }

  function formatShort(iso) {
    if (!model.cleanDate(iso)) return "—";
    const [year, month, day] = iso.split("-");
    return `${MONTHS[Number(month) - 1]} ${Number(day)}, ${year}`;
  }

  function flagText(record) {
    const parts = [];
    if (record.telemedicine === "asynchronous") parts.push("Async");
    else if (record.telemedicine === "yes") parts.push("Telemed");
    if (record.reciprocity === "yes") parts.push("Recip");
    if (record.sos === "yes") parts.push("SOS");
    if (record.residentAgent === "yes") parts.push("Agent");
    return parts.join(" · ");
  }

  function renewalText(record) {
    if (record.renewed) return formatShort(record.renewed);
    if (record.renewalSubmitted) return `Submitted ${formatShort(record.renewalSubmitted)}`;
    return "";
  }

  async function inflateRaw(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  function readout(record, status) {
    if (status.attention && model.attentionLine(record, status)) return `${status.label}. ${model.attentionLine(record, status)}.`;
    if (status.id === "needs-date") return "Needs a date. Enter an expiration to start the reminder.";
    if (status.id === "pending") return "Pending. This row is not treated as a current license.";
    if (status.id === "current") return `Current. ${model.daysLabel(status.days)} left. The reminder opens ${status.lead} days before expiration.`;
    if (status.id === "renewal-filed") return `Renewal filed. ${model.daysLabel(status.days)} left, outside the reminder window.`;
    if (status.id === "inactive") return "Inactive. Expiration alerts are off for this row.";
    return status.label;
  }

  function filtersOn() {
    return Boolean(state.filter.query || state.filter.kind || state.filter.group || state.filter.status);
  }

  function renderStatus() {
    const status = document.getElementById("status");
    status.replaceChildren();
    if (state.error) {
      status.className = "status is-error";
      status.textContent = state.error;
      return;
    }
    status.className = "status";
    if (state.undo) {
      status.append(
        el("span", { text: "Removed a credential." }),
        el("button", { "data-action": "undo", text: "Undo" }),
      );
      return;
    }
    status.textContent = state.message || "";
  }

  function renderRecovery() {
    const root = document.getElementById("recovery");
    root.hidden = false;
    root.replaceChildren(
      el("p", { text: "The saved matrix could not be read. It is still in this browser. Download it before starting over." }),
      el("div", { class: "recovery-actions" }, [
        el("button", { "data-action": "download-recovery", text: "Download backup" }),
        el("button", {
          "data-action": "start-fresh",
          text: state.confirmFresh ? "Replace the unreadable save" : "Start a new matrix",
        }),
      ]),
    );
    document.getElementById("app").replaceChildren(
      el("p", { class: "intro", text: "The matrix stays hidden until the saved copy is downloaded or replaced." }),
    );
    renderStatus();
  }

  function statButton(id, label, count, hot) {
    return el("button", {
      class: hot && count > 0 ? "stat is-hot" : "stat",
      "data-action": "group",
      "data-id": id,
      "aria-pressed": state.filter.group === id ? "true" : "false",
    }, [el("strong", { text: String(count) }), el("span", { text: label })]);
  }

  function renderSummary(summary, quietMissing) {
    const kindLine = [
      `${summary.byKind.state} state ${summary.byKind.state === 1 ? "license" : "licenses"}`,
      `${summary.byKind.pharmacist} pharmacist ${summary.byKind.pharmacist === 1 ? "license" : "licenses"}`,
      `${summary.byKind.technician} ${summary.byKind.technician === 1 ? "technician" : "technicians"}`,
      `${summary.byKind.accreditation} ${summary.byKind.accreditation === 1 ? "accreditation" : "accreditations"}`,
    ].join(" · ");
    const intro = [
      el("h2", { text: "Master matrix" }),
      el("p", {
        class: "intro",
        text: "State licenses, pharmacist licenses, pharmacy technicians, and accreditations. Status uses the sooner of the license expiration and the controlled-substance date. Alerts stay on this page. Nothing is emailed, and this page does not file a renewal with a board.",
      }),
      el("p", { class: "asof", text: `Status as of ${model.formatLong(today())}.` }),
      el("p", { class: "kind-count", text: kindLine }),
    ];
    if (model.isPristine(state.records)) {
      intro.push(el("p", {
        class: "missing",
        text: "The 51 rows are an empty state list, one pharmacy license for each state and Washington DC. Import the W2 workbook to fill license numbers, pharmacists, and technicians. Usernames and passwords in that workbook are ignored.",
      }));
    } else if (quietMissing) {
      intro.push(el("p", {
        class: "missing",
        text: `${quietMissing} ${quietMissing === 1 ? "credential has" : "credentials have"} no expiration date, so no reminder is running.`,
      }));
    }
    return el("div", { class: "page-intro" }, [
      ...intro,
      el("div", { class: "stats" }, [
        statButton("attention", "Attention", summary.groups.attention, true),
        statButton("expired", "Expired", summary.groups.expired, true),
        statButton("expiring", "Expiring", summary.groups.expiring, true),
        statButton("current", "Current", summary.groups.current, false),
        statButton("needs-date", "Needs a date", summary.groups["needs-date"], false),
      ]),
    ]);
  }

  function renderAlerts(rows, upcoming) {
    const expired = rows.some((row) => row.status.id === "expired" || (row.status.id === "suspended" && row.status.days != null && row.status.days < 0));
    const panel = el("section", { class: expired ? "alert-panel has-expired" : "alert-panel", "aria-label": "Alerts" }, [
      el("h2", { text: rows.length ? `Alerts · ${rows.length}` : "Alerts" }),
    ]);
    if (!rows.length) {
      const nextName = upcoming && upcoming.status.source === "controlled"
        ? `${upcoming.record.name || "New credential"} controlled substance`
        : (upcoming ? upcoming.record.name || "New credential" : "");
      const quiet = upcoming
        ? `No credential is expired, inside its reminder window, or suspended. Next date is ${nextName} on ${model.formatLong(upcoming.status.date)} (${model.daysLabel(upcoming.status.days)}).`
        : "No credential is expired, inside its reminder window, or suspended.";
      panel.append(el("p", { class: "quiet", text: quiet }));
      return panel;
    }
    const list = el("div", { class: "alerts" });
    for (const row of rows) {
      list.append(el("button", {
        class: `alert is-${row.status.id}`,
        "data-action": "open",
        "data-id": row.record.id,
      }, [
        el("span", { text: model.alertTitle(row.record, row.status).replace(/ — .*$/, "") }),
        el("span", { class: "when", text: model.attentionLine(row.record, row.status) }),
      ]));
    }
    panel.append(list);
    return panel;
  }

  function renderToolbar() {
    const kinds = [["", "All"], ["state", "State licenses"], ["pharmacist", "Pharmacist licenses"], ["technician", "Technicians"], ["accreditation", "Accreditations"]];
    const statusOptions = [option("", "All statuses", state.filter.status === "")];
    for (const status of model.STATUSES) statusOptions.push(option(status.id, status.label, state.filter.status === status.id));
    const tools = [
      el("input", {
        id: "search",
        class: "search",
        type: "search",
        placeholder: "Search name, holder, number, or state",
        value: state.filter.query,
        autocomplete: "off",
      }),
      el("div", { class: "chips", role: "group", "aria-label": "Credential kind" }, kinds.map(([id, label]) => el("button", {
        "data-action": "kind",
        "data-id": id,
        "aria-pressed": state.filter.kind === id ? "true" : "false",
        text: label,
      }))),
      el("select", { id: "status-filter", "aria-label": "Status" }, statusOptions),
      el("button", {
        class: "btn",
        "data-action": "import-workbook",
        text: state.confirmWorkbook ? "Replace the matrix with this workbook" : "Import W2 workbook",
      }),
      el("button", { class: "btn primary", "data-action": "add", text: "Add credential" }),
    ];
    if (filtersOn()) tools.push(el("button", { class: "btn", "data-action": "clear-filters", text: "Clear filters" }));
    return el("div", { class: "toolbar" }, tools);
  }

  function renderTable(rows) {
    const head = el("tr", {}, ["Status", "Kind", "State", "Who", "Number", "Expires", "Days", "Controlled", "Flags", "Renewal"].map((label) => el("th", { scope: "col", text: label })));
    const body = el("tbody");
    if (!rows.length) {
      const cell = el("td", { class: "empty", colspan: "10", text: state.records.length ? "Nothing matches this filter." : "The matrix is empty." });
      body.append(el("tr", {}, [cell]));
    }
    for (const row of rows) {
      const record = row.record;
      const where = model.jurisdictionLabel(record.jurisdiction);
      const who = model.holderLabel(record);
      const opener = el("button", {
        class: "name-btn",
        "data-action": "open",
        "data-id": record.id,
        text: where || who || record.name || "Credential",
      });
      const expires = el("td", { class: "nowrap" }, [
        formatShort(row.status.date),
        row.status.source === "controlled" && row.status.date ? el("span", { class: "cs", text: " CS" }) : null,
      ]);
      body.append(el("tr", { "data-id": record.id, class: state.openId === record.id ? `is-open is-${row.status.id}` : `is-${row.status.id}` }, [
        el("td", {}, [el("span", { class: `pill ${row.status.id}`, text: row.status.label })]),
        el("td", {}, [
          KIND_SHORT[record.kind] || "",
          record.name && record.name !== {
            state: "Pharmacy license",
            pharmacist: "Pharmacist license",
            technician: "Pharmacy technician",
            accreditation: "Accreditation",
          }[record.kind] ? el("span", { class: "sub", text: record.name }) : null,
        ]),
        el("td", {}, [where ? opener : "—"]),
        el("td", {}, [where ? (who || "—") : opener]),
        el("td", { class: "nowrap", text: record.number || "—" }),
        expires,
        el("td", { class: "days", text: model.daysLabel(row.status.days) }),
        el("td", { text: record.controlled || "—" }),
        el("td", { class: "flags", text: flagText(record) || "—" }),
        el("td", { class: "nowrap", text: renewalText(record) || "—" }),
      ]));
    }
    return el("div", { id: "matrix-scroll", class: "matrix-scroll" }, [
      el("table", { id: "matrix", class: "matrix" }, [
        el("caption", { text: "Master credential matrix" }),
        el("thead", {}, [head]),
        body,
      ]),
    ]);
  }

  function fieldLabel(text, control) {
    return el("label", {}, [el("span", { text }), control]);
  }

  function lineInput(id, field, value, max, extras) {
    return el("input", {
      id,
      class: "field",
      "data-field": field,
      value: value || "",
      maxlength: String(max),
      autocomplete: "off",
      ...extras,
    });
  }

  function renderEditor(record) {
    if (!record) return null;
    const status = model.statusOf(record, today(), state.settings);
    const jurisdictions = model.JURISDICTIONS.map(([id, label]) => option(id, label, record.jurisdiction === id));
    if (record.jurisdiction && !model.JURISDICTIONS.some(([id]) => id === record.jurisdiction)) {
      jurisdictions.push(option(record.jurisdiction, record.jurisdiction, true));
    }
    const yesNo = (id, field, value) => el("select", { id, class: "field", "data-field": field }, [
      option("", "Not set", value === ""),
      option("yes", "Yes", value === "yes"),
      option("no", "No", value === "no"),
    ]);
    const fields = [
      fieldLabel("Kind", el("select", { id: "field-kind", class: "field", "data-field": "kind" }, model.KINDS.map((kind) => option(kind.id, kind.label, record.kind === kind.id)))),
      fieldLabel("Credential", lineInput("field-name", "name", record.name, model.LIMITS.name, { placeholder: "Credential name" })),
      fieldLabel("Who", lineInput("field-holder", "holder", record.holder, model.LIMITS.holder, { placeholder: "Pharmacy, pharmacist, or technician" })),
      fieldLabel("State", el("select", { id: "field-jurisdiction", class: "field", "data-field": "jurisdiction" }, jurisdictions)),
      fieldLabel("License number", lineInput("field-number", "number", record.number, model.LIMITS.number, { placeholder: "License or certificate number", spellcheck: "false" })),
      fieldLabel("Issuer", lineInput("field-issuer", "issuer", record.issuer, model.LIMITS.issuer, { placeholder: "Board or accreditor" })),
      fieldLabel("Posture", el("select", { id: "field-posture", class: "field", "data-field": "posture" }, model.POSTURES.map((posture) => option(posture.id, posture.label, record.posture === posture.id)))),
      fieldLabel("Issued", el("input", { id: "field-issued", class: "field", type: "date", "data-field": "issued", value: record.issued })),
      fieldLabel("Expires", el("input", { id: "field-expires", class: "field", type: "date", "data-field": "expires", value: record.expires })),
      fieldLabel("Reminder lead, days", el("input", {
        id: "field-reminder",
        class: "field",
        type: "number",
        min: "0",
        max: String(model.LEAD_MAX),
        "data-field": "reminderDays",
        value: record.reminderDays == null ? "" : String(record.reminderDays),
        placeholder: `Default ${model.reminderLead(record, state.settings)}`,
      })),
      fieldLabel("Owner", lineInput("field-owner", "owner", record.owner, model.LIMITS.owner, { placeholder: "Who watches this renewal" })),
      fieldLabel("Last verified", el("input", { id: "field-verified", class: "field", type: "date", "data-field": "verified", value: record.verified })),
    ];
    if (record.kind === "pharmacist") {
      fields.splice(3, 0, fieldLabel("Role", el("select", { id: "field-role", class: "field", "data-field": "role" }, model.ROLES.map((role) => option(role.id, role.label, record.role === role.id)))));
      fields.splice(6, 0, fieldLabel("NABP e-Profile ID", lineInput("field-profile", "profileId", record.profileId, model.LIMITS.profileId, { spellcheck: "false" })));
    }
    if (record.kind === "state" || record.kind === "pharmacist") {
      fields.push(
        fieldLabel("Controlled substance", lineInput("field-controlled", "controlled", record.controlled, model.LIMITS.controlled, { placeholder: "Registration text", spellcheck: "false" })),
        fieldLabel("Controlled expiration", el("input", { id: "field-controlled-expires", class: "field", type: "date", "data-field": "controlledExpires", value: record.controlledExpires })),
      );
    }
    if (record.kind === "state") {
      fields.push(
        fieldLabel("Board phone", lineInput("field-phone", "phone", record.phone, model.LIMITS.phone, { placeholder: "Board phone" })),
        fieldLabel("Telemedicine", el("select", { id: "field-telemedicine", class: "field", "data-field": "telemedicine" }, [
          option("", "Not set", record.telemedicine === ""),
          option("yes", "Yes", record.telemedicine === "yes"),
          option("no", "No", record.telemedicine === "no"),
          option("asynchronous", "Asynchronous", record.telemedicine === "asynchronous"),
        ])),
        fieldLabel("Reciprocity", yesNo("field-reciprocity", "reciprocity", record.reciprocity)),
        fieldLabel("SOS", yesNo("field-sos", "sos", record.sos)),
        fieldLabel("Resident agent", yesNo("field-resident-agent", "residentAgent", record.residentAgent)),
        fieldLabel("Applied", lineInput("field-applied", "applied", record.applied, model.LIMITS.applied, { placeholder: "How the application went out" })),
        fieldLabel("Renewed on", el("input", { id: "field-renewed", class: "field", type: "date", "data-field": "renewed", value: record.renewed })),
      );
    }
    if (record.kind === "technician") {
      fields.push(
        fieldLabel("License type", lineInput("field-license-type", "licenseType", record.licenseType, model.LIMITS.licenseType, { placeholder: "Tech or in training" })),
        fieldLabel("Renewal start", el("input", { id: "field-renewal-start", class: "field", type: "date", "data-field": "renewalStart", value: record.renewalStart })),
        fieldLabel("Renewal submitted", el("input", { id: "field-renewal-submitted", class: "field", type: "date", "data-field": "renewalSubmitted", value: record.renewalSubmitted })),
      );
    }
    fields.push(fieldLabel("Notes", el("textarea", { id: "field-notes", class: "field", "data-field": "notes", maxlength: String(model.LIMITS.notes), text: record.notes })));
    const duplicate = record.kind === "state" || record.kind === "pharmacist" ? "Duplicate for another state" : "Duplicate";
    let actions;
    if (state.confirmRemove) {
      actions = el("div", { class: "editor-actions" }, [
        el("p", { class: "confirm-copy", text: "Remove this credential from the matrix?" }),
        el("button", { class: "btn danger", "data-action": "confirm-remove", text: "Remove" }),
        el("button", { class: "btn", "data-action": "cancel-remove", text: "Cancel" }),
      ]);
    } else {
      actions = el("div", { class: "editor-actions" }, [
        el("button", { class: "btn", "data-action": "duplicate", text: duplicate }),
        el("button", { class: "btn danger", "data-action": "ask-remove", text: "Remove" }),
        el("button", { class: "btn", "data-action": "close", text: "Back to the matrix" }),
      ]);
    }
    const heading = [record.name || "New credential", model.jurisdictionLabel(record.jurisdiction), model.holderLabel(record)].filter(Boolean).join(" · ");
    return el("section", { id: "editor", class: "editor", tabindex: "-1", "aria-label": "Credential" }, [
      el("div", { class: "editor-top" }, [
        el("h2", { text: heading }),
        el("button", { class: "btn", "data-action": "close", text: "Back to the matrix" }),
      ]),
      el("p", { class: "readout", text: readout(record, status) }),
      el("div", { class: "editor-grid" }, fields),
      el("p", { class: "hint", text: "Leave the reminder lead blank to use the default for this kind. A renewal stays on the alert list until the new expiration is outside that lead. Board-portal usernames and passwords are not stored." }),
      actions,
    ]);
  }

  function renderSettings(missing) {
    const defaults = state.settings.reminderDays;
    return el("details", { id: "settings", class: "settings" }, [
      el("summary", { text: "Reminder defaults and backup" }),
      el("div", { class: "settings-body" }, [
        el("div", { class: "settings-grid" }, model.KINDS.map((kind) => fieldLabel(kind.label, el("input", {
          id: `setting-${kind.id}`,
          class: "field",
          type: "number",
          min: "0",
          max: String(model.LEAD_MAX),
          "data-setting": kind.id,
          value: String(defaults[kind.id]),
        })))),
        el("p", { class: "hint", text: "Defaults apply to rows that leave their own lead blank. Days are counted before the expiration date." }),
        el("div", { class: "settings-actions" }, [
          el("button", { class: "btn", "data-action": "export-json", text: "Export JSON" }),
          el("button", { class: "btn", "data-action": "export-csv", text: "Export CSV" }),
          el("button", { class: "btn", "data-action": "pick-import", text: "Import JSON" }),
          el("button", {
            class: "btn",
            "data-action": "restore-template",
            disabled: missing.length ? null : true,
            text: missing.length ? `Add missing states (${missing.length})` : "Every state is on the matrix",
          }),
        ]),
        el("p", { class: "hint", text: "Import JSON replaces every credential saved in this browser. JSON is the backup and keeps the operational fields. CSV is a snapshot of today's status. Add missing states puts back a blank pharmacy license for any state that was removed." }),
        el("input", { id: "import-file", class: "visually-hidden", type: "file", accept: "application/json,.json" }),
        el("input", { id: "workbook-file", class: "visually-hidden", type: "file", accept: ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      ]),
    ]);
  }

  function render() {
    renderStatus();
    const recovery = document.getElementById("recovery");
    if (state.recovery) {
      renderRecovery();
      return;
    }
    recovery.hidden = true;
    recovery.replaceChildren();
    const current = today();
    const summary = model.summarize(state.records, current, state.settings);
    const rows = model.matrixRows(state.records, current, state.settings, state.filter);
    const attention = model.alerts(state.records, current, state.settings);
    const upcoming = attention.length ? null : model.nextExpiration(state.records, current, state.settings);
    const quietMissing = model.matrixRows(state.records, current, state.settings, { group: "needs-date" }).filter((row) => !row.status.attention).length;
    const record = openRecord();
    if (record) {
      document.getElementById("app").replaceChildren(renderEditor(record));
      return;
    }
    const layout = el("div", { class: "layout" }, [
      el("div", { class: "primary" }, [
        renderSummary(summary, quietMissing),
        renderAlerts(attention, upcoming),
        renderToolbar(),
        renderTable(rows),
        renderSettings(model.missingTemplate(state.records)),
      ]),
    ]);
    document.getElementById("app").replaceChildren(layout);
  }

  function paint() {
    const view = captureView();
    const openChanged = state.openId !== state.paintedOpenId;
    render();
    if (openChanged) {
      window.scrollTo(0, 0);
      const editor = document.getElementById("editor");
      if (state.openId && state.focusName) {
        const name = document.getElementById("field-name");
        if (name) name.focus();
        state.focusName = false;
      } else if (editor) editor.focus({ preventScroll: true });
    } else restoreView(view);
    state.paintedOpenId = state.openId;
  }

  function replaceRecord(next) {
    const index = state.records.findIndex((record) => record.id === next.id);
    if (index < 0) return;
    state.records[index] = next;
    state.undo = null;
    persist();
    paint();
  }

  function download(filename, contents, type) {
    const blob = new Blob([contents], { type });
    const url = URL.createObjectURL(blob);
    const link = el("a", { href: url, download: filename });
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function onInput(event) {
    const target = event.target;
    if (!target || target.id === "import-file" || target.id === "workbook-file") return;
    if (target.id === "search") {
      state.filter.query = target.value;
      paint();
      return;
    }
    const field = target.getAttribute && target.getAttribute("data-field");
    if (!field || !state.openId) return;
    if (target.tagName === "SELECT" || target.type === "date") return;
    const record = openRecord();
    if (!record) return;
    replaceRecord(model.applyField(record, field, target.value, false));
  }

  function onChange(event) {
    const target = event.target;
    if (!target) return;
    if (target.id === "import-file") {
      const file = target.files && target.files[0];
      target.value = "";
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const result = model.parseImport(String(reader.result || ""));
        if (!result.ok) {
          state.error = result.error;
          paint();
          return;
        }
        state.records = result.records;
        state.settings = result.settings;
        state.openId = "";
        state.undo = null;
        state.confirmRemove = false;
        state.error = "";
        state.confirmWorkbook = false;
        state.message = `Imported ${result.records.length} ${result.records.length === 1 ? "credential" : "credentials"}.`;
        persist();
        paint();
      };
      reader.readAsText(file);
      return;
    }
    if (target.id === "workbook-file") {
      const file = target.files && target.files[0];
      target.value = "";
      if (!file) return;
      if (typeof DecompressionStream !== "function") {
        state.error = "This browser cannot read an Excel workbook. Use a current version of Chrome, Edge, or Firefox.";
        paint();
        return;
      }
      const reader = new FileReader();
      reader.onload = async () => {
        let result;
        try {
          result = await window.LicenseWorkbook.recordsFromXlsx(new Uint8Array(reader.result || new ArrayBuffer(0)), inflateRaw, model);
        } catch (error) {
          state.error = "That workbook could not be read.";
          paint();
          return;
        }
        if (!result.ok) {
          state.error = result.error;
          paint();
          return;
        }
        state.records = result.records;
        state.openId = "";
        state.undo = null;
        state.confirmRemove = false;
        state.confirmWorkbook = false;
        state.error = "";
        state.message = `Imported ${result.records.length} ${result.records.length === 1 ? "credential" : "credentials"} from the W2 workbook.`;
        persist();
        paint();
      };
      reader.onerror = () => {
        state.error = "That workbook could not be read.";
        paint();
      };
      reader.readAsArrayBuffer(file);
      return;
    }
    if (target.id === "status-filter") {
      state.filter.status = target.value;
      state.filter.group = "";
      paint();
      return;
    }
    if (target.hasAttribute("data-setting")) {
      const kind = target.getAttribute("data-setting");
      const lead = model.cleanLead(target.value);
      state.settings = {
        reminderDays: {
          ...state.settings.reminderDays,
          [kind]: lead == null ? model.DEFAULT_REMINDERS[kind] : lead,
        },
      };
      state.undo = null;
      persist();
      paint();
      return;
    }
    const field = target.getAttribute("data-field");
    if (!field || !state.openId) return;
    const record = openRecord();
    if (!record) return;
    replaceRecord(model.applyField(record, field, target.value, true));
  }

  function onClick(event) {
    const target = event.target && event.target.closest ? event.target : null;
    const button = target ? target.closest("[data-action]") : null;
    if (!button) {
      const row = target && target.closest ? target.closest("tr[data-id]") : null;
      if (!row) return;
      state.openId = row.getAttribute("data-id");
      state.confirmRemove = false;
      state.message = "";
      paint();
      return;
    }
    const action = button.getAttribute("data-action");
    const id = button.getAttribute("data-id") || "";
    if (action === "open") {
      state.openId = id;
      state.confirmRemove = false;
      state.message = "";
      paint();
      return;
    }
    if (action === "group") {
      state.filter.group = state.filter.group === id ? "" : id;
      state.filter.status = "";
      paint();
      return;
    }
    if (action === "kind") {
      state.filter.kind = state.filter.kind === id ? "" : id;
      paint();
      return;
    }
    if (action === "clear-filters") {
      state.filter = { query: "", kind: "", group: "", status: "" };
      paint();
      return;
    }
    if (action === "add") {
      if (state.records.length >= model.MAX_RECORDS) {
        state.error = "This matrix is full.";
        paint();
        return;
      }
      const created = model.blankRecord(state.filter.kind || "state");
      state.records.unshift(created);
      state.openId = created.id;
      state.confirmRemove = false;
      state.undo = null;
      state.error = "";
      state.message = "Added a credential.";
      state.focusName = true;
      persist();
      paint();
      return;
    }
    if (action === "close") {
      state.openId = "";
      state.confirmRemove = false;
      paint();
      return;
    }
    if (action === "ask-remove") {
      state.confirmRemove = true;
      paint();
      return;
    }
    if (action === "cancel-remove") {
      state.confirmRemove = false;
      paint();
      return;
    }
    if (action === "confirm-remove") {
      const index = state.records.findIndex((record) => record.id === state.openId);
      if (index < 0) return;
      state.undo = { record: state.records[index], index };
      state.records.splice(index, 1);
      state.openId = "";
      state.confirmRemove = false;
      state.message = "";
      state.error = "";
      persist();
      paint();
      return;
    }
    if (action === "undo" && state.undo) {
      const restored = state.undo.record;
      state.records.splice(Math.min(state.undo.index, state.records.length), 0, restored);
      state.openId = restored.id;
      state.undo = null;
      state.message = "Restored the credential.";
      persist();
      paint();
      return;
    }
    if (action === "duplicate") {
      const record = openRecord();
      if (!record || state.records.length >= model.MAX_RECORDS) return;
      const copy = model.duplicateRecord(record);
      const index = state.records.findIndex((entry) => entry.id === record.id);
      state.records.splice(index + 1, 0, copy);
      state.openId = copy.id;
      state.undo = null;
      state.confirmWorkbook = false;
      state.message = record.kind === "state" || record.kind === "pharmacist"
        ? "Duplicated for another state. Choose the jurisdiction and enter the license number."
        : "Duplicated the credential. Enter the license number.";
      state.focusName = false;
      persist();
      paint();
      return;
    }
    if (action === "restore-template") {
      const missing = model.missingTemplate(state.records);
      if (!missing.length) return;
      state.records = model.restoreTemplate(state.records);
      state.undo = null;
      state.confirmWorkbook = false;
      state.message = `Added ${missing.length} missing ${missing.length === 1 ? "state" : "states"}.`;
      persist();
      paint();
      return;
    }
    if (action === "export-json") {
      const stamp = today();
      download(`license-matrix-${stamp}.json`, JSON.stringify(model.exportDocument(state.records, state.settings), null, 2), "application/json");
      state.message = "Exported a JSON backup.";
      paint();
      return;
    }
    if (action === "export-csv") {
      const stamp = today();
      download(`license-matrix-${stamp}.csv`, `\uFEFF${model.toCsv(state.records, stamp, state.settings)}`, "text/csv;charset=utf-8");
      state.message = "Exported a CSV snapshot.";
      paint();
      return;
    }
    if (action === "pick-import") {
      const input = document.getElementById("import-file");
      if (input) input.click();
      return;
    }
    if (action === "import-workbook") {
      if (typeof DecompressionStream !== "function") {
        state.error = "This browser cannot read an Excel workbook. Use a current version of Chrome, Edge, or Firefox.";
        paint();
        return;
      }
      if (!model.isPristine(state.records) && !state.confirmWorkbook) {
        state.confirmWorkbook = true;
        state.error = "";
        paint();
        return;
      }
      const input = document.getElementById("workbook-file");
      if (input) input.click();
      return;
    }
    if (action === "download-recovery") {
      download(`license-matrix-backup-${today()}.txt`, state.recovery, "text/plain");
      return;
    }
    if (action === "start-fresh") {
      if (!state.confirmFresh) {
        state.confirmFresh = true;
        paint();
        return;
      }
      const plan = model.initialPlan(null);
      state.records = plan.records;
      state.settings = plan.settings;
      state.recovery = "";
      state.confirmFresh = false;
      state.openId = "";
      state.confirmWorkbook = false;
      state.message = "Started a new matrix.";
      persist();
      paint();
    }
  }

  function onKey(event) {
    if (event.key === "Escape" && state.openId) {
      state.openId = "";
      state.confirmRemove = false;
      paint();
    }
  }

  document.addEventListener("input", onInput);
  document.addEventListener("change", onChange);
  document.addEventListener("click", onClick);
  document.addEventListener("keydown", onKey);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) paint();
  });
  load();
  paint();
})();
