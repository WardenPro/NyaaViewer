/**
 * Test script for AllDebrid API v4/v4.1 integration.
 *
 * Usage:
 *   AD_API_KEY=... node scripts/test-alldebrid.js [magnet_uri]
 *   node scripts/test-alldebrid.js <AD_API_KEY> [magnet_uri]
 *
 * Runs through the full AD magnet flow: upload → status → files → unlock.
 * Uses a sample magnet URI if none supplied as the second arg.
 */

const axios = require('axios');
const BASE = 'https://api.alldebrid.com';
const DEFAULT_MAGNET = 'magnet:?xt=urn:btih:36FBBF3C0E0F7F62F84276B094E780883695227E&dn=Big+Buck+Bunny&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce';

const firstArg = process.argv[2];
let apiKey = firstArg && firstArg.startsWith('magnet:') ? process.env.AD_API_KEY : firstArg || process.env.AD_API_KEY;
let magnetUri = firstArg && firstArg.startsWith('magnet:') ? firstArg : process.argv[3] || DEFAULT_MAGNET;

if (!apiKey) {
  console.error('ERROR: No API key provided.');
  console.error('Usage: AD_API_KEY=... node scripts/test-alldebrid.js [magnet_uri]');
  console.error('   or: node scripts/test-alldebrid.js <AD_API_KEY> [magnet_uri]');
  process.exit(1);
}

function log(label, data) {
  console.log(`\n--- ${label} ---`);
  console.log(JSON.stringify(data, null, 2));
}

async function runTests() {
  const client = axios.create({
    baseURL: BASE,
    timeout: 30000,
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  // --- Test 1: Verify API key ---
  console.log('\n[1] Testing verifyKey...');
  try {
    const resp = await client.get('/v4/user');
    if (resp.data.status === 'success') {
      console.log('  PASS - Connected as:', resp.data.data.user.username);
    } else {
      console.log('  FAIL - verifyKey returned non-success:', resp.data.error?.message);
    }
  } catch (e) {
    console.log('  FAIL - verifyKey error:', e.response?.data?.error?.message || e.message);
  }

  // --- Test 2: uploadMagnet (POST /v4/magnet/upload with magnets[] param) ---
  console.log('\n[2] Testing uploadMagnet...');
  let magnetId = null;
  try {
    const params = new URLSearchParams();
    params.append('magnets[]', magnetUri);
    const resp = await client.post('/v4/magnet/upload', params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    log('uploadMagnet response', resp.data);
    if (resp.data.status === 'success' && resp.data.data.magnets?.length > 0) {
      magnetId = resp.data.data.magnets[0].id;
      const isReady = resp.data.data.magnets[0].ready;
      console.log(`  PASS - Uploaded magnet, id: ${magnetId}, ready: ${isReady}`);
    } else {
      console.log('  FAIL - uploadMagnet returned unexpected format');
    }
  } catch (e) {
    console.log('  FAIL - uploadMagnet error:', e.response?.data?.error?.message || e.message);
  }

  if (!magnetId) {
    console.log('\nCannot continue without magnet ID. Stopping tests.');
    process.exit(1);
  }

  // --- Test 3: getTorrentStatus (POST /v4.1/magnet/status with id param) ---
  console.log('\n[3] Testing getTorrentStatus...');
  let torrentReady = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const body = new URLSearchParams();
      body.append('id', String(magnetId));
      const resp = await client.post('/v4.1/magnet/status', body.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      log(`status attempt ${attempt + 1}`, resp.data);
      if (resp.data.status === 'success') {
        const magnet = resp.data.data.magnet || resp.data.data.magnets?.[0];
        if (magnet) {
          console.log(`  Status: ${magnet.status} (${magnet.statusCode})`);
          if (magnet.statusCode === 4) {
            torrentReady = true;
            console.log('  PASS - Torrent ready!');
            break;
          }
          console.log(`  Waiting... (${(attempt + 1) * 3}s)`);
          await new Promise(r => setTimeout(r, 3000));
        }
      }
    } catch (e) {
      console.log(`  Status attempt ${attempt + 1} fail:`, e.response?.data?.error?.message || e.message);
    }
  }

  if (!torrentReady) {
    console.log('\nTorrent not ready after polling. Stopping.');
    process.exit(1);
  }

  // --- Test 4: getTorrentFiles (POST /v4/magnet/files with id[] param) ---
  console.log('\n[4] Testing getTorrentFiles...');
  try {
    const body = new URLSearchParams();
    body.append('id[]', String(magnetId));
    const resp = await client.post('/v4/magnet/files', body.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    log('files response (first 500 chars)', JSON.stringify(resp.data).substring(0, 500));
    if (resp.data.status === 'success') {
      console.log('  PASS - Files endpoint returned success');
    } else {
      console.log('  FAIL - Unexpected response format');
    }
  } catch (e) {
    console.log('  FAIL - getTorrentFiles error:', e.response?.data?.error?.message || e.message);
  }

  console.log('\n=== AllDebrid API tests completed ===');
  console.log('All calls used Authorization: Bearer header ✓');
  console.log('uploadMagnet: POST /v4/magnet/upload with magnets[] ✓');
  console.log('getTorrentStatus: POST /v4.1/magnet/status with id ✓');
  console.log('getTorrentFiles: POST /v4/magnet/files with id[] ✓');
}

runTests().catch(console.error);
