// Real Chromium UI test with mocked IPC for the "Kể chuyện" tab; no Muse calls, no real voices.
const { chromium } = require('playwright-core'), http = require('http'), fs = require('fs/promises'), path = require('path'), assert = require('assert/strict');
(async () => {
  const files = { '/assets/muse-studio.svg': 'assets/muse-studio.svg', '/assets/zalo-qr.jpg': 'assets/zalo-qr.jpg', '/': 'index.html', '/style.css': 'style.css', '/renderer.js': 'renderer.js', '/ui-i18n.js': 'ui-i18n.js', '/script-planner.js': 'script-planner.js', '/prompt-import.js': 'prompt-import.js', '/reference-map.js': 'reference-map.js', '/story-plan.js': 'story-plan.js', '/story-ui.js': 'story-ui.js' };
  const server = http.createServer(async (req, res) => {
    const name = files[req.url];
    if (!name) { res.writeHead(404); return res.end(); }
    res.setHeader('Content-Type', name.endsWith('.jpg') ? 'image/jpeg' : name.endsWith('.svg') ? 'image/svg+xml' : name.endsWith('.js') ? 'application/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(await fs.readFile(path.join(__dirname, '../src', name)));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1450, height: 1500 } }), errors = [];
    page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
    await page.addInitScript(() => {
      localStorage.setItem('museStudio.language', 'vi');
      const job = (kind, n, extra = {}) => ({ id: kind + n, kind, status: 'completed', stage: 'completed', order: n, number: n, prompt: kind + ' prompt ' + n, title: 'Cảnh ' + n, references: [], output: 'C:\\Videos\\' + n + '.mp4', ...extra });
      const s = {
        version: '1.2.0', active: false, paused: true,
        jobs: [job('video', 1), job('image', 1, { output: 'C:\\Videos\\Anh\\001.png' }),
          job('story', 1, { storyId: 'Truyen-1', voiceover: 'Lời cảnh một.', output: 'C:\\Videos\\KeChuyen\\Truyen-1\\001.mp4' }),
          job('story', 2, { storyId: 'Truyen-1', voiceover: 'Lời cảnh hai.', output: 'C:\\Videos\\KeChuyen\\Truyen-1\\002.mp4' }),
          job('story', 3, { storyId: 'Truyen-1', voiceover: 'Lời cảnh ba.', output: 'C:\\Videos\\KeChuyen\\Truyen-1\\003.mp4' })],
        license: { status: 'trial', device: 'TESTDEVICE', expiresAt: Date.now() + 86400000, message: 'Dùng thử 24 giờ' },
        story: { busy: false, progress: '', error: '', output: '', srt: '', notes: [], voice: { setupBusy: false, setupMessage: '', setupError: '', ready: { edge: false, clone: false }, platform: 'win32', edgeVoices: [{ id: 'vi-VN-HoaiMyNeural', name: 'Hoài My (nữ, tiếng Việt)' }, { id: 'vi-VN-NamMinhNeural', name: 'Nam Minh (nam, tiếng Việt)' }], windowsVoices: [{ name: 'Microsoft An', culture: 'vi-VN', gender: 'Male' }], clones: [] } },
        settings: { browserChoice: 'builtin', browserPath: '', output: 'C:\\Videos', autoMerge: false, autoPackage: false, ffmpeg: 'ffmpeg', accountCount: 2, composer: 'textarea', fileInput: 'input[type=file]', submit: '', video: 'video', image: 'img', attachmentReadySelector: '', timeoutMinutes: 15 }
      };
      window.calls = []; window.s = s; let listener, id = 100;
      window.push = () => listener(structuredClone(s));
      window.studio = {
        onUpdate: fn => listener = fn,
        invoke: async (name, data) => {
          window.calls.push({ name, data: name === 'storyBuild' ? { ...data, scenes: data.scenes.map(sc => ({ id: sc.id, chunks: sc.chunks.map(c => ({ text: c.text, start: c.start, end: c.end, png: c.png ? [...c.png.slice(0, 4)] : null })) })) } : data });
          if (name === 'images') return ['C:\\Refs\\mai.png'];
          if (name === 'add') s.jobs.push(...data.map(j => ({ ...j, id: String(++id), status: 'pending', stage: 'pending', order: s.jobs.filter(x => x.kind === 'story').length + 1 })));
          if (name === 'start') { s.active = true; s.paused = false; }
          if (name === 'storySetupVoice') { s.story.voice.setupBusy = true; s.story.voice.setupMessage = 'Đang tìm Python…'; }
          if (name === 'storyAddVoice') s.story.voice.clones.push({ key: 'Giong-cua-toi', name: data.name });
          if (name === 'storyListen') return 'C:\\Data\\preview\\nghe.mp3';
          if (name === 'storyPrepare') return { runId: 'r1', scenes: s.jobs.filter(j => j.kind === 'story' && j.storyId === data.storyId).map(j => ({ id: j.id, number: j.order, text: j.voiceover, seconds: 4.4, clipSeconds: 10, voiceSeconds: 4 })) };
          if (name === 'storyBuild') { s.story.output = 'C:\\Videos\\KeChuyen\\Truyen-1\\Truyen-1.mp4'; s.story.srt = data.srt ? 'C:\\Videos\\KeChuyen\\Truyen-1\\Truyen-1.srt' : ''; s.story.notes = [{ scene: 1, cut: 5.6, hold: 0 }, { scene: 2, cut: 0, hold: 2 }]; }
          return structuredClone(s);
        }
      };
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => document.querySelectorAll('.card').length > 0);
    const called = name => page.evaluate(n => window.calls.filter(c => c.name === n), name);

    // Video tab does not show story clips; the story tab counts them.
    assert.equal(await page.locator('.card').count(), 1);
    assert.equal(await page.locator('#navStoryCount').textContent(), '3');
    assert.equal(await page.locator('#storyPanel').isVisible(), false);
    await page.locator('#navStory').click();
    assert.equal(await page.locator('#headingText').textContent(), 'Danh sách clip kể chuyện');
    assert.equal(await page.locator('.card').count(), 3);
    assert.equal(await page.locator('#storyPanel').isVisible(), true);
    assert.equal(await page.locator('#storyOutput').isVisible(), true);
    assert.equal(await page.locator('#editorPanel').isVisible(), false);
    assert.equal(await page.locator('#outputTools').isVisible(), false);
    assert.equal(await page.locator('#folderPath').textContent(), 'C:\\Videos\\KeChuyen');
    assert.match(await page.locator('#summary').textContent(), /^3 \/ 3 clip đã lưu$/);
    assert.equal(await page.locator('.card .cardActions button:has-text("Đưa về sửa")').first().isHidden(), true, 'cảnh kể chuyện không có nút đưa về sửa');

    // Script → quick split → character image → create clips.
    await page.locator('#storyScript').fill('Ngày xưa có một cô bé tên Mai sống ở làng ven sông. Mỗi sáng Mai dậy sớm ra bến đón đò.\n\nMột hôm có chú cá vàng nhảy lên thuyền. Mai thả cá về sông và cá hứa sẽ giúp cô một điều ước.');
    await page.locator('#storyCharacter').fill('Mai, bé gái tóc đen');
    await page.locator('#storySplit').click();
    const sceneCount = await page.locator('#storyScenes .draftRow').count();
    assert.ok(sceneCount >= 2, 'cảnh ' + sceneCount);
    assert.match(await page.locator('#storySceneCount').textContent(), /^\d+ cảnh$/);
    assert.match(await page.locator('#storyScenes .draftRow textarea').nth(1).inputValue(), /Audio: no speech, no dialogue/);
    await page.locator('#storyRefs').click();
    assert.match(await page.locator('#storyRefInfo').textContent(), /mai\.png/);

    // Ask Muse: instruction + reply parsing.
    await page.locator('#storyAsk').click();
    const instruction = await page.locator('#storyInstruction').inputValue();
    assert.match(instruction, /KỊCH BẢN:/); assert.match(instruction, /Audio: no speech/);
    await page.locator('#storyReply').fill('CẢNH 1\nLỜI: Mai ra bến sông đón đò.\nPROMPT: Cô bé Mai đứng trên bến sông lúc bình minh.\n\nCẢNH 2\nLỜI: Cá vàng nhảy lên thuyền.\nPROMPT: Cá vàng bật lên khỏi mặt nước.');
    await page.locator('#storyParse').click();
    assert.equal(await page.locator('#storyScenes .draftRow').count(), 2);
    assert.match(await page.locator('#storyScenes .draftRow textarea').nth(1).inputValue(), /Cô bé Mai đứng trên bến sông[\s\S]*no speech/);
    await page.locator('#storyReply').fill('Xin lỗi tôi không làm được'); await page.locator('#storyParse').click();
    assert.match(await page.locator('#toast').textContent(), /Chưa thấy cảnh nào/);
    assert.equal(await page.locator('#storyScenes .draftRow').count(), 2, 'trả lời hỏng không xóa cảnh đang có');

    await page.locator('#storyCreate').click();
    await page.waitForFunction(() => window.calls.some(c => c.name === 'start'));
    const add = (await called('add')).at(-1).data;
    assert.equal(add.length, 2);
    assert.ok(add.every(j => j.kind === 'story' && /^Truyen-\d{8}-\d{6}$/.test(j.storyId) && j.storyId === add[0].storyId));
    assert.deepEqual(add.map(j => j.voiceover), ['Mai ra bến sông đón đò.', 'Cá vàng nhảy lên thuyền.']);
    assert.ok(add.every(j => j.references.length === 1 && j.references[0] === 'C:\\Refs\\mai.png' && j.image === 'C:\\Refs\\mai.png'));
    assert.deepEqual((await called('start')).at(-1).data, { kind: 'story' });
    assert.equal(await page.locator('#storyScenes .draftRow').count(), 0);

    // Voices: free setup, listen, clone with consent.
    await page.locator('#storyEngine').selectOption('edge');
    assert.match(await page.locator('#storyVoiceInfo').textContent(), /Chưa cài giọng Microsoft/);
    assert.equal(await page.locator('#storyListen').isDisabled(), false);
    assert.equal(await page.locator('#storyVoice option').count(), 2);
    await page.locator('#storySetup').click();
    await page.waitForFunction(() => document.querySelector('#storySetupStop') && !document.querySelector('#storySetupStop').hidden);
    assert.match(await page.locator('#storyVoiceInfo').textContent(), /Đang tìm Python/);
    assert.equal(await page.locator('#storySetup').isDisabled(), true);
    await page.evaluate(() => { Object.assign(window.s.story.voice, { setupBusy: false, setupMessage: '', ready: { edge: true, clone: true } }); window.push(); });
    await page.locator('#storyEngine').selectOption('clone');
    assert.match(await page.locator('#storyVoiceInfo').textContent(), /Chưa có giọng clone/);
    assert.equal(await page.locator('#storyListen').isDisabled(), true);
    assert.equal(await page.locator('#storyCloneAdd').isDisabled(), true, 'chưa tick đồng ý thì không nhân bản');
    await page.locator('#storyCloneBox summary').click();
    await page.locator('#storyCloneName').fill('Giọng của tôi');
    await page.locator('#storyCloneConsent').check();
    assert.equal(await page.locator('#storyCloneAdd').isDisabled(), false);
    await page.locator('#storyCloneAdd').click();
    await page.waitForFunction(() => document.querySelectorAll('#storyClones .cloneName').length === 1);
    assert.deepEqual((await called('storyAddVoice')).at(-1).data, { name: 'Giọng của tôi', consent: true });
    assert.equal(await page.locator('#storyVoice').inputValue(), 'Giong-cua-toi');
    await page.locator('#storyTempo').selectOption('1.15');
    await page.locator('#storyListen').click();
    await page.waitForFunction(() => !document.querySelector('#storyAudio').hidden);
    assert.deepEqual((await called('storyListen')).at(-1).data, { engine: 'clone', voice: 'Giong-cua-toi', tempo: '1.15', text: 'Mai ra bến sông đón đò.' });
    assert.match(await page.locator('#storyAudio').getAttribute('src'), /^file:\/\/\/C:\/Data\/preview\/nghe\.mp3$/);

    // Subtitles: preview is drawn; export sends PNG captions only when on; .srt and sound-effect level pass through.
    assert.equal(await page.evaluate(() => { const c = document.getElementById('subPreview'); const d = c.getContext('2d').getImageData(0, c.height * 0.8, c.width, c.height * 0.2).data; for (let i = 0; i < d.length; i += 4) if (d[i] > 240 && d[i + 1] > 240 && d[i + 2] > 240) return true; return false; }), true, 'xem trước vẽ chữ trắng ở phần dưới');
    await page.locator('#subPos').selectOption('top');
    assert.equal(await page.evaluate(() => { const c = document.getElementById('subPreview'); const d = c.getContext('2d').getImageData(0, c.height * 0.8, c.width, c.height * 0.2).data; for (let i = 0; i < d.length; i += 4) if (d[i] > 240 && d[i + 1] > 240 && d[i + 2] > 240) return true; return false; }), false, 'đổi vị trí lên trên thì phần dưới hết chữ');
    await page.locator('#subPos').selectOption('bottom');
    await page.evaluate(() => { window.s.jobs.find(j => j.id === 'story2').status = 'pending'; window.push(); });
    assert.equal(await page.locator('#storyExport').isDisabled(), true);
    assert.match(await page.locator('#storyStatus').textContent(), /Còn 1 cảnh chưa có clip/);
    await page.evaluate(() => { window.s.jobs.find(j => j.id === 'story2').status = 'completed'; window.push(); });
    await page.locator('#subSrt').check(); await page.locator('#storySfx').selectOption('mid'); await page.locator('#storyName').fill('Cô bé Mai');
    await page.locator('#storyExport').click();
    await page.waitForFunction(() => window.calls.some(c => c.name === 'storyBuild'));
    const prep = (await called('storyPrepare')).at(-1).data;
    assert.deepEqual(prep, { storyId: 'Truyen-1', engine: 'clone', voice: 'Giong-cua-toi', tempo: '1.15' });
    let build = (await called('storyBuild')).at(-1).data;
    assert.equal(build.runId, 'r1'); assert.equal(build.subtitles, true); assert.equal(build.srt, true); assert.equal(build.sfx, 'mid'); assert.equal(build.name, 'Cô bé Mai'); assert.equal(build.aspect, '16:9');
    assert.equal(build.scenes.length, 3);
    assert.ok(build.scenes.every(sc => sc.chunks.length >= 1 && sc.chunks.every(c => c.end > c.start && Array.isArray(c.png) && c.png.join() === '137,80,78,71')), 'mỗi đoạn phụ đề là PNG');
    assert.equal(build.scenes[0].chunks[0].text, 'Lời cảnh một.'); assert.equal(build.scenes[0].chunks.at(-1).end, 4.4);
    await page.waitForFunction(() => /✓ Truyen-1\.mp4/.test(document.getElementById('storyStatus').textContent));
    assert.match(await page.locator('#storyStatus').textContent(), /Tự edit: cắt 5\.6 giây thừa; 1 cảnh lời dài hơn clip nên giữ khung cuối \(cảnh 2\)/);
    assert.equal(await page.locator('#storyOpen').isVisible(), true);
    await page.locator('#storyOpen').click(); assert.equal((await called('storyReveal')).length, 1);

    // Subtitle switch off: nothing is drawn, .srt-only still carries timings.
    await page.locator('#subOn').uncheck();
    await page.locator('#storyExport').click();
    await page.waitForFunction(() => window.calls.filter(c => c.name === 'storyBuild').length === 2);
    build = (await called('storyBuild')).at(-1).data;
    assert.equal(build.subtitles, false); assert.equal(build.srt, true);
    assert.ok(build.scenes.every(sc => sc.chunks.length >= 1 && sc.chunks.every(c => c.png === null)));
    await page.locator('#subSrt').uncheck();
    await page.locator('#storyExport').click();
    await page.waitForFunction(() => window.calls.filter(c => c.name === 'storyBuild').length === 3);
    build = (await called('storyBuild')).at(-1).data;
    assert.equal(build.subtitles, false); assert.equal(build.srt, false); assert.ok(build.scenes.every(sc => sc.chunks.length === 0));

    // Failed export keeps the message and does not stay stuck.
    await page.evaluate(() => { const original = window.studio.invoke; window.studio.invoke = async (name, data) => { if (name === 'storyPrepare') throw Error('Error invoking remote method \'studio:storyPrepare\': Error: Chưa cài giọng clone.'); return original(name, data); }; });
    await page.locator('#storyExport').click();
    await page.waitForFunction(() => /Chưa cài giọng clone/.test(document.getElementById('toast').textContent));
    assert.equal(await page.locator('#storyExport').isDisabled(), false);

    // Settings persist across reload, tab is remembered, English works.
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('.card').length > 0);
    assert.equal(await page.locator('#headingText').textContent(), 'Danh sách clip kể chuyện');
    assert.equal(await page.locator('#storyEngine').inputValue(), 'clone');
    assert.equal(await page.locator('#subOn').isChecked(), false);
    assert.equal(await page.locator('#storySfx').inputValue(), 'mid');
    assert.equal(await page.locator('#storyCharacter').inputValue(), 'Mai, bé gái tóc đen');
    await page.locator('#languagePicker').selectOption('en');
    await page.waitForFunction(() => document.documentElement.lang === 'en' && document.getElementById('storyExport').textContent === 'Export MP4');
    assert.equal(await page.locator('#headingText').textContent(), 'Story clip workspace');
    assert.match(await page.locator('#storyPanel summary').first().textContent(), /Story & character/);
    assert.equal(await page.locator('#navStory').textContent().then(t => t.replace(/\s+/g, '')), '✎Story3');
    assert.equal(await page.locator('#storyListen').textContent(), '▶ Listen to voice');
    assert.equal(await page.locator('#subOn').locator('xpath=..').textContent().then(t => t.trim()), 'Show subtitles in the video');
    assert.equal(await page.locator('#storySfx option[value=low]').textContent(), 'Low (background under narration)');
    assert.deepEqual(errors, []);
    console.log('PASS: story tab — own jobs/counts/folder, quick split + Muse reply parsing (no-speech rule kept), character image on every scene, free voice setup/listen/clone with consent, subtitles on/off + .srt + PNG captions, auto-edit report, export errors, persistence, English labels.');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
