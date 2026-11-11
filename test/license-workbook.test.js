const test = require("node:test");
const assert = require("node:assert/strict");
const zlib = require("node:zlib");
const model = require("../licenses/license-model");
const workbook = require("../licenses/license-workbook");

function inflateRaw(bytes) {
  return zlib.inflateRawSync(Buffer.from(bytes));
}

function zip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const fileName = Buffer.from(name);
    const raw = Buffer.from(text);
    const compressed = zlib.deflateRawSync(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(fileName.length, 26);
    const descriptor = Buffer.alloc(16);
    descriptor.writeUInt32LE(0x08074b50, 0);
    descriptor.writeUInt32LE(compressed.length, 8);
    descriptor.writeUInt32LE(raw.length, 12);
    const localHeader = Buffer.concat([local, fileName, compressed, descriptor]);
    chunks.push(localHeader);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(8, 10);
    dir.writeUInt32LE(compressed.length, 20);
    dir.writeUInt32LE(raw.length, 24);
    dir.writeUInt16LE(fileName.length, 28);
    dir.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([dir, fileName]));
    offset += localHeader.length;
  }
  const directory = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(files).length, 8);
  eocd.writeUInt16LE(Object.keys(files).length, 10);
  eocd.writeUInt32LE(directory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, directory, eocd]);
}

function workbookXml() {
  return {
    "[Content_Types].xml": "<Types></Types>",
    "_rels/.rels": "<Relationships></Relationships>",
    "xl/workbook.xml": '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Out of State License Breakdown" sheetId="1" r:id="rId1"/><sheet name="Pharmacists" sheetId="2" r:id="rId2"/><sheet name="Pharmacy Techs" sheetId="3" r:id="rId3"/><sheet name="John License" sheetId="4" r:id="rId4"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels": '<Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="worksheet" Target="worksheets/sheet3.xml"/><Relationship Id="rId4" Type="worksheet" Target="worksheets/sheet4.xml"/></Relationships>',
    "xl/sharedStrings.xml": "<sst><si><t>State</t></si><si><t>License Number</t></si><si><t>Exp Date</t></si><si><t>DEA / CONTROLLED</t></si><si><t>Password</t></si><si><t>Username</t></si><si><t>Texas</t></si><si><t>NR-000000</t></si><si><t>CS-000000 EXP 12/1/2026</t></si><si><t>hunter2</t></si><si><t>portal-user</t></si><si><t>Pharmacist Name</t></si><si><t>License Expiration</t></si><si><t>Alex Example</t></si><si><t>RPH-000000</t></si><si><t>12/31/2026 (AE)</t></si><si><t>Technician Name</t></si><si><t>License Type</t></si><si><t>Expiration Date</t></si><si><t>Renewal Start Date</t></si><si><t>Renewal Submitted</t></si><si><t>Notes</t></si><si><t>Jamie Example</t></si><si><t>Tech in Training</t></si><si><t>needs a practice exam</t></si><si><t>John License</t></si><si><t>Do not import</t></si></sst>",
    "xl/worksheets/sheet1.xml": '<worksheet><sheetData><row><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c><c r="E1" t="s"><v>4</v></c><c r="F1" t="s"><v>5</v></c></row><row><c r="A2" t="s"><v>6</v></c><c r="B2" t="s"><v>7</v></c><c r="C2"><v>47118</v></c><c r="D2" t="s"><v>8</v></c><c r="E2" t="s"><v>9</v></c><c r="F2" t="s"><v>10</v></c></row></sheetData></worksheet>',
    "xl/worksheets/sheet2.xml": '<worksheet><sheetData><row><c r="A1" t="s"><v>11</v></c><c r="B1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c><c r="D1" t="s"><v>12</v></c></row><row><c r="A2" t="s"><v>13</v></c><c r="B2" t="s"><v>6</v></c><c r="C2" t="s"><v>14</v></c><c r="D2" t="s"><v>15</v></c></row></sheetData></worksheet>',
    "xl/worksheets/sheet3.xml": '<worksheet><sheetData><row><c r="A1" t="s"><v>16</v></c><c r="B1" t="s"><v>17</v></c><c r="C1" t="s"><v>1</v></c><c r="D1" t="s"><v>18</v></c><c r="E1" t="s"><v>19</v></c><c r="F1" t="s"><v>20</v></c><c r="G1" t="s"><v>21</v></c></row><row><c r="A2" t="s"><v>22</v></c><c r="B2" t="s"><v>23</v></c><c r="C2"><v>1000.0</v></c><c r="D2"><v>46752</v></c><c r="E2"><v>46692</v></c><c r="F2"><v>46661</v></c><c r="G2" t="s"><v>24</v></c></row></sheetData></worksheet>',
    "xl/worksheets/sheet4.xml": '<worksheet><sheetData><row><c r="A1" t="s"><v>25</v></c><c r="B1" t="s"><v>26</v></c></row></sheetData></worksheet>',
  };
}

test("excel dates and controlled-substance dates are calendar dates", () => {
  assert.equal(workbook.excelSerial("47118"), "2028-12-31");
  assert.deepEqual(workbook.datesIn("CS-000000 EXP 12/1/2026"), ["2026-12-01"]);
  assert.deepEqual(workbook.datesIn("4/18/27"), ["2027-04-18"]);
});

test("a workbook import keeps licenses and drops portal secrets", async () => {
  const result = await workbook.recordsFromXlsx(zip(workbookXml()), inflateRaw, model);
  assert.equal(result.ok, true);
  const dumped = JSON.stringify(result.records);
  assert.equal(dumped.includes("hunter2"), false);
  assert.equal(dumped.includes("portal-user"), false);
  assert.equal(dumped.includes("Do not import"), false);
  const texas = result.records.find((record) => record.kind === "state");
  assert.equal(texas.jurisdiction, "TX");
  assert.equal(texas.number, "NR-000000");
  assert.equal(texas.expires, "2028-12-31");
  assert.equal(texas.controlled, "CS-000000 EXP 12/1/2026");
  assert.equal(texas.controlledExpires, "2026-12-01");
  const pharmacist = result.records.find((record) => record.kind === "pharmacist");
  assert.equal(pharmacist.holder, "Alex Example");
  assert.equal(pharmacist.number, "RPH-000000");
  assert.equal(pharmacist.expires, "2026-12-31");
  assert.match(pharmacist.notes, /AE/);
  const technician = result.records.find((record) => record.kind === "technician");
  assert.equal(technician.holder, "Jamie Example");
  assert.equal(technician.name, "Technician in training");
  assert.equal(technician.number, "1000");
  assert.equal(technician.notes, "needs a practice exam");
  assert.ok(technician.renewalStart);
  assert.ok(technician.renewalSubmitted);
});
