const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../tracker-model');

test('weeks start on Monday across month and year boundaries', () => {
  assert.equal(model.weekStart('2026-11-08'), '2026-11-02');
  assert.equal(model.weekStart('2026-11-09'), '2026-11-09');
  assert.equal(model.weekStart('2027-01-01'), '2026-12-28');
  assert.equal(model.weekStart('2026-02-30'), '');
});

test('weekly reviews and commitment snapshots survive export and import without changing priorities or undated notes', () => {
  const projects = [model.normalizeItem({ id: 'first', title: 'Sunset Redlime', notes: 'Undated call note', summary: '17K support', size: 'large', review: true,
    reviewedWeeks: ['2026-11-09', '2026-11-10', 'invalid'], owner: 'Jeremy', nextStep: 'Capture outcome', targetDate: '2026-11-09',
    journal: [{ id: 'entry', createdAt: '2026-11-09T15:00:00Z', body: 'Engineering call', decision: 'Accept fax', nextStep: 'Follow up', owner: 'Jeremy', due: '2026-11-16' }] }),
    model.normalizeItem({ id: 'second', title: 'Inventory Initiative', checklist: [{text: 'Get Insights', done: true}] })];
  const imported = model.parseImport(JSON.stringify(model.exportDocument(projects)));
  assert.equal(imported.ok, true);
  const first = imported.items[0];
  assert.equal(first.id, 'first');
  assert.equal(imported.items[1].id, 'second');
  assert.deepEqual(first.reviewedWeeks, ['2026-11-09']);
  assert.equal(first.notes, 'Undated call note');
  assert.equal(first.size, 'large');
  assert.equal(first.review, true);
  assert.equal(first.journal[0].decision, 'Accept fax');
  assert.equal(first.journal[0].due, '2026-11-16');
  assert.equal(first.journal[0].owner, 'Jeremy');
  assert.equal(first.journal[0].nextStep, 'Follow up');
  assert.equal(imported.items[1].checklist[0].done, true);
  assert.deepEqual(imported.items[1].reviewedWeeks, []);
});
