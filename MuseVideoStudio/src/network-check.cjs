const { isIP } = require('node:net');
const CHECK_URL = 'https://ipwho.is/';
function parseNetworkReport(data) {
  const fail = () => { throw Error('Không xác minh được IP và quốc gia qua dịch vụ kiểm tra mạng.'); };
  if (!data || typeof data !== 'object' || Array.isArray(data) || data.success !== true) return fail();
  if (typeof data.ip !== 'string' || !isIP(data.ip)) return fail();
  if (typeof data.country_code !== 'string' || !/^[A-Z]{2}$/.test(data.country_code)) return fail();
  if (typeof data.country !== 'string') return fail();
  const countryName = data.country.trim();
  if (!countryName || countryName.length > 100 || !/^[\p{L}\p{N} .,'’()&-]+$/u.test(countryName)) return fail();
  return { ip: data.ip, countryCode: data.country_code, countryName, observedAt: new Date().toISOString() };
}
module.exports = { CHECK_URL, parseNetworkReport };
