const fs = require('node:fs');
const path = require('node:path');

function environmentValue(env, name) {
  const key = Object.keys(env).find(key => key.toUpperCase() === name.toUpperCase());
  return key && typeof env[key] === 'string' ? env[key].trim() : '';
}

/** Resolve an installed browser executable without opening a personal profile. */
function resolveBrowser({ choice, customPath, platform = process.platform, env = process.env, exists = fs.existsSync } = {}) {
  if (choice === 'builtin') return null;
  if (!['chrome', 'edge', 'custom'].includes(choice)) throw Error('Chọn trình duyệt tích hợp, Google Chrome, Microsoft Edge hoặc đường dẫn tùy chọn.');
  if (typeof exists !== 'function') throw Error('Không thể kiểm tra đường dẫn trình duyệt.');

  const pathname = platform === 'win32' ? path.win32 : path.posix;
  const usable = executable => {
    try {
      if (!exists(executable)) return false;
      // Real discovery checks file/read access too. Injected probes support
      // deterministic tests without accessing a user's browser installation.
      if (exists === fs.existsSync) {
        if (!fs.statSync(executable).isFile()) return false;
        fs.accessSync(executable, platform === 'win32' ? fs.constants.R_OK : fs.constants.R_OK | fs.constants.X_OK);
      }
      return true;
    } catch { return false; }
  };

  if (choice === 'custom') {
    const executable = typeof customPath === 'string' ? customPath.trim() : '';
    if (!executable || !pathname.isAbsolute(executable)) throw Error('Nhập đường dẫn tuyệt đối đến tệp trình duyệt, ví dụ chrome.exe hoặc msedge.exe.');
    if (!usable(executable)) throw Error('Tệp trình duyệt tùy chọn không tồn tại hoặc không đọc/chạy được. Chọn lại tệp thực thi trong Cài đặt.');
    return executable;
  }

  let candidates = [];
  if (platform === 'win32') {
    const executableParts = choice === 'chrome'
      ? ['Google', 'Chrome', 'Application', 'chrome.exe']
      : ['Microsoft', 'Edge', 'Application', 'msedge.exe'];
    const roots = ['PROGRAMFILES', 'PROGRAMFILES(X86)', 'LOCALAPPDATA']
      .map(name => environmentValue(env, name)).filter(root => root && path.win32.isAbsolute(root));
    candidates = [...new Set(roots.map(root => path.win32.join(root, ...executableParts)))];
  } else if (platform === 'darwin') {
    const application = choice === 'chrome' ? ['Google Chrome.app', 'Google Chrome'] : ['Microsoft Edge.app', 'Microsoft Edge'];
    const home = environmentValue(env, 'HOME');
    const roots = ['/Applications'];
    if (home && path.posix.isAbsolute(home)) roots.push(path.posix.join(home, 'Applications'));
    candidates = roots.map(root => path.posix.join(root, application[0], 'Contents', 'MacOS', application[1]));
  } else if (platform === 'linux') {
    candidates = choice === 'chrome'
      ? ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/opt/google/chrome/chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']
      : ['/usr/bin/microsoft-edge', '/usr/bin/microsoft-edge-stable', '/opt/microsoft/msedge/msedge'];
  } else {
    throw Error('Nền tảng này chưa hỗ trợ tìm trình duyệt tự động. Chọn đường dẫn trình duyệt tùy chọn trong Cài đặt.');
  }

  const executable = candidates.find(usable);
  if (!executable) {
    const name = choice === 'chrome' ? 'Google Chrome' : 'Microsoft Edge';
    throw Error(`Không tìm thấy ${name}. Cài trình duyệt này hoặc chọn đường dẫn tùy chọn trong Cài đặt; app không tự đổi sang trình duyệt khác.`);
  }
  return executable;
}

module.exports = { resolveBrowser };
