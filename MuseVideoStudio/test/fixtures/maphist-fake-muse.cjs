// Muse giả cho tab «Bản đồ lịch sử»: trả JSON dàn ý và các giai đoạn theo đúng khuôn lời nhắc.
const NARRATION = n => `In the year ${n} the realm grew stronger and its merchants sailed far across the sea, trading spices and silk while rulers built great cities, then new rivals appeared and the next age began.`;

function fakeMapMuse({ eras = 12, country = 'Indonesia', drop = null, badRegion = null, hold = null } = {}) {
  const log = { outline: 0, eras: [], instructions: [] };
  const years = Array.from({ length: eras }, (_, i) => 1000 + i * 90);
  const regionsFor = n => (n === badRegion ? ['Atlantis Prime'] : n % 2 ? ['Jawa Barat', 'Jawa Tengah', 'Jawa Timur'] : ['Sumatera Barat', 'Jambi']);
  const eraJson = n => ({
    n, year: years[n - 1], title: `Age ${n}`, caption: `Age ${n} of the island realm`, narration: NARRATION(years[n - 1]), population: 1000000 * n, icon: 'crown',
    realms: [{ name: 'Island Realm', regions: regionsFor(n), colors: ['#c0392b', '#ffffff'], flag: 'h', mood: 'proud', face: true }],
    markers: [{ type: 'capital', name: `Capital ${n}`, at: [106.8, -6.2] }], routes: []
  });
  async function ask(muse, instruction, marker, signal, label) {
    log.instructions.push(instruction);
    if (hold) await hold(label, signal);
    if (!/DÀN Ý ĐẦY ĐỦ/.test(instruction)) {
      log.outline++;
      return JSON.stringify({ title: 'History of Testland', subtitle: 'A fake story', country, eras: years.map((year, i) => ({ year, title: `Age ${i + 1}`, focus: `Things happen in age ${i + 1}` })) });
    }
    const m = /từ (\d+) đến (\d+)/.exec(instruction), a = Number(m[1]), b = Number(m[2]);
    log.eras.push([a, b]);
    const attempt = log.eras.filter(([x, y]) => x === a && y === b).length;
    const list = [];
    for (let n = a; n <= b; n++) if (!(drop && drop(n, attempt))) list.push(eraJson(n));
    return '```json\n' + JSON.stringify({ eras: list }) + '\n```';
  }
  return { ask, log, years, eraJson };
}
module.exports = { fakeMapMuse, NARRATION };
