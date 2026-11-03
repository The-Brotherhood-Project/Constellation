/*
 * Copyright (C) 2026 The Brotherhood Project Developers
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import fastify from 'fastify';
import * as crypto from 'crypto';

const server = fastify({
  logger: true
});

// In-memory revocation store
const revokedTokens = new Set<string>();

// Helper to determine if parent capability subsumes child capability
function capabilitySubsumes(parent: any, child: any): boolean {
  if (!parent || !child) return false;
  
  // Check resource ('with')
  if (parent.with !== '*' && parent.with !== child.with) {
    return false;
  }
  
  // Check action ('can')
  if (parent.can === '*') {
    return true;
  }
  if (parent.can === child.can) {
    return true;
  }
  if (parent.can.endsWith('/*')) {
    const prefix = parent.can.slice(0, -2);
    return child.can.startsWith(prefix);
  }
  
  return false;
}

// Parse JWK from did:jwk DID (supports OKP/Ed25519 and RSA key types)
function parseJwkFromDid(did: string): any {
  if (!did.startsWith('did:jwk:')) {
    throw new Error('Unsupported DID method: only did:jwk is supported');
  }
  const base64UrlJwk = did.substring('did:jwk:'.length);
  const jwkJson = Buffer.from(base64UrlJwk, 'base64url').toString('utf8');
  return JSON.parse(jwkJson);
}

// Verify a single token signature, expiration, and revocation status
function verifySignatureAndExpiry(token: string): { valid: boolean; reason?: string; payload?: any } {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return { valid: false, reason: 'Malformed token: must have 3 parts' };
  }
  
  const [headerB64, payloadB64, signatureB64] = parts;
  let header: any;
  let payload: any;
  
  try {
    header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch (err: any) {
    return { valid: false, reason: `Malformed token JSON: ${err.message}` };
  }
  
  // Verify UCAN 1.0.0 header fields
  if (header.ucv !== '1.0.0') {
    return { valid: false, reason: `Unsupported UCAN version: expected 1.0.0, got ${header.ucv}` };
  }
  if (header.alg !== 'EdDSA') {
    return { valid: false, reason: `Unsupported signature algorithm: expected EdDSA, got ${header.alg}` };
  }
  
  // Verify expiration (exp=0 means no expiry)
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp !== 0 && (typeof payload.exp !== 'number' || payload.exp < now)) {
    return { valid: false, reason: 'Token has expired' };
  }
  
  // Verify nbf
  if (payload.nbf !== undefined && (typeof payload.nbf !== 'number' || payload.nbf > now)) {
    return { valid: false, reason: 'Token is not active yet (nbf check)' };
  }
  
  // Verify revocation status
  if (payload.jti && revokedTokens.has(payload.jti)) {
    return { valid: false, reason: 'Token has been revoked' };
  }
  
  // Resolve issuer DID to public key
  let publicKey: crypto.KeyObject;
  try {
    const jwk = parseJwkFromDid(payload.iss);
    publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  } catch (err: any) {
    return { valid: false, reason: `Failed to resolve issuer DID: ${err.message}` };
  }
  
  // Verify signature
  try {
    const data = Buffer.from(`${headerB64}.${payloadB64}`);
    const signature = Buffer.from(signatureB64, 'base64url');
    
    const isValid = crypto.verify(null, data, publicKey, signature);
    if (!isValid) {
      return { valid: false, reason: 'Signature mismatch' };
    }
  } catch (err: any) {
    return { valid: false, reason: `Signature verification failed: ${err.message}` };
  }
  
  return { valid: true, payload };
}

// Recursive chain verification
async function verifyTokenChain(
  token: string,
  expectedAudience?: string,
  requiredCapability?: any
): Promise<{ valid: boolean; reason?: string; claims?: any; proofs?: string[] }> {
  // 1. Basic token verify
  const baseResult = verifySignatureAndExpiry(token);
  if (!baseResult.valid) {
    return { valid: false, reason: baseResult.reason };
  }
  
  const payload = baseResult.payload;
  
  // 2. Audience validation
  if (expectedAudience && payload.aud !== expectedAudience) {
    return { valid: false, reason: `Audience mismatch: expected ${expectedAudience}, got ${payload.aud}` };
  }
  
  // 3. Capability validation
  if (requiredCapability) {
    // Check direct attenuations
    const att = payload.att || [];
    const now = Math.floor(Date.now() / 1000);
    const directMatch = att.some((cap: any) => {
      // Check capability subsumption
      if (!capabilitySubsumes(cap, requiredCapability)) {
        return false;
      }
      // Check capability-level expiration
      if (cap.exp !== undefined && (typeof cap.exp !== 'number' || cap.exp < now)) {
        return false;
      }
      // Check capability-level not-before
      if (cap.nb !== undefined && (typeof cap.nb !== 'number' || cap.nb > now)) {
        return false;
      }
      return true;
    });
    
    if (!directMatch) {
      // If not directly matched, check if delegated via proofs
      const proofs = payload.prf || [];
      if (proofs.length === 0) {
        return {
          valid: false,
          reason: `Required capability ${JSON.stringify(requiredCapability)} not granted by token`
        };
      }
      
      let proofValid = false;
      let lastErrorReason = 'No valid proofs found to delegate capability';
      for (const proofToken of proofs) {
        // The proof audience must match the current issuer (who delegates it)
        const proofResult = await verifyTokenChain(proofToken, payload.iss, requiredCapability);
        if (proofResult.valid) {
          proofValid = true;
          break;
        } else {
          lastErrorReason = `Proof delegation invalid: ${proofResult.reason}`;
        }
      }
      
      if (!proofValid) {
        return { valid: false, reason: lastErrorReason };
      }
    }
  }
  return {
    valid: true,
    claims: payload,
    proofs: payload.prf || []
  };
}

// GET /health
server.get('/health', async () => {
  return { status: 'ok', version: '1.0.0' };
});

// POST /keygen
server.post('/keygen', async (request, reply) => {
  const body = (request.body || {}) as any;
  const password = body.password;
  
  try {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    
    const publicKeyPem = publicKey.export({
      type: 'spki',
      format: 'pem'
    }) as string;
    
    const privateKeyPem = privateKey.export({
      type: 'pkcs8',
      format: 'pem',
      cipher: password ? 'aes-256-cbc' : undefined,
      passphrase: password || undefined
    }) as string;
    
    // did:jwk generation using OKP key type for Ed25519
    const jwk = publicKey.export({ format: 'jwk' }) as any;
    const standardJwk = {
      kty: 'OKP',
      crv: 'Ed25519',
      x: jwk.x
    };
    
    const did = 'did:jwk:' + Buffer.from(JSON.stringify(standardJwk)).toString('base64url');
    
    return {
      did,
      publicKey: publicKeyPem,
      privateKey: privateKeyPem
    };
  } catch (err: any) {
    return reply.status(500).send({ error: `Key generation failed: ${err.message}` });
  }
});

// POST /issue
server.post('/issue', async (request, reply) => {
  const body = (request.body || {}) as any;
  const {
    issuerPrivateKey,
    issuerPassword,
    audience,
    capabilities,
    proofs,
    facts,
    expiration,
    notBefore,
    jti
  } = body;
  
  if (!issuerPrivateKey || !audience || !capabilities || expiration == null) {
    return reply.status(400).send({ error: 'Missing required parameters: issuerPrivateKey, audience, capabilities, and expiration are required' });
  }
  
  let privateKey: crypto.KeyObject;
  try {
    privateKey = crypto.createPrivateKey({
      key: issuerPrivateKey,
      format: 'pem',
      passphrase: issuerPassword || undefined
    });
  } catch (err: any) {
    return reply.status(401).send({ error: `Failed to decrypt/load private key: ${err.message}` });
  }
  
  try {
    const publicKey = crypto.createPublicKey(privateKey);
    const jwk = publicKey.export({ format: 'jwk' }) as any;
    const standardJwk = {
      kty: 'OKP',
      crv: 'Ed25519',
      x: jwk.x
    };
    const iss = 'did:jwk:' + Buffer.from(JSON.stringify(standardJwk)).toString('base64url');
    
    const header = {
      alg: 'EdDSA',
      typ: 'JWT',
      ucv: '1.0.0'
    };
    
    const payload: any = {
      iss,
      aud: audience,
      exp: expiration,
      att: capabilities,
      fct: facts || [],
      prf: proofs || [],
      jti: jti || crypto.randomUUID().toString()
    };
    
    if (notBefore !== undefined) {
      payload.nbf = notBefore;
    }
    
    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    
    const tokenInput = `${headerB64}.${payloadB64}`;
    const signatureB64 = crypto.sign(null, Buffer.from(tokenInput), privateKey).toString('base64url');
    
    return {
      token: `${tokenInput}.${signatureB64}`
    };
  } catch (err: any) {
    return reply.status(500).send({ error: `Failed to issue UCAN token: ${err.message}` });
  }
});

// POST /verify
server.post('/verify', async (request, reply) => {
  const body = (request.body || {}) as any;
  const { token, expectedAudience, requiredCapability } = body;
  
  if (!token) {
    return reply.status(400).send({ error: 'Missing token parameter' });
  }
  
  try {
    const result = await verifyTokenChain(token, expectedAudience, requiredCapability);
    if (!result.valid) {
      return reply.status(400).send({
        valid: false,
        reason: result.reason,
        claims: null
      });
    }
    
    return {
      valid: true,
      claims: result.claims,
      proofs: result.proofs
    };
  } catch (err: any) {
    return reply.status(500).send({ error: `Verification encountered unexpected error: ${err.message}` });
  }
});

// POST /revoke
server.post('/revoke', async (request, reply) => {
  const body = (request.body || {}) as any;
  const { jti } = body;
  
  if (!jti) {
    return reply.status(400).send({ error: 'Missing jti parameter' });
  }
  
  revokedTokens.add(jti);
  return {
    revoked: true,
    jti
  };
});

// POST /resolve
server.post('/resolve', async (request, reply) => {
  const body = (request.body || {}) as any;
  const { did } = body;
  
  if (!did) {
    return reply.status(400).send({ error: 'Missing did parameter' });
  }
  
  try {
    const jwk = parseJwkFromDid(did);
    const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    const publicKeyPem = publicKey.export({
      type: 'spki',
      format: 'pem'
    }) as string;
    
    return {
      publicKey: publicKeyPem,
      type: jwk.kty
    };
  } catch (err: any) {
    return reply.status(400).send({ error: `Failed to resolve DID: ${err.message}` });
  }
});

server.post('/extract', async (request, reply) => {
  const body = (request.body || {}) as any;
  const { token } = body;
  if (!token) {
    return reply.status(400).send({ error: 'Missing token parameter' });
  }
  
  try {
    const [header, payload, _] = token.split('.');
    const headerObj = JSON.parse(Buffer.from(header, 'base64url').toString('utf8'));
    const payloadObj = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return {
      header: headerObj,
      payload: payloadObj
    };
  } catch (err: any) {
    return reply.status(500).send({ error: `Failed to extract delegation payload: ${err.message}` });
  }
})

const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3000;
    await server.listen({ port, host: '0.0.0.0' });
    console.log(`UCAN service running at http://0.0.0.0:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

if (require.main === module) {
  start();
}

export { server };
