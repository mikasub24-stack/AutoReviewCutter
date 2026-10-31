const { randomUUID } = require('node:crypto');
class Queue {
  constructor({ jobs = [], save, run, notify = () => {}, concurrency = 1 }) {
    this.jobs = jobs.map(j => ({ ...j, status: j.status === 'running' ? 'interrupted' : j.status }));
    this.save = save; this.run = run; this.notify = notify; this.active = false; this.paused = true; this.concurrency = concurrency; this.writes = Promise.resolve();
  }
  async publish() { const write = this.writes.then(() => this.save(this.jobs)); this.writes = write.catch(() => {}); await write; this.notify(this.jobs); }
  async add(items) {
    if (!Array.isArray(items) || !items.length || items.some(j => typeof j.prompt !== 'string' || !j.prompt.trim())) throw Error('Mỗi tác vụ cần một prompt.');
    this.jobs.push(...items.map(j => ({ id: randomUUID(), prompt: j.prompt.trim(), source: typeof j.source === 'string' ? j.source : '', title: typeof j.title === 'string' ? j.title : '', image: j.image || '', references: Array.isArray(j.references) ? [...j.references] : j.image ? [j.image] : [], status: 'pending', error: '', output: '', createdAt: Date.now() })));
    await this.publish();
  }
  async retry(id) {
    const j = this.jobs.find(x => x.id === id);
    if (!j || !['failed','interrupted'].includes(j.status)) throw Error('Chỉ chạy lại tác vụ lỗi hoặc bị gián đoạn.');
    j.status = 'pending'; j.error = ''; j.account = undefined; await this.publish();
  }
  async remove(id) {
    if (this.jobs.find(j => j.id === id)?.status === 'running') throw Error('Không thể xóa tác vụ đang chạy.');
    this.jobs = this.jobs.filter(j => j.id !== id); await this.publish();
  }
  pause() { this.paused = true; }
  async start() {
    this.paused = false;
    if (this.active) return;
    this.active = true;
    try {
      const worker = async slot => {
      while (!this.paused) {
        const j = this.jobs.find(x => x.status === 'pending');
        if (!j) break;
        j.status = 'running'; j.error = ''; await this.publish();
        try { j.output = await this.run(j, slot); j.status = 'completed'; }
        catch (e) { j.status = 'failed'; j.error = e.message; this.paused = true; }
        await this.publish();
      }
      };
      await Promise.allSettled(Array.from({length: this.concurrency}, (_, slot) => worker(slot))).then(results => { const failed = results.find(r => r.status === "rejected"); if (failed) throw failed.reason; });
    } finally { this.active = false; }
  }
}
module.exports = { Queue };
