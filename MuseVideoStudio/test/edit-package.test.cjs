const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { exportEditPackage } = require('../src/edit-package.cjs');

test('exports independent clips in prompt order with portable manifest and leaves sources intact', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-edit-test-'));
  try {
    const first = path.join(root, 'last-created.MP4');
    const second = path.join(root, 'first-created.webm');
    await fs.writeFile(first, 'first prompt video bytes');
    await fs.writeFile(second, 'second prompt video bytes');
    const output = path.join(root, 'exports with spaces');
    const jobs = [
      { status: 'completed', output: first, prompt: 'First prompt', account: 2, cookie: 'must-not-export' },
      { status: 'completed', output: second, prompt: 'Second prompt', account: 1 }
    ];
    const progress = [];
    const folder = await exportEditPackage(jobs, { output, onProgress: text => progress.push(text) });
    const manifestText = await fs.readFile(path.join(folder, 'manifest.json'), 'utf8');
    const manifest = JSON.parse(manifestText);
    assert.deepEqual(manifest.clips, [
      { order: 1, file: 'clips/0001.mp4', prompt: 'First prompt', account: 2 },
      { order: 2, file: 'clips/0002.webm', prompt: 'Second prompt', account: 1 }
    ]);
    assert.equal(await fs.readFile(path.join(folder, 'clips', '0001.mp4'), 'utf8'), 'first prompt video bytes');
    assert.equal(await fs.readFile(path.join(folder, 'clips', '0002.webm'), 'utf8'), 'second prompt video bytes');
    assert.equal(await fs.readFile(first, 'utf8'), 'first prompt video bytes');
    assert.equal(await fs.readFile(second, 'utf8'), 'second prompt video bytes');
    assert.equal(manifestText.includes(root), false);
    assert.equal(manifestText.includes('must-not-export'), false);
    assert.equal(await fs.readFile(path.join(folder, 'ordered-clips.txt'), 'utf8'), 'clips/0001.mp4\nclips/0002.webm\n');
    assert.match(await fs.readFile(path.join(folder, 'HUONG-DAN-CAPCUT.txt'), 'utf8'), /không phải dự án CapCut/);
    assert.equal(progress.length, 2);
    const again = await exportEditPackage(jobs, { output });
    assert.notEqual(folder, again);
    assert.equal((await fs.readdir(output)).some(name => name.startsWith('.muse-edit-')), false);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('rejects incomplete, empty or unsupported input without creating an export', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-edit-invalid-'));
  try {
    const output = path.join(root, 'exports');
    await assert.rejects(exportEditPackage([{ status: 'pending', output: 'unused.mp4' }], { output }), /tất cả prompt/);
    await assert.rejects(exportEditPackage([], { output }), /tất cả prompt/);
    await assert.rejects(exportEditPackage([{ status: 'completed', output: 'file.exe' }], { output }), /MP4, WebM hoặc MOV/);
    const empty = path.join(root, 'empty.mp4'); await fs.writeFile(empty, '');
    await assert.rejects(exportEditPackage([{ status: 'completed', output: empty }], { output }), /có dữ liệu/);
    await assert.rejects(fs.access(output), { code: 'ENOENT' });
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('cleans only its staging folder if a source disappears during copy', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-edit-failure-'));
  try {
    const output = path.join(root, 'exports'); await fs.mkdir(output);
    const existing = path.join(output, 'keep-user-file.txt'); await fs.writeFile(existing, 'keep');
    const first = path.join(root, 'first.mp4'), second = path.join(root, 'second.mp4');
    await fs.writeFile(first, 'first'); await fs.writeFile(second, 'second');
    let copied = 0;
    await assert.rejects(exportEditPackage([
      { status: 'completed', output: first }, { status: 'completed', output: second }
    ], { output, onProgress: async () => { if (++copied === 2) await fs.unlink(second); } }), { code: 'ENOENT' });
    assert.deepEqual(await fs.readdir(output), ['keep-user-file.txt']);
    assert.equal(await fs.readFile(existing, 'utf8'), 'keep');
    assert.equal(await fs.readFile(first, 'utf8'), 'first');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
