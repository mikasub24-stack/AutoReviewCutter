'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function api() {
  const source = fs.readFileSync(path.join(__dirname, '../extension/popup.js'), 'utf8');
  const code = source.slice(source.indexOf('const CNN ='), source.indexOf('\nlet clusters ='));
  const metadata = {};
  const context = { console, Uint8Array, metaOf: id => metadata[id] || null };
  vm.createContext(context);
  vm.runInContext(code + '\nthis.api={parseItem,computeGroups,makeGroups,numAuto,setCover:(id,value)=>coverSig[id]=value};', context);
  return { ...context.api, metadata };
}
const options = { split: false, rev: true, takeM: false, takeA: false, showT: false, guess: 'Một bộ' };
const id = index => String(7600000000000000000n + BigInt(index));
const video = (index, title = 'Câu chuyện tiếp theo #动画') => ({ url: 'https://www.douyin.com/video/' + id(index), title });
const urls = group => Array.from(group.lines, x => x.url);

test('128 channel videos with four different visual cover families stay one series', () => {
  const a = api(), items = [];
  for (let i = 0; i < 128; i++) {
    a.metadata[id(i)] = { ts: 1000 - i };
    const colour = i < 2 ? 0 : i < 97 ? 80 : i < 117 ? 160 : 240;
    a.setCover(id(i), { s: new Uint8Array(24*32*3).fill(colour), th: 'thumbnail' });
    items.push(a.parseItem(video(i)));
  }
  for (const split of [false, true]) {
    const result = a.computeGroups(items, { ...options, split });
    assert.equal(result.groups.length, 1);
    assert.equal(result.groups[0].lines.length, 128);
    assert.equal(new Set(urls(result.groups[0])).size, 128);
    assert.equal(result.groups[0].lines[0].url, video(127).url);
    assert.match(result.groups[0].lines[0].name, /Tập 001$/);
    assert.match(result.groups[0].lines[127].name, /Tập 128$/);
    assert.equal(result.groups[0].visual, undefined);
  }
});

test('unchecking split is one group even when two official collections exist', () => {
  const a = api(), rows = [];
  for (let i = 0; i < 6; i++) {
    a.metadata[id(i)] = { mix: { id: i < 3 ? '111' : '222', name: i < 3 ? 'A' : 'B', cur: i % 3 + 1, total: 3 } };
    rows.push(a.parseItem(video(i)));
  }
  const result = a.computeGroups(rows, options);
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].lines.length, 6);
  assert.equal(new Set(result.groups[0].lines.map(x => x.name)).size, 6);
});

test('optional split separates actual different collection IDs only', () => {
  const a = api(), rows = [];
  for (let i = 0; i < 6; i++) {
    a.metadata[id(i)] = { mix: { id: i < 3 ? '111' : '222', name: i < 3 ? 'A' : 'B', cur: i % 3 + 1, total: 3 } };
    rows.push(a.parseItem(video(i)));
  }
  const result = a.computeGroups(rows, { ...options, split: true });
  assert.equal(result.groups.length, 2);
  assert.deepEqual(Array.from(result.groups, g => g.lines.length), [3, 3]);
  assert.equal(result.groups.every(g => g.viaApi), true);
});

test('narrative prefixes and chapter resets do not invent extra series or discard URLs', () => {
  const a = api();
  const titles = ['第一段 第1集', '第一段 第2集', '第一段 第3集', '另一段 第1集', '另一段 第2集', '另一段 第3集'];
  const result = a.computeGroups(titles.map((title, i) => a.parseItem(video(i, title))), { ...options, split: true });
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].lines.length, 6);
  assert.equal(new Set(urls(result.groups[0])).size, 6);
  assert.equal(result.groups[0].dups.length, 0);
  assert.deepEqual(Array.from(result.groups[0].duplicateEpisodes), [1, 2, 3]);
});

test('real episode numbers and official ordinal fallback keep original parsing/order', () => {
  const a = api();
  a.metadata[id(1)] = { mix: { id: '111', cur: 9, ord: 2 } };
  a.metadata[id(2)] = { mix: { id: '111', ord: 4 } };
  assert.equal(a.parseItem(video(1, '第5集')).ep, 9);
  assert.equal(a.parseItem(video(2, '第2集')).ep, 4);
  const result = a.computeGroups([a.parseItem(video(1)), a.parseItem(video(2))], options);
  assert.deepEqual(Array.from(result.groups[0].eps, x => x.ep), [4, 9]);
});

test('unknown videos remain included with chronological fallback and no known-number collision', () => {
  const a = api();
  a.metadata[id(2)] = { ts: 200 };
  a.metadata[id(3)] = { ts: 100 };
  const rows = [a.parseItem(video(0, '第1集')), a.parseItem(video(1, '第3集')), a.parseItem(video(2)), a.parseItem(video(3))];
  const group = a.computeGroups(rows, options).groups[0];
  assert.equal(group.lines.length, 4);
  assert.deepEqual(Array.from(group.eps, x => x.ep), [1, 3, 4, 5]);
  assert.deepEqual(urls(group).slice(2), [video(3).url, video(2).url]);
  assert.equal(group.lines.every(x => !x.name.includes('Chưa rõ tập')), true);
});

test('duplicate sightings of one video are removed but different videos with same number stay', () => {
  const a = api();
  const rows = [a.parseItem(video(1, '第1集')), a.parseItem(video(1, '第1集')), a.parseItem(video(2, '第1集'))];
  const result = a.computeGroups(rows, options);
  assert.equal(result.total, 2); assert.equal(result.groups[0].lines.length, 2);
});

test('existing merged/ad options are retained and split=false still produces one target group', () => {
  const a = api();
  const rows = [a.parseItem(video(1, '第1集')), a.parseItem(video(2, '第1-6集 合集')), a.parseItem(video(3, '预告 trailer'))];
  const excluded = a.computeGroups(rows, options);
  assert.equal(excluded.groups.length, 1); assert.equal(excluded.groups[0].lines.length, 1);
  assert.equal(excluded.skippedMerged, 1); assert.equal(excluded.skippedAds, 1);
  const included = a.computeGroups(rows, { ...options, takeM: true, takeA: true });
  assert.equal(included.groups.length, 1); assert.equal(included.groups[0].lines.length, 3);
});
