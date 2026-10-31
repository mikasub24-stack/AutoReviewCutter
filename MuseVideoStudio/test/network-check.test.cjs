const { test } = require('node:test');
const assert = require('node:assert/strict');
const { CHECK_URL, parseNetworkReport } = require('../src/network-check.cjs');
const usa = { success:true, ip:'203.0.113.10', country_code:'US', country:'United States' };
test('network report validates USA result and adds observation time without declaring a VPN connected', () => {
  const start=Date.now(),report=parseNetworkReport(usa);
  assert.equal(CHECK_URL,'https://ipwho.is/');assert.equal(report.ip,usa.ip);assert.equal(report.countryCode,'US');assert.equal(report.countryName,'United States');
  assert.ok(Date.parse(report.observedAt)>=start && Date.parse(report.observedAt)<=Date.now());assert.equal(report.connected,undefined);
});
test('network parser accepts non-US and IPv6 as observed results rather than connection failures', () => {
  const report=parseNetworkReport({...usa,ip:'2001:db8::10',country_code:'VN',country:'Vietnam'});assert.equal(report.countryCode,'VN');assert.equal(report.ip,'2001:db8::10');
});
test('malformed, denied, and unsafe reports fail without revealing remote values', () => {
  const invalid=[null,[],{...usa,success:false,message:'private remote detail'}, {...usa,ip:'private-invalid-ip'}, {...usa,ip:'203.0.113.999'}, {...usa,country_code:'us'}, {...usa,country_code:'US<script>'}, {...usa,country:'<script>private</script>'}, {...usa,country:'United States\nprivate'}, {...usa,country:'a'.repeat(101)}, {...usa,country:null}];
  for(const data of invalid) assert.throws(()=>parseNetworkReport(data),e=>e.message==='Không xác minh được IP và quốc gia qua dịch vụ kiểm tra mạng.');
});
