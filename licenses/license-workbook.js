(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.LicenseWorkbook = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const SECRET_HEADERS = /password|username|user name/i;

  function bytesOf(input) {
    const source = input instanceof Uint8Array ? input : new Uint8Array(input);
    const copy = new Uint8Array(source.byteLength);
    copy.set(source);
    return copy;
  }

  function findEocd(view) {
    const start = Math.max(0, view.length - 22 - 65535);
    for (let index = view.length - 22; index >= start; index -= 1) {
      if (view[index] === 0x50 && view[index + 1] === 0x4b && view[index + 2] === 0x05 && view[index + 3] === 0x06) return index;
    }
    return -1;
  }

  async function readZip(input, inflateRaw) {
    const view = bytesOf(input);
    const eocd = findEocd(view);
    if (eocd < 0) throw new Error("not a zip");
    const data = new DataView(view.buffer);
    const count = data.getUint16(eocd + 10, true);
    let pointer = data.getUint32(eocd + 16, true);
    const entries = [];
    for (let index = 0; index < count; index += 1) {
      if (data.getUint32(pointer, true) !== 0x02014b50) throw new Error("bad directory");
      const nameLength = data.getUint16(pointer + 28, true);
      const extraLength = data.getUint16(pointer + 30, true);
      const commentLength = data.getUint16(pointer + 32, true);
      const name = new TextDecoder().decode(view.subarray(pointer + 46, pointer + 46 + nameLength));
      entries.push({
        name,
        localOffset: data.getUint32(pointer + 42, true),
        method: data.getUint16(pointer + 10, true),
        size: data.getUint32(pointer + 20, true),
      });
      pointer += 46 + nameLength + extraLength + commentLength;
    }
    const files = {};
    for (const entry of entries) {
      const local = entry.localOffset;
      if (data.getUint32(local, true) !== 0x04034b50) throw new Error("bad local header");
      const method = entry.method;
      const size = entry.size;
      if (size === 0xffffffff) throw new Error("unsupported zip64");
      const nameLength = data.getUint16(local + 26, true);
      const extraLength = data.getUint16(local + 28, true);
      const start = local + 30 + nameLength + extraLength;
      const compressed = view.subarray(start, start + size);
      let inflated;
      if (method === 0) inflated = compressed;
      else if (method === 8) inflated = await inflateRaw(compressed);
      else throw new Error("unsupported compression");
      files[entry.name] = inflated instanceof Uint8Array ? inflated : new Uint8Array(inflated);
    }
    return files;
  }

  function xmlText(bytes) {
    return new TextDecoder().decode(bytes);
  }

  function decodeXml(text) {
    return String(text)
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, "\"")
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (match, code) => String.fromCharCode(Number(code)))
      .replace(/&amp;/g, "&");
  }

  function sharedStrings(xml) {
    const strings = [];
    const blocks = xml.split(/<si\b[^>]*>/).slice(1);
    for (const block of blocks) {
      const body = block.split("</si>")[0];
      const texts = [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((match) => decodeXml(match[1]));
      strings.push(texts.join(""));
    }
    return strings;
  }

  function columnIndex(ref) {
    const letters = String(ref || "").replace(/\d+/g, "");
    let index = 0;
    for (const char of letters) index = index * 26 + (char.charCodeAt(0) - 64);
    return index;
  }

  function sheetCells(xml, strings) {
    const cells = new Map();
    const pattern = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let match = pattern.exec(xml);
    while (match) {
      const attrs = match[1];
      const body = match[2] || "";
      const ref = (attrs.match(/\br="([^"]+)"/) || [])[1];
      if (ref && body) {
        const type = (attrs.match(/\bt="([^"]+)"/) || [])[1] || "";
        const valueMatch = body.match(/<v>([\s\S]*?)<\/v>/);
        const inline = [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((item) => decodeXml(item[1])).join("");
        let value = "";
        if (type === "s" && valueMatch) value = strings[Number(valueMatch[1])] || "";
        else if (type === "inlineStr") value = inline;
        else if (valueMatch) value = decodeXml(valueMatch[1]);
        if (value !== "") cells.set(ref, value);
      }
      match = pattern.exec(xml);
    }
    return cells;
  }

  function rowsFromCells(cells) {
    const rows = new Map();
    for (const [ref, value] of cells) {
      const rowNumber = Number(String(ref).replace(/[A-Z]+/g, ""));
      if (!rows.has(rowNumber)) rows.set(rowNumber, new Map());
      rows.get(rowNumber).set(columnIndex(ref), value);
    }
    return [...rows.entries()].sort((left, right) => left[0] - right[0]);
  }

  function headerName(value) {
    const text = String(value || "").trim();
    if (!text || SECRET_HEADERS.test(text)) return "";
    const name = text.toLowerCase();
    if (name.includes("technician") || name.includes("pharmacist name")) return "holder";
    if (name === "rpg" || name === "abbv." || name === "state") return "state";
    if (name.includes("license type")) return "licenseType";
    if (name.includes("license number") || name === "license") return "number";
    if (name.includes("renewal start")) return "renewalStart";
    if (name.includes("renewal submitted")) return "renewalSubmitted";
    if (name.includes("renewed")) return "renewed";
    if (name.includes("exp")) return "expires";
    if (name.includes("phone")) return "phone";
    if (name.includes("tele")) return "telemedicine";
    if (name.includes("recip")) return "reciprocity";
    if (name === "sos") return "sos";
    if (name.includes("resident")) return "residentAgent";
    if (name.includes("applied")) return "applied";
    if (name.includes("dea") || name.includes("controlled")) return "controlled";
    if (name === "issued") return "issued";
    if (name.includes("note")) return "notes";
    return "";
  }

  function tableFromSheet(xml, strings) {
    const rows = rowsFromCells(sheetCells(xml, strings));
    let header = null;
    let headerIndex = -1;
    for (const [index, row] of rows) {
      const labels = [...row.values()].map(headerName).filter(Boolean);
      if (labels.includes("number") && (labels.includes("state") || labels.includes("holder") || labels.includes("expires"))) {
        header = row;
        headerIndex = index;
        break;
      }
    }
    if (!header) return [];
    const columns = new Map();
    for (const [column, value] of header) {
      const key = headerName(value);
      if (key) columns.set(column, key);
    }
    const records = [];
    for (const [index, row] of rows) {
      if (index <= headerIndex) continue;
      const record = {};
      for (const [column, key] of columns) {
        if (row.has(column)) record[key] = row.get(column);
      }
      if (Object.values(record).some((value) => String(value || "").trim())) records.push(record);
    }
    return records;
  }

  function workbookSheets(files) {
    const workbook = xmlText(files["xl/workbook.xml"] || new Uint8Array());
    const rels = xmlText(files["xl/_rels/workbook.xml.rels"] || new Uint8Array());
    const targets = new Map();
    for (const match of rels.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)) targets.set(match[1], match[2]);
    const sheets = [];
    for (const match of workbook.matchAll(/<sheet\b[^>]*>/g)) {
      const tag = match[0];
      const name = decodeXml((tag.match(/\bname="([^"]*)"/) || [])[1] || "");
      const id = (tag.match(/\br:id="([^"]+)"/) || [])[1];
      const target = targets.get(id) || "";
      const path = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\//, "")}`;
      sheets.push({ name, path });
    }
    return sheets;
  }

  function sheetKind(name) {
    const text = name.trim().toLowerCase();
    if (text.includes("out of state")) return "states";
    if (text.includes("pharmacist")) return "pharmacists";
    if (text.includes("tech")) return "technicians";
    return "";
  }

  function excelSerial(value) {
    const number = Number(String(value).trim());
    if (!Number.isFinite(number) || number < 20000 || number > 80000) return "";
    return new Date(Date.UTC(1899, 11, 30) + number * 86400000).toISOString().slice(0, 10);
  }

  function datesIn(value) {
    const text = String(value || "").trim();
    if (!text) return [];
    if (/^\d+(\.\d+)?$/.test(text)) {
      const serial = excelSerial(text);
      return serial ? [serial] : [];
    }
    const found = [];
    for (const match of text.matchAll(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/g)) {
      let year = Number(match[3]);
      if (year < 100) year += 2000;
      const iso = `${year}-${String(Number(match[1])).padStart(2, "0")}-${String(Number(match[2])).padStart(2, "0")}`;
      if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) found.push(iso);
    }
    return found.sort();
  }

  function plainNumber(value) {
    const text = String(value ?? "").trim();
    if (/^\d+\.0$/.test(text)) return text.slice(0, -2);
    if (/e/i.test(text) && Number.isFinite(Number(text)) && Number.isInteger(Number(text))) return String(Number(text));
    return text;
  }

  function knownState(model, value) {
    const code = model.cleanJurisdiction(value);
    return model.JURISDICTIONS.some(([id]) => id && id === code) ? code : "";
  }

  function mapTables(tables, model) {
    const records = [];
    for (const row of tables.states || []) {
      const jurisdiction = knownState(model, row.state);
      if (!jurisdiction) continue;
      const controlledDates = datesIn(row.controlled);
      const expirationDates = datesIn(row.expires);
      records.push(model.normalizeRecord({
        id: uniqueId(records, `shell-${jurisdiction}`),
        kind: "state",
        name: "Pharmacy license",
        jurisdiction,
        issuer: "State board of pharmacy",
        number: plainNumber(row.number),
        phone: row.phone || "",
        telemedicine: row.telemedicine || "",
        reciprocity: row.reciprocity || "",
        sos: row.sos || "",
        residentAgent: row.residentAgent || "",
        applied: appliedText(row.applied),
        controlled: plainNumber(row.controlled),
        controlledExpires: controlledDates.length ? controlledDates[controlledDates.length - 1] : "",
        issued: datesIn(row.issued)[0] || "",
        expires: expirationDates[0] || "",
        renewed: datesIn(row.renewed)[0] || "",
        notes: row.notes || "",
      }));
    }
    let pharmacistIndex = 0;
    for (const row of tables.pharmacists || []) {
      const jurisdiction = knownState(model, row.state);
      const number = plainNumber(row.number);
      const holder = String(row.holder || "").trim();
      if (!jurisdiction || (!holder && !number)) continue;
      const expirationDates = datesIn(row.expires);
      pharmacistIndex += 1;
      const id = uniqueId(records, `pharmacist-${jurisdiction}-${pharmacistIndex}`);
      records.push(model.normalizeRecord({
        id,
        kind: "pharmacist",
        name: "Pharmacist license",
        holder,
        jurisdiction,
        issuer: "State board of pharmacy",
        number,
        expires: expirationDates[0] || "",
        notes: dateNote(row.expires, expirationDates),
      }));
    }
    let technicianIndex = 0;
    for (const row of tables.technicians || []) {
      const holder = String(row.holder || "").trim();
      const number = plainNumber(row.number);
      if (!holder && !number) continue;
      technicianIndex += 1;
      const licenseType = String(row.licenseType || "").trim();
      records.push(model.normalizeRecord({
        id: `technician-${technicianIndex}`,
        kind: "technician",
        name: /train/i.test(licenseType) ? "Technician in training" : "Pharmacy technician",
        holder,
        licenseType,
        number,
        expires: datesIn(row.expires)[0] || "",
        renewalStart: datesIn(row.renewalStart)[0] || "",
        renewalSubmitted: datesIn(row.renewalSubmitted)[0] || "",
        notes: row.notes || "",
      }));
    }
    return records;
  }

  function uniqueId(records, id) {
    if (!records.some((record) => record.id === id)) return id;
    return `${id}-${records.length}`;
  }

  function dateNote(value, dates) {
    const text = String(value || "").trim();
    if (!text || !dates.length || /^\d+(\.\d+)?$/.test(text)) return "";
    let rest = text;
    for (const match of text.matchAll(/\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/g)) rest = rest.replace(match[0], " ");
    return /[A-Za-z]/.test(rest) ? text : "";
  }

  function appliedText(value) {
    const text = String(value || "").trim();
    const dates = datesIn(text);
    if (!text) return "";
    if (dates.length === 1 && /^\d+(\.\d+)?$/.test(text)) return dates[0];
    return text;
  }

  async function recordsFromXlsx(input, inflateRaw, model) {
    let files;
    try {
      files = await readZip(input, inflateRaw);
    } catch (error) {
      return { ok: false, error: "That file could not be read as a workbook." };
    }
    let sheets;
    try {
      const strings = sharedStrings(xmlText(files["xl/sharedStrings.xml"] || new Uint8Array()));
      sheets = workbookSheets(files);
      const tables = { states: [], pharmacists: [], technicians: [] };
      for (const sheet of sheets) {
        const kind = sheetKind(sheet.name);
        if (!kind || !files[sheet.path]) continue;
        tables[kind] = tableFromSheet(xmlText(files[sheet.path]), strings);
      }
      const records = mapTables(tables, model);
      if (!records.length) return { ok: false, error: "That workbook has no state, pharmacist, or technician rows." };
      if (records.length > model.MAX_RECORDS) return { ok: false, error: "That workbook has more credentials than this matrix can hold." };
      return { ok: true, records };
    } catch (error) {
      return { ok: false, error: "That workbook could not be read." };
    }
  }

  return { recordsFromXlsx, mapTables, excelSerial, datesIn };
});
