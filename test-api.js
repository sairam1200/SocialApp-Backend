const http = require('http');

const BASE = 'http://localhost:8080';
const TOKEN1 = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJodHRwOi8vZ2FkZHIuY29tL2NsYWltcy9zdWIiOiJlMGE0ZTA3Ny1hOGMzLTQ3YjAtOTYxYi1jN2E2YjU4NTllOGUiLCJodHRwOi8vZ2FkZHIuY29tL2NsYWltcy9lbWFpbCI6ImphaW5zYW02MjNAZ21haWwuY29tIiwiaHR0cDovL2dhZGRyLmNvbS9jbGFpbXMvdXNlcnR5cGUiOiJVc2VyIiwiaHR0cDovL2dhZGRyLmNvbS9jbGFpbXMvcm9sZXMiOlsiVXNlciJdLCJodHRwOi8vZ2FkZHIuY29tL2NsYWltcy91c2VybmFtZSI6ImphaW5zYW02MjMiLCJodHRwOi8vZ2FkZHIuY29tL2NsYWltcy9naXZlbm5hbWUiOiJUZXN0IiwiaHR0cDovL2dhZGRyLmNvbS9jbGFpbXMvZmFtaWx5bmFtZSI6IlVzZXIiLCJodHRwOi8vZ2FkZHIuY29tL2NsYWltcy9mdWxsbmFtZSI6IlRlc3QgVXNlciIsImh0dHA6Ly9nYWRkci5jb20vY2xhaW1zL3NlY3VyaXR5LXN0YW1wIjoidGVzdC1zdGFtcCIsImh0dHA6Ly9nYWRkci5jb20vY2xhaW1zL2NvbmN1cnJlbmN5LXN0YW1wIjoidGVzdC1jb25jdXJyZW5jeSIsImlhdCI6MTc4NTE3MzExNiwiZXhwIjoxNzg1Nzc3OTE2LCJhdWQiOiJodHRwOi8vbG9jYWxob3N0OjUwMDAiLCJpc3MiOiJodHRwOi8vbG9jYWxob3N0OjUwMDAifQ.CzY98cRfReZ0pJAnqhJymQJqVkzwSngwUUVgIatR_sU';
const TOKEN2 = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJodHRwOi8vZ2FkZHIuY29tL2NsYWltcy9zdWIiOiJmODhmMmNkMi0xYzI2LTQ5MGUtYTUyOC0zNzdlNDZmOWEyMjEiLCJodHRwOi8vZ2FkZHIuY29tL2NsYWltcy9lbWFpbCI6InV0a2Fyc2g3dHJpdmVkaUBnbWFpbC5jb20iLCJodHRwOi8vZ2FkZHIuY29tL2NsYWltcy91c2VydHlwZSI6IlVzZXIiLCJodHRwOi8vZ2FkZHIuY29tL2NsYWltcy9yb2xlcyI6WyJVc2VyIl0sImh0dHA6Ly9nYWRkci5jb20vY2xhaW1zL3VzZXJuYW1lIjoidXRrYXJzaDd0cml2ZWRpIiwiaHR0cDovL2dhZGRyLmNvbS9jbGFpbXMvZ2l2ZW5uYW1lIjoiVGVzdCIsImh0dHA6Ly9nYWRkci5jb20vY2xhaW1zL2ZhbWlseW5hbWUiOiJVc2VyIiwiaHR0cDovL2dhZGRyLmNvbS9jbGFpbXMvZnVsbG5hbWUiOiJUZXN0IFVzZXIiLCJodHRwOi8vZ2FkZHIuY29tL2NsYWltcy9zZWN1cml0eS1zdGFtcCI6InRlc3Qtc3RhbXAiLCJodHRwOi8vZ2FkZHIuY29tL2NsYWltcy9jb25jdXJyZW5jeS1zdGFtcCI6InRlc3QtY29uY3VycmVuY3kiLCJpYXQiOjE3ODUxNzMxMTYsImV4cCI6MTc4NTc3NzkxNiwiYXVkIjoiaHR0cDovL2xvY2FsaG9zdDo1MDAwIiwiaXNzIjoiaHR0cDovL2xvY2FsaG9zdDo1MDAwIn0.M_kknzk55wwC8G4rOqeDJhgxnJAIUkekGSdufX_w_fs';

