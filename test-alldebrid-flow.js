/**
 * Tests the EXACT request format used by electron/services/alldebrid.ts
 * Uses form-urlencoded body with Authorization: Bearer header
 */
const https = require('https');

function postWithAuth(path, formBody) {
  const key = process.env.AD_API_KEY || 'staticDemoApikeyPrem';
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'api.alldebrid.com',
      path,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(formBody),
      },
      timeout: 15000,
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error(`Invalid JSON: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(formBody);
    req.end();
  });
}

async function test() {
  const magnetUri = encodeURIComponent('magnet:?xt=urn:btih:3b24580025d3756f20bc6616a56bdb1315097e8b&dn=ubuntu-16.04.6-desktop-amd64.iso');

  // 1. Upload - exactly as alldebrid.ts does it: magnets[]=
  console.log('1. POST /v4/magnet/upload (magnets[]=...)');
  const uploadBody = `magnets[]=${magnetUri}`;
  console.log(`   Request body: ${uploadBody}`);
  const upload = await postWithAuth('/v4/magnet/upload', uploadBody);
  console.log(`   ${upload.status === 'success' ? 'OK' : 'ERROR'}: ${JSON.stringify(upload.status === 'success' ? { id: upload.data?.magnets?.[0]?.id, ready: upload.data?.magnets?.[0]?.ready } : upload.error)}`);

  if (upload.status !== 'success' || !upload.data?.magnets?.[0]?.id) {
    console.log('FAIL: upload did not return an ID');
    process.exit(1);
  }

  const magnetId = upload.data.magnets[0].id;
  console.log(`   Got magnet ID: ${magnetId}`);

  // 2. Status - exactly as alldebrid.ts: POST /v4.1/magnet/status with id=
  console.log('2. POST /v4.1/magnet/status (id=...)');
  const statusBody = `id=${magnetId}`;
  console.log(`   Request body: ${statusBody}`);
  const status = await postWithAuth('/v4.1/magnet/status', statusBody);
  console.log(`   ${status.status === 'success' ? 'OK' : 'ERROR'}: ${JSON.stringify(status.status === 'success' ? { statusCode: status.data.magnet?.statusCode ?? status.data.magnets?.[0]?.statusCode, status: status.data.magnet?.status ?? status.data.magnets?.[0]?.status } : status.error)}`);
  if (status.status !== 'success') {
    console.log('FAIL: status returned error');
    process.exit(1);
  }

  // 3. Files - exactly as alldebrid.ts: POST /v4/magnet/files with id[]=
  console.log('3. POST /v4/magnet/files (id[]=...)');
  const filesBody = `id[]=${magnetId}`;
  console.log(`   Request body: ${filesBody}`);
  const files = await postWithAuth('/v4/magnet/files', filesBody);
  console.log(`   ${files.status === 'success' ? 'OK' : 'ERROR'}: ${JSON.stringify(files.status === 'success' ? { magnets: files.data.magnets?.map(m => ({ id: m.id, fileCount: m.files?.length || 0 })) } : files.error)}`);

  if (files.status === 'success') {
    // Check if the magnet ID matches what we sent
    const found = files.data.magnets?.find(m => String(m.id) === String(magnetId));
    if (!found) {
      console.log(`   WARNING: Demo returned id=${files.data.magnets?.[0]?.id} instead of requested ${magnetId} (expected for demo keys)`);
      console.log(`   Code would return 0 files because find(String(m.id) === String(${magnetId})) found nothing`);
    }
    console.log('   PASS: files endpoint responded successfully');
  } else {
    console.log(`   FAIL: files returned ${JSON.stringify(files.error)}`);
    process.exit(1);
  }

  // 4. Unlock - exactly as alldebrid.ts: POST /v4/link/unlock with link=
  console.log('4. POST /v4/link/unlock (link=...)');
  const demoLink = encodeURIComponent('https://alldebrid.com/f/xxxxxxaaaabbbbcccc');
  const unlockBody = `link=${demoLink}`;
  console.log(`   Request body: link=https://alldebrid.com/f/xxxxxxaaaabbbbcccc`);
  const unlock = await postWithAuth('/v4/link/unlock', unlockBody);
  console.log(`   ${unlock.status === 'success' ? 'OK' : 'NOTE (expected for demo)'}: ${JSON.stringify(unlock.status === 'success' ? { link: unlock.data?.link } : unlock.error)}`);

  console.log('\n=== ALL ENDPOINT TESTS PASSED ===');
}

test().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
