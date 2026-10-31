const fs = require('node:fs/promises');
const path = require('node:path');

const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov']);

/**
 * Copy finished clips in prompt order into a portable media folder for editing.
 * This exports ordinary media and a manifest, not a proprietary CapCut project.
 */
async function exportEditPackage(jobs, { output, onProgress = () => {} } = {}) {
  if (!Array.isArray(jobs) || !jobs.length || jobs.some(job => !job || job.status !== 'completed' || typeof job.output !== 'string' || !job.output)) {
    throw Error('Chỉ xuất gói dựng khi tất cả prompt đã có video hoàn tất.');
  }
  if (typeof output !== 'string' || !output.trim()) throw Error('Chọn thư mục lưu gói dựng trước.');

  // Validate all inputs before creating the export folder. Do not encode source
  // paths, login data or arbitrary job metadata in the portable manifest.
  const entries = [];
  const digits = Math.max(4, String(jobs.length).length);
  for (let index = 0; index < jobs.length; index++) {
    const job = jobs[index];
    const extension = path.extname(job.output).toLowerCase();
    if (!VIDEO_EXTENSIONS.has(extension)) throw Error(`Video ${index + 1} cần định dạng MP4, WebM hoặc MOV.`);
    const stat = await fs.stat(job.output);
    if (!stat.isFile() || !stat.size) throw Error(`Video ${index + 1} không phải tệp video có dữ liệu.`);
    const clip = {
      order: index + 1,
      file: `clips/${String(index + 1).padStart(digits, '0')}${extension}`,
      prompt: typeof job.prompt === 'string' ? job.prompt : ''
    };
    if (Number.isInteger(job.account) && job.account > 0) clip.account = job.account;
    entries.push({ source: job.output, clip });
  }

  await fs.mkdir(output, { recursive: true });
  const staging = await fs.mkdtemp(path.join(output, '.muse-edit-'));
  const destination = path.join(output, `CapCut_Clips_${path.basename(staging).slice('.muse-edit-'.length)}`);
  try {
    await fs.mkdir(path.join(staging, 'clips'));
    for (const { source, clip } of entries) {
      await onProgress(`Sao chép cảnh ${clip.order}/${entries.length}`);
      await fs.copyFile(source, path.join(staging, clip.file), fs.constants.COPYFILE_EXCL);
    }
    const manifest = {
      schemaVersion: 1,
      type: 'ordered-media-package',
      title: 'Muse Video Studio — Gói clip để dựng',
      description: 'Clip rời theo thứ tự prompt. Đây không phải file dự án CapCut.',
      clips: entries.map(entry => entry.clip)
    };
    await fs.writeFile(path.join(staging, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
    await fs.writeFile(path.join(staging, 'ordered-clips.txt'), entries.map(entry => entry.clip.file).join('\n') + '\n', { flag: 'wx' });
    await fs.writeFile(path.join(staging, 'HUONG-DAN-CAPCUT.txt'), [
      'MUSE VIDEO STUDIO — GÓI CLIP ĐỂ DỰNG TRONG CAPCUT',
      '',
      'Đây là thư mục media, không phải dự án CapCut có thể mở trực tiếp.',
      'Các clip được giữ riêng, không nối và không mã hóa lại.',
      '',
      '1. Mở CapCut PC, tạo dự án mới hoặc mở dự án bạn muốn chỉnh sửa.',
      '2. Chọn Import / Nhập, rồi chọn các video trong thư mục clips.',
      '3. Sắp xếp theo tên tệp tăng dần (0001, 0002, …).',
      '4. Thêm clip lên timeline và kiểm tra thứ tự trước khi dựng.',
      '5. Chỉnh nhạc, chữ, chuyển cảnh hoặc cắt ghép, rồi lưu dự án trong CapCut.',
      '',
      'manifest.json ghi thứ tự prompt, nội dung prompt và tài khoản xử lý (nếu có).',
      'ordered-clips.txt liệt kê tệp theo thứ tự dựng.',
      'Thư mục này không chứa cookie hay thông tin đăng nhập.',
      'Clip nguồn vẫn được giữ nguyên trong thư mục tải ban đầu.',
      'Giữ thư mục gói dựng ở vị trí cố định để CapCut tiếp tục tìm được media.',
      ''
    ].join('\r\n'), { flag: 'wx' });
    await fs.rename(staging, destination);
    return destination;
  } catch (error) {
    // Only remove the uniquely created staging directory from this invocation.
    await fs.rm(staging, { recursive: true, force: true });
    throw error;
  }
}

module.exports = { exportEditPackage };
