import { strict as assert } from 'assert';
import { server } from './server.js';

async function runTests() {
  console.log('Running UCAN Service Tests...');

  try {
    // 1. Test /health
    const healthRes = await server.inject({
      method: 'GET',
      url: '/health'
    });
    assert.equal(healthRes.statusCode, 200);
    const healthBody = JSON.parse(healthRes.body);
    assert.equal(healthBody.status, 'ok');
    console.log('✓ GET /health passed');

    // 2. Test /keygen without password
    const keygenRes = await server.inject({
      method: 'POST',
      url: '/keygen',
      payload: {}
    });
    assert.equal(keygenRes.statusCode, 200);
    const keygenBody = JSON.parse(keygenRes.body);
    assert.ok(keygenBody.did.startsWith('did:jwk:'));
    assert.ok(keygenBody.publicKey.includes('-----BEGIN PUBLIC KEY-----'));
    assert.ok(keygenBody.privateKey.includes('-----BEGIN PRIVATE KEY-----'));
    const aliceKeys = keygenBody;
    console.log('✓ POST /keygen (no password) passed');

    // 3. Test /keygen with password
    const keygenPassRes = await server.inject({
      method: 'POST',
      url: '/keygen',
      payload: { password: 'aliceSecretPassword' }
    });
    assert.equal(keygenPassRes.statusCode, 200);
    const keygenPassBody = JSON.parse(keygenPassRes.body);
    assert.ok(keygenPassBody.did.startsWith('did:jwk:'));
    assert.ok(keygenPassBody.publicKey.includes('-----BEGIN PUBLIC KEY-----'));
    assert.ok(keygenPassBody.privateKey.includes('-----BEGIN ENCRYPTED PRIVATE KEY-----'));
    const bobKeys = keygenPassBody;
    console.log('✓ POST /keygen (with password) passed');

    // 4. Test /resolve
    const resolveRes = await server.inject({
      method: 'POST',
      url: '/resolve',
      payload: { did: aliceKeys.did }
    });
    assert.equal(resolveRes.statusCode, 200);
    const resolveBody = JSON.parse(resolveRes.body);
    assert.equal(resolveBody.type, 'OKP');
    assert.equal(resolveBody.publicKey.trim(), aliceKeys.publicKey.trim());
    console.log('✓ POST /resolve passed');

    // 5. Test /issue (Alice delegates to Bob)
    const expiration = Math.floor(Date.now() / 1000) + 3600;
    const capabilities = [
      {
        with: 'graph:123',
        can: 'graph/edit'
      }
    ];

    const issueRes = await server.inject({
      method: 'POST',
      url: '/issue',
      payload: {
        issuerPrivateKey: aliceKeys.privateKey,
        audience: bobKeys.did,
        capabilities,
        expiration
      }
    });
    assert.equal(issueRes.statusCode, 200);
    const issueBody = JSON.parse(issueRes.body);
    assert.ok(issueBody.token);
    const aliceToBobToken = issueBody.token;
    console.log('✓ POST /issue (Alice -> Bob) passed');

    // 6. Test /verify (Verify Alice -> Bob token)
    const verifyRes = await server.inject({
      method: 'POST',
      url: '/verify',
      payload: {
        token: aliceToBobToken,
        expectedAudience: bobKeys.did,
        requiredCapability: {
          with: 'graph:123',
          can: 'graph/edit'
        }
      }
    });
    assert.equal(verifyRes.statusCode, 200);
    const verifyBody = JSON.parse(verifyRes.body);
    assert.equal(verifyBody.valid, true);
    assert.equal(verifyBody.claims.iss, aliceKeys.did);
    assert.equal(verifyBody.claims.aud, bobKeys.did);
    console.log('✓ POST /verify (Alice -> Bob token) passed');

    // 7. Test /verify with capability checking (Subsumption check: graph/edit should subsume graph/read or graph/edit)
    const verifyCapRes = await server.inject({
      method: 'POST',
      url: '/verify',
      payload: {
        token: aliceToBobToken,
        requiredCapability: {
          with: 'graph:123',
          can: 'graph/edit'
        }
      }
    });
    assert.equal(verifyCapRes.statusCode, 200);
    assert.equal(JSON.parse(verifyCapRes.body).valid, true);
    console.log('✓ POST /verify (with capability subsumption) passed');

    // 8. Test /issue with encrypted private key (Bob delegates to Charlie)
    // First generate Charlie's keys
    const charlieKeygenRes = await server.inject({
      method: 'POST',
      url: '/keygen',
      payload: {}
    });
    const charlieKeys = JSON.parse(charlieKeygenRes.body);

    // Bob delegates the capability to Charlie
    const bobToCharlieRes = await server.inject({
      method: 'POST',
      url: '/issue',
      payload: {
        issuerPrivateKey: bobKeys.privateKey,
        issuerPassword: 'aliceSecretPassword', // correct passphrase
        audience: charlieKeys.did,
        capabilities,
        proofs: [aliceToBobToken],
        expiration
      }
    });
    assert.equal(bobToCharlieRes.statusCode, 200);
    const bobToCharlieToken = JSON.parse(bobToCharlieRes.body).token;
    console.log('✓ POST /issue (using encrypted private key and proofs) passed');

    // 9. Verify recursive proof chain (Verify Bob -> Charlie token)
    const verifyChainRes = await server.inject({
      method: 'POST',
      url: '/verify',
      payload: {
        token: bobToCharlieToken,
        expectedAudience: charlieKeys.did,
        requiredCapability: {
          with: 'graph:123',
          can: 'graph/edit'
        }
      }
    });
    assert.equal(verifyChainRes.statusCode, 200);
    const verifyChainBody = JSON.parse(verifyChainRes.body);
    assert.equal(verifyChainBody.valid, true);
    assert.equal(verifyChainBody.claims.iss, bobKeys.did);
    assert.equal(verifyChainBody.claims.aud, charlieKeys.did);
    assert.equal(verifyChainBody.proofs[0], aliceToBobToken);
    console.log('✓ POST /verify (recursive proof chain) passed');

    // 10. Test /revoke (Revoke Alice -> Bob token)
    const claims = verifyBody.claims;
    assert.ok(claims.jti);

    const revokeRes = await server.inject({
      method: 'POST',
      url: '/revoke',
      payload: { jti: claims.jti }
    });
    assert.equal(revokeRes.statusCode, 200);
    assert.equal(JSON.parse(revokeRes.body).revoked, true);
    console.log('✓ POST /revoke passed');

    // 11. Verify revoked token fails verification
    const verifyRevokedRes = await server.inject({
      method: 'POST',
      url: '/verify',
      payload: { token: aliceToBobToken }
    });
    assert.equal(verifyRevokedRes.statusCode, 400);
    const verifyRevokedBody = JSON.parse(verifyRevokedRes.body);
    assert.equal(verifyRevokedBody.valid, false);
    assert.ok(verifyRevokedBody.reason.includes('revoked'));
    console.log('✓ POST /verify (revoked token rejection) passed');

    // 12. Test capability-level exp/nb validation
    const pastTime = Math.floor(Date.now() / 1000) - 10;
    const futureTime = Math.floor(Date.now() / 1000) + 3600;

    // A: Expired capability
    const expiredCapTokenRes = await server.inject({
      method: 'POST',
      url: '/issue',
      payload: {
        issuerPrivateKey: aliceKeys.privateKey,
        audience: bobKeys.did,
        capabilities: [
          {
            with: 'graph:123',
            can: 'graph/edit',
            exp: pastTime
          }
        ],
        expiration: futureTime
      }
    });
    const expiredCapToken = JSON.parse(expiredCapTokenRes.body).token;

    const verifyExpiredCapRes = await server.inject({
      method: 'POST',
      url: '/verify',
      payload: {
        token: expiredCapToken,
        requiredCapability: {
          with: 'graph:123',
          can: 'graph/edit'
        }
      }
    });
    assert.equal(verifyExpiredCapRes.statusCode, 400);
    assert.equal(JSON.parse(verifyExpiredCapRes.body).valid, false);
    console.log('✓ POST /verify (capability-level exp in past rejected) passed');

    // B: Not-active-yet (nb in future) capability
    const inactiveCapTokenRes = await server.inject({
      method: 'POST',
      url: '/issue',
      payload: {
        issuerPrivateKey: aliceKeys.privateKey,
        audience: bobKeys.did,
        capabilities: [
          {
            with: 'graph:123',
            can: 'graph/edit',
            nb: futureTime
          }
        ],
        expiration: futureTime + 3600
      }
    });
    const inactiveCapToken = JSON.parse(inactiveCapTokenRes.body).token;

    const verifyInactiveCapRes = await server.inject({
      method: 'POST',
      url: '/verify',
      payload: {
        token: inactiveCapToken,
        requiredCapability: {
          with: 'graph:123',
          can: 'graph/edit'
        }
      }
    });
    assert.equal(verifyInactiveCapRes.statusCode, 400);
    assert.equal(JSON.parse(verifyInactiveCapRes.body).valid, false);
    console.log('✓ POST /verify (capability-level nb in future rejected) passed');

    // C: Valid capability-level constraints (exp in future, nb in past)
    const validCapTokenRes = await server.inject({
      method: 'POST',
      url: '/issue',
      payload: {
        issuerPrivateKey: aliceKeys.privateKey,
        audience: bobKeys.did,
        capabilities: [
          {
            with: 'graph:123',
            can: 'graph/edit',
            exp: futureTime,
            nb: pastTime
          }
        ],
        expiration: futureTime + 3600
      }
    });
    const validCapToken = JSON.parse(validCapTokenRes.body).token;

    const verifyValidCapRes = await server.inject({
      method: 'POST',
      url: '/verify',
      payload: {
        token: validCapToken,
        requiredCapability: {
          with: 'graph:123',
          can: 'graph/edit'
        }
      }
    });
    assert.equal(verifyValidCapRes.statusCode, 200);
    assert.equal(JSON.parse(verifyValidCapRes.body).valid, true);
    console.log('✓ POST /verify (valid capability-level exp/nb constraints) passed');

    console.log('All tests passed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Test suite failed:', error);
    process.exit(1);
  }
}

runTests();