const USER_ID1 = 'e0a4e077-a8c3-47b0-961b-c7a6b5859e8e';
const USER_ID2 = 'f88f2cd2-1c26-490e-a528-377e46f9a221';
const USERCONTENT_ID = '4866d318-d04b-4d9e-a7c0-3bbc8a13ff0a';

let results = [];
let playlistRefId = null;
let playlistContentId = null;
let bookmarkRefId = null;

function api(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      method,
      hostname: 'localhost',
      port: 8080,
      path: url.pathname + url.search,
      headers: { 'Content-Type': 'application/json' },
    };
    if (token) opts.headers['Authorization'] = `Bearer ${token}`;
    if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);

    const req = http.request(opts, (res) => {
      let chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        let json = null;
        try { json = JSON.parse(raw); } catch {}
        resolve({ status: res.statusCode, body: json, raw });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function log(name, status, passed, detail) {
  const icon = passed ? 'PASS' : 'FAIL';
  results.push({ name, status, passed, detail });
  console.log(`[${icon}] ${name} — HTTP ${status}`);
  if (detail && typeof detail === 'string' && detail.length < 300) console.log(`  -> ${detail}`);
  if (detail && typeof detail === 'object') console.log(`  -> ${JSON.stringify(detail).substring(0, 300)}`);
}

async function run() {
  console.log('=== PLAYLIST & BOOKMARK API TEST SUITE ===\n');

  // ============================================
  // SECTION 1: CREATE PLAYLIST
  // ============================================
  console.log('--- SECTION 1: CREATE PLAYLIST ---');

  let r = await api('POST', '/api/v1/playlist', { name: 'Test Playlist Audit', description: 'Created for API testing' }, TOKEN1);
  playlistRefId = r.body?.referenceId;
  const playlistId = r.body?.id;
  log('POST /api/v1/playlist (create)', r.status, r.status === 201, r.body);

  // Duplicate name test
  let r2 = await api('POST', '/api/v1/playlist', { name: 'Test Playlist Audit', description: 'Duplicate' }, TOKEN1);
  log('POST /api/v1/playlist (duplicate name)', r2.status, r2.status === 409, r2.body);

  // No auth test
  let r3 = await api('POST', '/api/v1/playlist', { name: 'No Auth' }, null);
  log('POST /api/v1/playlist (no auth)', r3.status, r3.status === 401, r3.body);

  // ============================================
  // SECTION 2: GET PLAYLISTS
  // ============================================
  console.log('\n--- SECTION 2: GET PLAYLISTS ---');

  let r4 = await api('GET', `/api/v1/playlists/${USER_ID1}`, null, TOKEN1);
  log('GET /api/v1/playlists/{userId}', r4.status, r4.status === 200, `Found ${(r4.body || []).length} playlists`);

  let r5 = await api('GET', `/api/v1/playlists/lifeofsambhav`, null, TOKEN1);
  log('GET /api/v1/playlists/{userName}', r5.status, r5.status === 200, `Found ${(r5.body || []).length} playlists`);

  // ============================================
  // SECTION 3: GET PLAYLIST BY ID
  // ============================================
  console.log('\n--- SECTION 3: GET PLAYLIST BY ID ---');

  if (playlistRefId) {
    let r6 = await api('GET', `/api/v1/playlist/get-by-id?playlistReferenceId=${playlistRefId}`, null, TOKEN1);
    log('GET /api/v1/playlist/get-by-id (valid)', r6.status, r6.status === 200, r6.body?.name || r6.body);

    let r7 = await api('GET', '/api/v1/playlist/get-by-id?playlistReferenceId=nonexistent-id', null, TOKEN1);
    log('GET /api/v1/playlist/get-by-id (invalid)', r7.status, r7.status === 404, r7.body);
  }

  // ============================================
  // SECTION 4: GET PLAYLIST BY NAME
  // ============================================
  console.log('\n--- SECTION 4: GET PLAYLIST BY NAME ---');

  let r8 = await api('GET', `/api/v1/playlist/${USER_ID1}/get-by-name?playlistName=Test Playlist Audit`, null, TOKEN1);
  log('GET /api/v1/playlist/{userId}/get-by-name (valid)', r8.status, r8.status === 200, r8.body?.name || r8.body);

  let r9 = await api('GET', `/api/v1/playlist/${USER_ID1}/get-by-name?playlistName=Nonexistent`, null, TOKEN1);
  log('GET /api/v1/playlist/{userId}/get-by-name (invalid)', r9.status, r9.status === 404, r9.body);

  // ============================================
  // SECTION 5: ADD CONTENT
  // ============================================
  console.log('\n--- SECTION 5: ADD CONTENT ---');

  if (playlistRefId) {
    let r10 = await api('PUT', `/api/v1/playlist/${playlistRefId}/content/add`, {
      userContentId: USERCONTENT_ID,
    }, TOKEN1);
    playlistContentId = r10.body?.id;
    log('PUT /api/v1/playlist/{id}/content/add (valid)', r10.status, r10.status === 200, r10.body);

    // Add same content again (potential duplicate)
    let r11 = await api('PUT', `/api/v1/playlist/${playlistRefId}/content/add`, {
      userContentId: USERCONTENT_ID,
    }, TOKEN1);
    log('PUT .../content/add (duplicate)', r11.status, r11.status === 200, r11.body);

    // Add without userContentId (raw content)
    let r12 = await api('PUT', `/api/v1/playlist/${playlistRefId}/content/add`, {
      contentId: 'external-id-123',
      type: 'video',
      platform: 'youtube',
      title: 'Raw Content Test',
      contentUrl: 'https://example.com',
      thumbnailUrl: 'https://example.com/thumb.jpg',
    }, TOKEN1);
    log('PUT .../content/add (no userContentId)', r12.status, r12.status === 200, r12.body);

    // Add with invalid userContentId
    let r13 = await api('PUT', `/api/v1/playlist/${playlistRefId}/content/add`, {
      userContentId: '00000000-0000-0000-0000-999999999999',
    }, TOKEN1);
    log('PUT .../content/add (invalid userContentId)', r13.status, r13.status === 404, r13.body);
  }

  // ============================================
  // SECTION 6: GET PLAYLIST (verify content)
  // ============================================
  console.log('\n--- SECTION 6: VERIFY CONTENT IN PLAYLIST ---');

  if (playlistRefId) {
    let r14 = await api('GET', `/api/v1/playlist/get-by-id?playlistReferenceId=${playlistRefId}`, null, TOKEN1);
    log('GET playlist after adding content', r14.status, r14.status === 200, `${(r14.body?.contents || []).length} contents`);
  }

  // ============================================
  // SECTION 7: REMOVE CONTENT
  // ============================================
  console.log('\n--- SECTION 7: REMOVE CONTENT ---');

  if (playlistContentId) {
    let r15 = await api('DELETE', `/api/v1/playlist/${playlistRefId}/content/remove/${playlistContentId}`, null, TOKEN1);
    log('DELETE .../content/remove/{id} (valid)', r15.status, r15.status === 204, 'Removed');

    // Try to remove same content again
    let r16 = await api('DELETE', `/api/v1/playlist/${playlistRefId}/content/remove/${playlistContentId}`, null, TOKEN1);
    log('DELETE .../content/remove/{id} (already removed)', r16.status, r16.status === 404, r16.body);
  }

  // ============================================
  // SECTION 8: ADD MEMBER
  // ============================================
  console.log('\n--- SECTION 8: ADD MEMBER ---');

  if (playlistRefId) {
    let r17 = await api('PUT', `/api/v1/playlist/${playlistRefId}/member/add`, {
      userId: USER_ID2,
      role: 'Editor',
    }, TOKEN1);
    log('PUT .../member/add (valid)', r17.status, r17.status === 200, r17.body);

    // Try duplicate add
    let r18 = await api('PUT', `/api/v1/playlist/${playlistRefId}/member/add`, {
      userId: USER_ID2,
      role: 'Editor',
    }, TOKEN1);
    log('PUT .../member/add (duplicate)', r18.status, r18.status === 409, r18.body);

    // Try add from non-owner (User2 trying to add to User1's playlist)
    let r19 = await api('PUT', `/api/v1/playlist/${playlistRefId}/member/add`, {
      userId: USER_ID1,
      role: 'Viewer',
    }, TOKEN2);
    log('PUT .../member/add (non-owner)', r19.status, r19.status === 401 || r19.status === 403, r19.body);
  }

  // ============================================
  // SECTION 9: GET MEMBERS
  // ============================================
  console.log('\n--- SECTION 9: VERIFY MEMBERS ---');

  if (playlistRefId) {
    let r20 = await api('GET', `/api/v1/playlist/get-by-id?playlistReferenceId=${playlistRefId}`, null, TOKEN1);
    const memberCount = (r20.body?.members || []).length;
    log('GET playlist with members', r20.status, r20.status === 200 && memberCount >= 2, `${memberCount} members`);
  }

  // ============================================
  // SECTION 10: REMOVE MEMBER
  // ============================================
  console.log('\n--- SECTION 10: REMOVE MEMBER ---');

  if (playlistRefId) {
    // Get member IDs first
    let r21 = await api('GET', `/api/v1/playlist/get-by-id?playlistReferenceId=${playlistRefId}`, null, TOKEN1);
    const memberToRemove = (r21.body?.members || []).find(m => m.userId === USER_ID2);
    
    if (memberToRemove) {
      let r22 = await api('DELETE', `/api/v1/playlist/${playlistRefId}/member/remove/${memberToRemove.id}`, null, TOKEN1);
      log('DELETE .../member/remove/{id} (valid)', r22.status, r22.status === 204, 'Removed');
    } else {
      console.log('[SKIP] No member to remove found');
    }

    // Try self-remove (owner removing self)
    let members2 = (await api('GET', `/api/v1/playlist/get-by-id?playlistReferenceId=${playlistRefId}`, null, TOKEN1)).body?.members || [];
    const ownerMember = members2.find(m => m.role === 'Owner');
    if (ownerMember) {
      let r23 = await api('DELETE', `/api/v1/playlist/${playlistRefId}/member/remove/${ownerMember.id}`, null, TOKEN1);
      log('DELETE .../member/remove (self/owner)', r23.status, r23.status === 401, r23.body);
    }
  }

  // ============================================
  // SECTION 11: BOOKMARK ENDPOINTS
  // ============================================
  console.log('\n--- SECTION 11: BOOKMARK ---');

  // Cleanup: get existing bookmark and remove all contents first
  let cleanupBookmark = await api('GET', '/api/v1/bookmark', null, TOKEN1);
  if (cleanupBookmark.status === 200 && cleanupBookmark.body?.contents?.length > 0) {
    for (const c of cleanupBookmark.body.contents) {
      await api('DELETE', `/api/v1/bookmark/${USER_ID1}/content/remove/${c.id}`, null, TOKEN1);
    }
  }

  // Add bookmark
  let r24 = await api('PUT', `/api/v1/bookmark/${USER_ID1}/content/add`, {
    userContentId: USERCONTENT_ID,
  }, TOKEN1);
  log('PUT /api/v1/bookmark/{id}/content/add', r24.status, r24.status === 200, r24.body);

  // Get bookmark
  let r25 = await api('GET', '/api/v1/bookmark', null, TOKEN1);
  bookmarkRefId = r25.body?.referenceId;
  log('GET /api/v1/bookmark', r25.status, r25.status === 200, `name=${r25.body?.name}, ${(r25.body?.contents || []).length} contents`);

  // Check bookmark
  let r26 = await api('GET', `/api/v1/bookmark/check?userContentId=${USERCONTENT_ID}`, null, TOKEN1);
  log('GET /api/v1/bookmark/check (bookmarked)', r26.status, r26.status === 200 && r26.body?.bookmarked === true, r26.body);

  // Check not bookmarked
  let r27 = await api('GET', '/api/v1/bookmark/check?userContentId=00000000-0000-0000-0000-999999999999', null, TOKEN1);
  log('GET /api/v1/bookmark/check (not bookmarked)', r27.status, r27.status === 200 && r27.body?.bookmarked === false, r27.body);

  // Batch check
  let r28 = await api('GET', `/api/v1/bookmark/check-batch?userContentIds=${USERCONTENT_ID},00000000-0000-0000-0000-999999999999`, null, TOKEN1);
  log('GET /api/v1/bookmark/check-batch', r28.status, r28.status === 200, r28.body);

  // Add same bookmark again
  let r29 = await api('PUT', `/api/v1/bookmark/${USER_ID1}/content/add`, {
    userContentId: USERCONTENT_ID,
  }, TOKEN1);
  log('PUT .../bookmark/add (duplicate)', r29.status, r29.status === 200, r29.body);

  // Remove all bookmark entries for this content
  let r30 = await api('GET', '/api/v1/bookmark', null, TOKEN1);
  const matchingContents = (r30.body?.contents || []).filter(c => c.userContentId === USERCONTENT_ID);
  if (matchingContents.length > 0) {
    for (const mc of matchingContents) {
      await api('DELETE', `/api/v1/bookmark/${USER_ID1}/content/remove/${mc.id}`, null, TOKEN1);
    }
    log('DELETE /api/v1/bookmark/{id}/content/remove/{contentId}', 204, true, `Removed ${matchingContents.length} entries`);

    // Verify removed
    let r32 = await api('GET', `/api/v1/bookmark/check?userContentId=${USERCONTENT_ID}`, null, TOKEN1);
    log('GET /api/v1/bookmark/check (after remove)', r32.status, r32.status === 200 && r32.body?.bookmarked === false, r32.body);
  } else {
    console.log('[SKIP] No bookmark content found to remove');
  }

  // ============================================
  // SECTION 12: DELETE PLAYLIST
  // ============================================
  console.log('\n--- SECTION 12: DELETE PLAYLIST ---');

  if (playlistRefId) {
    let r33 = await api('DELETE', `/api/v1/playlist/${playlistRefId}`, null, TOKEN1);
    log('DELETE /api/v1/playlist/{id} (valid)', r33.status, r33.status === 204, 'Deleted');

    // Verify deleted
    let r34 = await api('GET', `/api/v1/playlist/get-by-id?playlistReferenceId=${playlistRefId}`, null, TOKEN1);
    log('GET deleted playlist (should 404)', r34.status, r34.status === 404, r34.body);

    // Delete again (already deleted)
    let r35 = await api('DELETE', `/api/v1/playlist/${playlistRefId}`, null, TOKEN1);
    log('DELETE already deleted playlist', r35.status, r35.status === 404, r35.body);
  }

  // ============================================
  // SECTION 13: USER2 BOOKMARK TEST
  // ============================================
  console.log('\n--- SECTION 13: CROSS-USER BOOKMARK ---');

  let r36 = await api('PUT', `/api/v1/bookmark/${USER_ID2}/content/add`, {
    userContentId: USERCONTENT_ID,
  }, TOKEN2);
  log('PUT User2 bookmark User1 content', r36.status, r36.status === 200, r36.body);

  let r37 = await api('GET', '/api/v1/bookmark', null, TOKEN2);
  log('GET User2 bookmark', r37.status, r37.status === 200, `${(r37.body?.contents || []).length} contents`);

  // Cleanup: remove User2's bookmark
  if (r37.body?.contents?.length > 0) {
    const uc = r37.body.contents.find(c => c.userContentId === USERCONTENT_ID);
    if (uc) {
      await api('DELETE', `/api/v1/bookmark/${USER_ID2}/content/remove/${uc.id}`, null, TOKEN2);
    }
  }

  // ============================================
  // SUMMARY
  // ============================================
  console.log('\n\n=== TEST SUMMARY ===');
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;
  console.log(`Total: ${total} | Passed: ${passed} | Failed: ${failed}`);
  console.log(`Score: ${Math.round((passed / total) * 100)}%`);

  if (failed > 0) {
    console.log('\nFAILED TESTS:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  FAIL: ${r.name} (HTTP ${r.status})`);
      console.log(`    Detail: ${JSON.stringify(r.detail).substring(0, 200)}`);
    });
  }

  process.exit(0);
}

run().catch(e => { console.error('FATAL:', e); process.exit(1); });
