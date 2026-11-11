(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.LicenseModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const STORAGE_KEY = "license-matrix";
  const STORAGE_VERSION = 2;
  const MAX_RECORDS = 500;
  const MAX_IMPORT_CHARS = 1000000;
  const LEAD_MAX = 1095;

  const KINDS = [
    { id: "state", label: "State license" },
    { id: "pharmacist", label: "Pharmacist license" },
    { id: "technician", label: "Pharmacy technician" },
    { id: "accreditation", label: "Accreditation" },
  ];

  const POSTURES = [
    { id: "active", label: "Active" },
    { id: "pending", label: "Pending" },
    { id: "renewal-filed", label: "Renewal filed" },
    { id: "suspended", label: "Suspended" },
    { id: "inactive", label: "Inactive" },
  ];

  const ROLES = [
    { id: "", label: "Not set" },
    { id: "staff", label: "Staff pharmacist" },
    { id: "pic", label: "Pharmacist-in-charge" },
  ];

  const STATUSES = [
    { id: "expired", label: "Expired", attention: true },
    { id: "expiring", label: "Expiring", attention: true },
    { id: "renewal-due", label: "Filed, expiring", attention: true },
    { id: "suspended", label: "Suspended", attention: true },
    { id: "needs-date", label: "Needs a date", attention: false },
    { id: "pending", label: "Pending", attention: false },
    { id: "renewal-filed", label: "Renewal filed", attention: false },
    { id: "current", label: "Current", attention: false },
    { id: "inactive", label: "Inactive", attention: false },
  ];

  const SEVERITY = {
    expired: 0,
    expiring: 1,
    "renewal-due": 2,
    suspended: 3,
    "needs-date": 4,
    pending: 5,
    "renewal-filed": 6,
    current: 7,
    inactive: 8,
  };

  const GROUPS = {
    attention: (status) => status.attention,
    expired: (status) => status.id === "expired",
    expiring: (status) => status.id === "expiring" || status.id === "renewal-due",
    current: (status) => status.id === "current" || status.id === "renewal-filed",
    "needs-date": (status) => status.id === "needs-date",
    pending: (status) => status.id === "pending",
    suspended: (status) => status.id === "suspended",
    inactive: (status) => status.id === "inactive",
  };

  const DEFAULT_REMINDERS = { state: 90, pharmacist: 60, technician: 60, accreditation: 180 };
  const YES_NO = ["", "yes", "no"];
  const TELEMEDICINE = ["", "yes", "no", "asynchronous"];

  const LIMITS = {
    name: 200,
    holder: 200,
    number: 200,
    issuer: 200,
    owner: 120,
    notes: 2000,
    profileId: 40,
    jurisdiction: 40,
    phone: 40,
    applied: 120,
    controlled: 200,
    licenseType: 80,
  };

  const STATE_NAMES = [
    ["AL", "Alabama"],
    ["AK", "Alaska"],
    ["AZ", "Arizona"],
    ["AR", "Arkansas"],
    ["CA", "California"],
    ["CO", "Colorado"],
    ["CT", "Connecticut"],
    ["DE", "Delaware"],
    ["DC", "Washington DC"],
    ["FL", "Florida"],
    ["GA", "Georgia"],
    ["HI", "Hawaii"],
    ["ID", "Idaho"],
    ["IL", "Illinois"],
    ["IN", "Indiana"],
    ["IA", "Iowa"],
    ["KS", "Kansas"],
    ["KY", "Kentucky"],
    ["LA", "Louisiana"],
    ["ME", "Maine"],
    ["MD", "Maryland"],
    ["MA", "Massachusetts"],
    ["MI", "Michigan"],
    ["MN", "Minnesota"],
    ["MS", "Mississippi"],
    ["MO", "Missouri"],
    ["MT", "Montana"],
    ["NE", "Nebraska"],
    ["NV", "Nevada"],
    ["NH", "New Hampshire"],
    ["NJ", "New Jersey"],
    ["NM", "New Mexico"],
    ["NY", "New York"],
    ["NC", "North Carolina"],
    ["ND", "North Dakota"],
    ["OH", "Ohio"],
    ["OK", "Oklahoma"],
    ["OR", "Oregon"],
    ["PA", "Pennsylvania"],
    ["RI", "Rhode Island"],
    ["SC", "South Carolina"],
    ["SD", "South Dakota"],
    ["TN", "Tennessee"],
    ["TX", "Texas"],
    ["UT", "Utah"],
    ["VT", "Vermont"],
    ["VA", "Virginia"],
    ["WA", "Washington"],
    ["WV", "West Virginia"],
    ["WI", "Wisconsin"],
    ["WY", "Wyoming"],
    ["AS", "American Samoa"],
    ["GU", "Guam"],
    ["MP", "Northern Mariana Islands"],
    ["PR", "Puerto Rico"],
    ["VI", "U.S. Virgin Islands"],
  ];

  const JURISDICTIONS = [["", "Choose"], ["Federal", "Federal"], ["National", "National"], ...STATE_NAMES];

  function cleanText(value, max) {
    if (typeof value !== "string") return "";
    return value.replace(/\r\n?/g, "\n").slice(0, max);
  }

  function cleanLine(value, max) {
    return cleanText(typeof value === "string" ? value : "", max).replace(/\n/g, " ").trim();
  }

  function cleanDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
    const [year, month, day] = value.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return "";
    return value;
  }

  function cleanLead(value) {
    if (value == null || value === "") return null;
    const number = typeof value === "number" ? value : Number(String(value).trim());
    if (!Number.isFinite(number)) return null;
    return Math.max(0, Math.min(LEAD_MAX, Math.round(number)));
  }

  function cleanRequiredLead(value, fallback) {
    const lead = cleanLead(value);
    return lead == null ? fallback : lead;
  }

  function choice(list, value, fallback) {
    return list.some((entry) => entry.id === value) ? value : fallback;
  }

  function newId() {
    return crypto.randomUUID();
  }

  function rowId(raw) {
    return raw && typeof raw.id === "string" && raw.id.trim() ? raw.id.trim().slice(0, 80) : newId();
  }

  function cleanJurisdiction(value) {
    const text = cleanLine(value, LIMITS.jurisdiction);
    if (!text) return "";
    const alias = {
      "washington dc": "DC",
      "washington d.c.": "DC",
      "district of columbia": "DC",
      "d.c.": "DC",
    }[text.toLowerCase()];
    if (alias) return alias;
    const byId = JURISDICTIONS.find(([id]) => id && id.toLowerCase() === text.toLowerCase());
    if (byId) return byId[0];
    const byLabel = JURISDICTIONS.find(([, label]) => label.toLowerCase() === text.toLowerCase());
    if (byLabel && byLabel[0]) return byLabel[0];
    return text;
  }

  function flagValue(value, allowed) {
    const text = cleanLine(typeof value === "string" ? value : "", 40).toLowerCase();
    if (text === "y" || text === "yes") return allowed.includes("yes") ? "yes" : "";
    if (text === "n" || text === "no") return "no";
    if ((text === "asynchronous" || text === "async") && allowed.includes("asynchronous")) return "asynchronous";
    return allowed.includes(text) ? text : "";
  }

  function breakdownStates() {
    return STATE_NAMES.filter(([code]) => !["AS", "GU", "MP", "PR", "VI"].includes(code));
  }

  function jurisdictionLabel(value) {
    if (!value) return "";
    const found = JURISDICTIONS.find(([id]) => id === value);
    return found ? found[1] : value;
  }

  function kindLabel(value) {
    const found = KINDS.find((entry) => entry.id === value);
    return found ? found.label : "";
  }

  function defaultSettings() {
    return { reminderDays: { ...DEFAULT_REMINDERS } };
  }

  function normalizeSettings(raw) {
    const source = raw && typeof raw === "object" && raw.reminderDays && typeof raw.reminderDays === "object" ? raw.reminderDays : {};
    const reminderDays = {};
    for (const kind of KINDS) reminderDays[kind.id] = cleanRequiredLead(source[kind.id], DEFAULT_REMINDERS[kind.id]);
    return { reminderDays };
  }

  function normalizeRecord(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const kind = choice(KINDS, raw.kind, "state");
    return {
      id: rowId(raw),
      kind,
      name: cleanLine(raw.name, LIMITS.name),
      holder: cleanLine(raw.holder, LIMITS.holder),
      jurisdiction: cleanJurisdiction(raw.jurisdiction),
      number: cleanLine(raw.number, LIMITS.number),
      issuer: cleanLine(raw.issuer, LIMITS.issuer),
      posture: choice(POSTURES, raw.posture, "active"),
      role: choice(ROLES, raw.role, ""),
      profileId: cleanLine(raw.profileId, LIMITS.profileId),
      licenseType: cleanLine(raw.licenseType, LIMITS.licenseType),
      phone: cleanLine(raw.phone, LIMITS.phone),
      telemedicine: flagValue(raw.telemedicine, TELEMEDICINE),
      reciprocity: flagValue(raw.reciprocity, YES_NO),
      sos: flagValue(raw.sos, YES_NO),
      residentAgent: flagValue(raw.residentAgent, YES_NO),
      applied: cleanLine(raw.applied, LIMITS.applied),
      controlled: cleanLine(raw.controlled, LIMITS.controlled),
      controlledExpires: cleanDate(typeof raw.controlledExpires === "string" ? raw.controlledExpires : ""),
      issued: cleanDate(typeof raw.issued === "string" ? raw.issued : ""),
      expires: cleanDate(typeof raw.expires === "string" ? raw.expires : ""),
      renewed: cleanDate(typeof raw.renewed === "string" ? raw.renewed : ""),
      renewalStart: cleanDate(typeof raw.renewalStart === "string" ? raw.renewalStart : ""),
      renewalSubmitted: cleanDate(typeof raw.renewalSubmitted === "string" ? raw.renewalSubmitted : ""),
      verified: cleanDate(typeof raw.verified === "string" ? raw.verified : ""),
      reminderDays: cleanLead(raw.reminderDays),
      owner: cleanLine(raw.owner, LIMITS.owner),
      notes: cleanText(typeof raw.notes === "string" ? raw.notes : "", LIMITS.notes).trim(),
    };
  }

  function templateRow(seed) {
    return normalizeRecord({ posture: "active", reminderDays: null, holder: "", number: "", issued: "", expires: "", verified: "", owner: "", role: "", profileId: "", ...seed });
  }

  function stateShell() {
    return breakdownStates().map(([code]) => templateRow({
      id: `shell-${code}`,
      kind: "state",
      name: "Pharmacy license",
      jurisdiction: code,
      issuer: "State board of pharmacy",
    }));
  }

  function templateRecords() {
    return stateShell();
  }

  function blankRecord(kind) {
    const safeKind = choice(KINDS, kind, "state");
    const names = {
      state: "Pharmacy license",
      pharmacist: "Pharmacist license",
      technician: "Pharmacy technician",
      accreditation: "Accreditation",
    };
    return normalizeRecord({
      kind: safeKind,
      name: names[safeKind],
      issuer: safeKind === "accreditation" ? "" : safeKind === "technician" ? "" : "State board of pharmacy",
      jurisdiction: safeKind === "accreditation" ? "National" : "",
      posture: "active",
    });
  }

  function initialPlan(saved) {
    if (saved == null) return { records: stateShell(), settings: defaultSettings() };
    const records = Array.isArray(saved.records) ? saved.records.map(normalizeRecord).filter(Boolean) : [];
    const settings = normalizeSettings(saved.settings);
    const retired = records.length > 0 && records.every((record) => record.id.startsWith("tpl-"));
    if ((saved.version == null || saved.version === 1) && retired) return { records: stateShell(), settings };
    if (saved.version == null && !Array.isArray(saved.records)) return { records: stateShell(), settings };
    return { records, settings };
  }

  function planFromStorage(data) {
    if (!data || typeof data !== "object" || Array.isArray(data)) return { ok: false, error: "Saved matrix could not be read." };
    if (data.licenseMatrix != null && data.licenseMatrix !== "credentials") return { ok: false, error: "Saved matrix could not be read." };
    return { ok: true, plan: initialPlan(data) };
  }

  function reminderLead(record, settings) {
    if (record.reminderDays != null) return record.reminderDays;
    const defaults = normalizeSettings(settings).reminderDays;
    return defaults[record.kind] ?? DEFAULT_REMINDERS.state;
  }

  function daysUntil(expires, today) {
    const end = cleanDate(expires);
    const start = cleanDate(today);
    if (!end || !start) return null;
    const from = Date.parse(`${start}T00:00:00Z`);
    const to = Date.parse(`${end}T00:00:00Z`);
    return Math.round((to - from) / 86400000);
  }

  function drivingExpiration(record) {
    const license = record.expires || "";
    const controlled = record.controlledExpires || "";
    if (license && controlled) {
      return controlled < license ? { date: controlled, source: "controlled" } : { date: license, source: "license" };
    }
    if (controlled) return { date: controlled, source: "controlled" };
    if (license) return { date: license, source: "license" };
    return { date: "", source: "" };
  }

  function statusOf(record, today, settings) {
    const lead = reminderLead(record, settings);
    const drive = drivingExpiration(record);
    const days = drive.date ? daysUntil(drive.date, today) : null;
    let id = "current";
    if (record.posture === "inactive") id = "inactive";
    else if (record.posture === "suspended") id = "suspended";
    else if (!drive.date) id = record.posture === "pending" ? "pending" : "needs-date";
    else if (days < 0) id = "expired";
    else if (record.posture === "pending") id = "pending";
    else if (record.posture === "renewal-filed") id = days <= lead ? "renewal-due" : "renewal-filed";
    else if (days <= lead) id = "expiring";
    const meta = STATUSES.find((entry) => entry.id === id);
    const attention = id === "needs-date" ? record.posture === "renewal-filed" : meta.attention;
    return {
      id,
      label: meta.label,
      attention,
      days,
      lead,
      source: drive.source,
      date: drive.date,
      usesDefault: record.reminderDays == null,
    };
  }

  function dayWord(days) {
    const value = Math.abs(days);
    return `${value} day${value === 1 ? "" : "s"}`;
  }

  function attentionLine(record, status) {
    const controlled = status.source === "controlled";
    if (status.id === "expired") {
      if (status.days === 0) return controlled ? "Controlled substance expired today" : "Expired today";
      return controlled ? `Controlled substance expired ${dayWord(status.days)} ago` : `Expired ${dayWord(status.days)} ago`;
    }
    if (status.id === "expiring") {
      if (status.days === 0) return controlled ? "Controlled substance expires today" : "Expires today";
      return controlled ? `Controlled substance expires in ${dayWord(status.days)}` : `Expires in ${dayWord(status.days)}`;
    }
    if (status.id === "renewal-due") {
      const when = status.days === 0 ? "expires today" : `expires in ${dayWord(status.days)}`;
      return controlled ? `Renewal filed · controlled substance ${when}` : `Renewal filed · ${when}`;
    }
    if (status.id === "suspended") {
      if (status.days == null) return "Suspended";
      if (status.days < 0) return `Suspended · expired ${dayWord(status.days)} ago`;
      if (status.days === 0) return "Suspended · expires today";
      return `Suspended · expires in ${dayWord(status.days)}`;
    }
    if (status.id === "needs-date" && status.attention) return "Renewal filed, with no expiration date";
    return "";
  }

  function daysLabel(days) {
    if (days == null) return "—";
    if (days === 0) return "Today";
    if (days > 0) return dayWord(days);
    return `${dayWord(days)} overdue`;
  }

  function holderLabel(record) {
    const pic = record.kind === "pharmacist" && record.role === "pic";
    if (record.holder && pic) return `${record.holder} · PIC`;
    return record.holder || "";
  }

  function alertTitle(record, status) {
    const parts = [record.name || "New credential"];
    if (record.jurisdiction) parts.push(jurisdictionLabel(record.jurisdiction));
    if (record.holder) parts.push(record.holder);
    if (record.number) parts.push(record.number);
    return `${parts.join(" · ")} — ${attentionLine(record, status)}`;
  }

  function compareRows(left, right) {
    const severity = SEVERITY[left.status.id] - SEVERITY[right.status.id];
    if (severity) return severity;
    const leftDays = left.status.days == null ? 99999 : left.status.days;
    const rightDays = right.status.days == null ? 99999 : right.status.days;
    if (leftDays !== rightDays) return leftDays - rightDays;
    const kind = left.record.kind.localeCompare(right.record.kind);
    if (kind) return kind;
    const name = left.record.name.localeCompare(right.record.name);
    if (name) return name;
    return left.record.holder.localeCompare(right.record.holder) || left.record.id.localeCompare(right.record.id);
  }

  function haystack(record) {
    return [
      record.name,
      record.holder,
      holderLabel(record),
      record.number,
      record.issuer,
      record.owner,
      record.notes,
      record.profileId,
      record.controlled,
      record.phone,
      record.applied,
      record.licenseType,
      record.jurisdiction,
      jurisdictionLabel(record.jurisdiction),
      kindLabel(record.kind),
    ].join("\n").toLowerCase();
  }

  function isPristine(records) {
    return records.length > 0 && records.every((record) => (
      !record.number && !record.expires && !record.controlled && !record.controlledExpires &&
      !record.issued && !record.holder && !record.owner && !record.notes && !record.applied && !record.phone &&
      !record.renewed && !record.renewalStart && !record.renewalSubmitted && !record.verified &&
      !record.telemedicine && !record.reciprocity && !record.sos && !record.residentAgent &&
      !record.profileId && !record.licenseType &&
      record.posture === "active" && record.reminderDays == null
    ));
  }

  function compareDirectory(left, right) {
    const rank = { state: 0, pharmacist: 1, technician: 2, accreditation: 3 };
    const kind = (rank[left.record.kind] ?? 9) - (rank[right.record.kind] ?? 9);
    if (kind) return kind;
    const state = jurisdictionLabel(left.record.jurisdiction).localeCompare(jurisdictionLabel(right.record.jurisdiction));
    if (state) return state;
    return left.record.holder.localeCompare(right.record.holder) || left.record.name.localeCompare(right.record.name) || left.record.id.localeCompare(right.record.id);
  }

  function urgentView(view) {
    return view.group === "attention" || view.group === "expired" || view.group === "expiring" || view.group === "suspended" ||
      view.status === "expired" || view.status === "expiring" || view.status === "renewal-due" || view.status === "suspended";
  }

  function matrixRows(records, today, settings, filter) {
    const view = filter || {};
    let rows = (records || []).map((record) => ({ record, status: statusOf(record, today, settings) }));
    if (view.kind) rows = rows.filter((row) => row.record.kind === view.kind);
    if (view.group && GROUPS[view.group]) rows = rows.filter((row) => GROUPS[view.group](row.status));
    else if (view.status) rows = rows.filter((row) => row.status.id === view.status);
    const query = String(view.query || "").trim().toLowerCase();
    if (query) rows = rows.filter((row) => haystack(row.record).includes(query));
    rows.sort(urgentView(view) ? compareRows : compareDirectory);
    return rows;
  }

  function alerts(records, today, settings) {
    return matrixRows(records, today, settings, { group: "attention" });
  }

  function summarize(records, today, settings) {
    const rows = (records || []).map((record) => ({ record, status: statusOf(record, today, settings) }));
    const groups = {};
    for (const name of Object.keys(GROUPS)) groups[name] = rows.filter((row) => GROUPS[name](row.status)).length;
    const byKind = { state: 0, pharmacist: 0, technician: 0, accreditation: 0 };
    for (const row of rows) byKind[row.record.kind] += 1;
    return { total: rows.length, groups, byKind };
  }

  function nextExpiration(records, today, settings) {
    const upcoming = (records || [])
      .map((record) => ({ record, status: statusOf(record, today, settings) }))
      .filter((row) => row.record.posture !== "inactive" && row.status.days != null && row.status.days >= 0)
      .sort((left, right) => left.status.days - right.status.days || left.record.name.localeCompare(right.record.name));
    return upcoming[0] || null;
  }

  function duplicateRecord(record) {
    return normalizeRecord({
      ...record,
      id: newId(),
      number: "",
      issued: "",
      expires: "",
      verified: "",
      controlled: "",
      controlledExpires: "",
      renewed: "",
      renewalStart: "",
      renewalSubmitted: "",
      applied: "",
      phone: "",
      telemedicine: "",
      reciprocity: "",
      sos: "",
      residentAgent: "",
      posture: "active",
      jurisdiction: record && (record.kind === "accreditation" || record.kind === "technician") ? record.jurisdiction : "",
    });
  }

  function missingTemplate(records) {
    const have = new Set((records || []).map((record) => record.id));
    return templateRecords().filter((record) => !have.has(record.id));
  }

  function restoreTemplate(records) {
    return (records || []).concat(missingTemplate(records));
  }

  function applyField(record, field, value, trim) {
    const next = { ...record };
    if (field === "kind") next.kind = choice(KINDS, value, record.kind);
    else if (field === "posture") next.posture = choice(POSTURES, value, record.posture);
    else if (field === "role") next.role = choice(ROLES, value, "");
    else if (field === "jurisdiction") next.jurisdiction = cleanJurisdiction(value);
    else if (field === "telemedicine") next.telemedicine = flagValue(value, TELEMEDICINE);
    else if (field === "reciprocity" || field === "sos" || field === "residentAgent") next[field] = flagValue(value, YES_NO);
    else if (field === "issued" || field === "expires" || field === "verified" || field === "controlledExpires" || field === "renewed" || field === "renewalStart" || field === "renewalSubmitted") {
      next[field] = cleanDate(typeof value === "string" ? value : "");
    }
    else if (field === "reminderDays") next.reminderDays = cleanLead(value);
    else if (field === "notes") {
      let notes = cleanText(typeof value === "string" ? value : "", LIMITS.notes);
      if (trim) notes = notes.trim();
      next.notes = notes;
    } else if (LIMITS[field]) {
      let text = cleanText(typeof value === "string" ? value : "", LIMITS[field]).replace(/\n/g, " ");
      if (trim) text = text.trim();
      next[field] = text;
    }
    return next;
  }

  function exportDocument(records, settings) {
    return {
      licenseMatrix: "credentials",
      version: STORAGE_VERSION,
      settings: normalizeSettings(settings),
      records: (records || []).map(normalizeRecord).filter(Boolean),
    };
  }

  function csvCell(value) {
    const text = String(value ?? "");
    const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${safe.replace(/"/g, '""')}"`;
  }

  function toCsv(records, today, settings) {
    const headers = [
      "Status",
      "Kind",
      "Credential",
      "Holder",
      "Role",
      "Jurisdiction",
      "License number",
      "NABP e-Profile ID",
      "Issuer",
      "Issued",
      "Expires",
      "Controlled substance",
      "Controlled expiration",
      "Days remaining",
      "Telemedicine",
      "Reciprocity",
      "SOS",
      "Resident agent",
      "Board phone",
      "Applied",
      "Renewed on",
      "Renewal start",
      "Renewal submitted",
      "License type",
      "Reminder lead days",
      "Reminder override",
      "Owner",
      "Last verified",
      "Posture",
      "Notes",
    ];
    const lines = [headers.map(csvCell).join(",")];
    for (const row of matrixRows(records, today, settings, {})) {
      const record = row.record;
      const posture = POSTURES.find((entry) => entry.id === record.posture);
      const role = ROLES.find((entry) => entry.id === record.role);
      lines.push([
        row.status.label,
        kindLabel(record.kind),
        record.name,
        record.holder,
        record.kind === "pharmacist" ? role.label : "",
        jurisdictionLabel(record.jurisdiction),
        record.number,
        record.kind === "pharmacist" ? record.profileId : "",
        record.issuer,
        record.issued,
        record.expires,
        record.controlled,
        record.controlledExpires,
        row.status.days == null ? "" : String(row.status.days),
        record.telemedicine,
        record.reciprocity,
        record.sos,
        record.residentAgent,
        record.phone,
        record.applied,
        record.renewed,
        record.renewalStart,
        record.renewalSubmitted,
        record.licenseType,
        String(row.status.lead),
        record.reminderDays == null ? "" : String(record.reminderDays),
        record.owner,
        record.verified,
        posture ? posture.label : "",
        record.notes,
      ].map(csvCell).join(","));
    }
    return lines.join("\r\n");
  }

  function parseImport(text) {
    if (typeof text !== "string" || !text.trim()) return { ok: false, error: "That file is empty." };
    if (text.length > MAX_IMPORT_CHARS) return { ok: false, error: "That file is too large." };
    let data;
    try {
      data = JSON.parse(text);
    } catch (error) {
      return { ok: false, error: "That file is not valid JSON." };
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) return { ok: false, error: "That file is not a license matrix backup." };
    if (data.pocket === "work-tracker") return { ok: false, error: "That file is a roadmap backup, not a license matrix." };
    if (data.licenseMatrix != null && data.licenseMatrix !== "credentials") return { ok: false, error: "That file is not a license matrix backup." };
    if (!Array.isArray(data.records)) return { ok: false, error: "That file has no credential list." };
    if (data.records.length > MAX_RECORDS) return { ok: false, error: "That file has more credentials than this matrix can hold." };
    const records = [];
    const seen = new Set();
    for (const raw of data.records) {
      const record = normalizeRecord(raw);
      if (!record) return { ok: false, error: "That file has a credential that could not be read." };
      if (seen.has(record.id)) record.id = newId();
      seen.add(record.id);
      records.push(record);
    }
    return { ok: true, records, settings: normalizeSettings(data.settings) };
  }

  function localToday(now) {
    const date = now instanceof Date ? now : new Date();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${month}-${day}`;
  }

  function formatLong(iso) {
    const value = cleanDate(iso);
    if (!value) return "";
    const [year, month, day] = value.split("-").map(Number);
    return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day)));
  }

  return {
    STORAGE_KEY,
    STORAGE_VERSION,
    MAX_RECORDS,
    LEAD_MAX,
    KINDS,
    POSTURES,
    ROLES,
    YES_NO,
    TELEMEDICINE,
    STATUSES,
    GROUPS,
    JURISDICTIONS,
    DEFAULT_REMINDERS,
    LIMITS,
    templateRecords,
    stateShell,
    breakdownStates,
    drivingExpiration,
    defaultSettings,
    normalizeRecord,
    normalizeSettings,
    blankRecord,
    initialPlan,
    planFromStorage,
    reminderLead,
    daysUntil,
    statusOf,
    attentionLine,
    daysLabel,
    holderLabel,
    alertTitle,
    matrixRows,
    alerts,
    summarize,
    nextExpiration,
    duplicateRecord,
    missingTemplate,
    restoreTemplate,
    applyField,
    exportDocument,
    toCsv,
    parseImport,
    jurisdictionLabel,
    kindLabel,
    cleanLead,
    cleanDate,
    cleanJurisdiction,
    localToday,
    formatLong,
    isPristine,
  };
});
