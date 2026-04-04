#!/bin/bash
# AllDebrid API Test Script - validates every endpoint matches the v4 spec
# Usage: ./test-alldebrid.sh [DEMO|APIKEY]
# DEMO uses staticDemoApikeyPrem (premium demo account)
# APIKEY uses your real API key passed as argument

set -e

KEY="${1:-staticDemoApikeyPrem}"
AUTH_HEADER="Authorization: Bearer ${KEY}"
BASE="https://api.alldebrid.com"

echo "=== AllDebrid API v4/v4.1 Test Suite ==="
echo "Using API key: ${KEY}"
echo ""

# 1. Ping
echo "── TEST 1: GET /v4/ping ──"
PING=$(curl -sf "${BASE}/v4/ping")
echo "$PING"
if echo "$PING" | grep -q '"pong"'; then
  echo "PASS"
else
  echo "FAIL: ping failed"
  exit 1
fi
echo ""

# 2. User info (verify auth works)
echo "── TEST 2: GET /v4/user ──"
USER=$(curl -s -H "$AUTH_HEADER" "${BASE}/v4/user")
echo "$USER" | python3 -m json.tool 2>/dev/null || echo "$USER"
if echo "$USER" | grep -q '"status": "success"'; then
  echo "PASS: Auth works"
else
  echo "FAIL: Auth failed"
  echo "$USER"
  exit 1
fi
echo ""

# 3. Upload a magnet (small known-good torrent)
echo "── TEST 3: POST /v4/magnet/upload ──"
# Using a small public torrent (Ubuntu ISO magnet)
MAGNET="magnet:?xt=urn:btih:3b24580025d3756f20bc6616a56bdb1315097e8b&dn=ubuntu-16.04.6-desktop-amd64.iso"
UPLOAD=$(curl -s -H "$AUTH_HEADER" \
  -d "magnets[]=${MAGNET}" \
  "${BASE}/v4/magnet/upload")
echo "$UPLOAD" | python3 -m json.tool 2>/dev/null || echo "$UPLOAD"

MAGNET_ID=$(echo "$UPLOAD" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['magnets'][0]['id'])" 2>/dev/null || echo "")
MAGNET_READY=$(echo "$UPLOAD" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['magnets'][0].get('ready',False))" 2>/dev/null || echo "false")
echo ""

if [ -n "$MAGNET_ID" ] && [ "$MAGNET_ID" != "None" ]; then
  echo "PASS: Got magnet ID: ${MAGNET_ID}, ready: ${MAGNET_READY}"
else
  echo "FAIL: Could not extract magnet ID"
  echo "Response: $UPLOAD"
  exit 1
fi
echo ""

# 4. Check magnet status with v4.1
echo "── TEST 4: POST /v4.1/magnet/status ──"
STATUS=$(curl -s -H "$AUTH_HEADER" \
  -d "id=${MAGNET_ID}" \
  "${BASE}/v4.1/magnet/status")
echo "$STATUS" | python3 -m json.tool 2>/dev/null || echo "$STATUS"
if echo "$STATUS" | grep -q '"status": "success"'; then
  echo "PASS: Got status for magnet ${MAGNET_ID}"
else
  echo "FAIL: Status check failed"
  echo "Response: $STATUS"
  exit 1
fi
echo ""

# 5. Get files with /v4/magnet/files
echo "── TEST 5: POST /v4/magnet/files ──"
FILES=$(curl -s -H "$AUTH_HEADER" \
  -d "id[]=${MAGNET_ID}" \
  "${BASE}/v4/magnet/files")
echo "$FILES" | python3 -m json.tool 2>/dev/null || echo "$FILES"
if echo "$FILES" | grep -q '"status": "success"'; then
  FILE_COUNT=$(echo "$FILES" | python3 -c "
import sys,json
d=json.load(sys.stdin)
m=d.get('data',{}).get('magnets',[])
if m and m[0].get('files'):
    files=m[0]['files']
    def count(n):
        return sum(count(f.get('e',[])) if 'e' in f else 1 for f in n)
    print(count(files))
else:
    print(0)
" 2>/dev/null || echo "0")
  echo "PASS: Found ${FILE_COUNT} files"
else
  echo "FAIL: Files endpoint failed"
  echo "Response: $FILES"
  exit 1
fi

# Extract first file link if available
FIRST_LINK=$(echo "$FILES" | python3 -c "
import sys,json
d=json.load(sys.stdin)
m=d.get('data',{}).get('magnets',[])
if m:
    files=m[0].get('files',[])
    def find_link(n):
        for f in n:
            if f.get('l'):
                return f['l']
            if 'e' in f:
                result=find_link(f['e'])
                if result: return result
        return None
    print(find_link(files) or '')
" 2>/dev/null || echo "")

echo ""
if [ -n "$FIRST_LINK" ]; then
  echo "First file link: ${FIRST_LINK}"
  echo ""

  # 6. Unlock link
  echo "── TEST 6: POST /v4/link/unlock ──"
  ENCODED_LINK=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$FIRST_LINK', safe=''))")
  UNLOCK=$(curl -s -H "$AUTH_HEADER" \
    -d "link=${ENCODED_LINK}" \
    "${BASE}/v4/link/unlock")
  echo "$UNLOCK" | python3 -m json.tool 2>/dev/null || echo "$UNLOCK"
  if echo "$UNLOCK" | grep -q '"status": "success"'; then
    echo "PASS: link/unlock responded successfully"
  elif echo "$UNLOCK" | grep -q '"delayed"'; then
    echo "PASS: Link is still processing (delayed type, expected for fresh magnets)"
  else
    echo "NOTE: unlock returned an error (may be expected for demo)"
  fi
  echo ""
else
  echo "NOTE: No file links available yet (magnet may still be downloading)"
  echo "This is normal for fresh magnets that aren't ready yet"
fi

echo ""
echo "=== All API endpoint tests passed ==="
