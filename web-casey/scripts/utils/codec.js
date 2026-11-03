/**
 * KNW v2.0, RVR v1.0, and CPB v1.0 Offline Codec
 * Encodes and decodes .knw v2.0, .rvr v1.0, and .cpb v1.0 binary files using local vendored zstd-wasm.
 * Conforms to RFC 8785 (JSON Canonicalization Scheme) and SHA-256 CID computation.
 */

const KNW_MAGIC = "KNW";
const KNW_MAGIC_BYTES = new Uint8Array([0x4B, 0x4E, 0x57]);
const RVR_MAGIC = "RVR";
const RVR_MAGIC_BYTES = new Uint8Array([0x52, 0x56, 0x52]);
const CPB_MAGIC = "CPB";
const CPB_MAGIC_BYTES = new Uint8Array([0x43, 0x50, 0x42]);

const PROTOCOL_VERSION_V2 = 2;
const RVR_PROTOCOL_VERSION_V1 = 1;
const CPB_PROTOCOL_VERSION_V1 = 1;
const COMPRESSION_ZSTD = 1;
const HEADER_SIZE = 6;

class KNWFormatError extends Error {
    constructor(message) {
        super(message);
        this.name = "KNWFormatError";
    }
}

let _zstdModulePromise = null;

/**
 * Initialize local vendored zstd-wasm
 */
async function getZstd() {
    if (_zstdModulePromise) return _zstdModulePromise;

    _zstdModulePromise = (async () => {
        try {
            // Import local vendor ESM (from scripts/utils/ -> ../../vendor/)
            const mod = await import('../../vendor/zstd.esm.js');
            const wasmUrl = new URL('../../vendor/zstd.wasm', import.meta.url).href;
            if (typeof mod.init === 'function') {
                await mod.init(wasmUrl);
            }
            if (typeof mod.compress !== 'function' || typeof mod.decompress !== 'function') {
                throw new Error('zstd module did not export compress/decompress');
            }
            return { compress: mod.compress, decompress: mod.decompress };
        } catch (err) {
            console.error('Failed to load local zstd-wasm module:', err);
            throw new KNWFormatError(`Failed to initialize offline zstd: ${err.message}`);
        }
    })();

    return _zstdModulePromise;
}

/**
 * RFC 8785 JSON Canonicalization Scheme (JCS) serializer
 */
function canonicalJSON(value) {
    return jcsSerialize(value, new WeakSet());
}

function jcsSerialize(value, seen) {
    if (value === null) return "null";
    if (value === undefined) {
        throw new KNWFormatError("JCS: cannot serialize undefined value");
    }
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "string") return JSON.stringify(value);
    if (typeof value === "number") {
        if (!Number.isFinite(value)) {
            throw new KNWFormatError(`JCS: non-finite number ${value}`);
        }
        if (Object.is(value, -0)) return "0";
        return value.toString();
    }
    if (Array.isArray(value)) {
        if (seen.has(value)) throw new KNWFormatError("JCS: cyclic array");
        seen.add(value);
        try {
            const parts = [];
            for (let i = 0; i < value.length; i++) {
                parts.push(jcsSerialize(value[i], seen));
            }
            return "[" + parts.join(",") + "]";
        } finally {
            seen.delete(value);
        }
    }
    if (typeof value === "object") {
        if (seen.has(value)) throw new KNWFormatError("JCS: cyclic object");
        seen.add(value);
        try {
            const keys = Object.keys(value).sort();
            const parts = [];
            for (let i = 0; i < keys.length; i++) {
                const k = keys[i];
                const v = value[k];
                if (v === undefined) continue;
                parts.push(JSON.stringify(k) + ":" + jcsSerialize(v, seen));
            }
            return "{" + parts.join(",") + "}";
        } finally {
            seen.delete(value);
        }
    }
    throw new KNWFormatError(`JCS: unsupported type ${typeof value}`);
}

/**
 * Compute SHA-256 hash using Web Crypto API
 * Returns hex-encoded digest
 */
async function computeCID(graphObject) {
    const canonicalStr = canonicalJSON(graphObject);
    const bytes = new TextEncoder().encode(canonicalStr);
    const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Validate KNW v2.0 structure
 */
function validateKNWV2Payload(payload) {
    if (!payload || typeof payload !== "object") {
        throw new KNWFormatError("Payload must be a non-null object");
    }
    if (!payload.metadata || typeof payload.metadata !== "object") {
        throw new KNWFormatError("Missing or invalid metadata block");
    }
    if (!payload.graph || typeof payload.graph !== "object") {
        throw new KNWFormatError("Missing or invalid graph block");
    }
    if (!Array.isArray(payload.graph.nodes)) {
        throw new KNWFormatError("graph.nodes must be an array");
    }
    if (payload.graph.domains !== undefined && !Array.isArray(payload.graph.domains)) {
        throw new KNWFormatError("graph.domains must be an array when present");
    }
    if (payload.graph.hyperedges !== undefined && !Array.isArray(payload.graph.hyperedges)) {
        throw new KNWFormatError("graph.hyperedges must be an array when present");
    }
    if (payload.positions !== undefined && (typeof payload.positions !== "object" || payload.positions === null || Array.isArray(payload.positions))) {
        throw new KNWFormatError("positions must be an object when present");
    }
}

/**
 * Validate RVR v1.0 structure
 */
function validateRVRV1Payload(payload) {
    if (!payload || typeof payload !== "object") {
        throw new KNWFormatError("Payload must be a non-null object");
    }
    if (!payload.metadata || typeof payload.metadata !== "object") {
        throw new KNWFormatError("Missing or invalid metadata block");
    }
    if (!payload.resources || typeof payload.resources !== "object") {
        throw new KNWFormatError("Missing or invalid resources block");
    }
    if (payload.resources.bibliographies !== undefined && !Array.isArray(payload.resources.bibliographies)) {
        throw new KNWFormatError("resources.bibliographies must be an array when present");
    }
    if (payload.resources.attachments !== undefined && !Array.isArray(payload.resources.attachments)) {
        throw new KNWFormatError("resources.attachments must be an array when present");
    }
}

/**
 * Validate CPB v1.0 structure
 */
function validateCPBV1Payload(payload) {
    if (!payload || typeof payload !== "object") {
        throw new KNWFormatError("Payload must be a non-null object");
    }
    if (!payload.metadata || typeof payload.metadata !== "object") {
        throw new KNWFormatError("Missing or invalid metadata block in CPB");
    }
    if (!Array.isArray(payload.capabilities)) {
        throw new KNWFormatError("CPB capabilities must be an array");
    }
    if (payload.evaluation_set !== undefined && !Array.isArray(payload.evaluation_set)) {
        throw new KNWFormatError("CPB evaluation_set must be an array when present");
    }
}

/**
 * Encode KNW v2.0 to binary Uint8Array
 */
async function encodeKNWV2(metadata, graph, positions = {}) {
    const cid = await computeCID(graph);
    const fullMetadata = {
        ...metadata,
        cid: cid,
        created: metadata.created || new Date().toISOString()
    };

    const payload = {
        metadata: fullMetadata,
        graph: graph,
        positions: positions
    };
    validateKNWV2Payload(payload);

    const canonicalBytes = new TextEncoder().encode(canonicalJSON(payload));
    const zstd = await getZstd();
    const compressed = zstd.compress(canonicalBytes);

    const header = new Uint8Array(HEADER_SIZE);
    header.set(KNW_MAGIC_BYTES, 0);
    header[3] = PROTOCOL_VERSION_V2 & 0xFF;
    header[4] = (PROTOCOL_VERSION_V2 >> 8) & 0xFF;
    header[5] = COMPRESSION_ZSTD;

    const out = new Uint8Array(HEADER_SIZE + compressed.length);
    out.set(header, 0);
    out.set(compressed, HEADER_SIZE);

    return { bytes: out, cid: cid };
}

/**
 * Encode RVR v1.0 to binary Uint8Array
 */
async function encodeRVRV1(metadata, resources) {
    const cid = await computeCID(resources);
    const fullMetadata = {
        ...metadata,
        cid: cid,
        created: metadata.created || new Date().toISOString()
    };

    const payload = {
        metadata: fullMetadata,
        resources: resources
    };
    validateRVRV1Payload(payload);

    const canonicalBytes = new TextEncoder().encode(canonicalJSON(payload));
    const zstd = await getZstd();
    const compressed = zstd.compress(canonicalBytes);

    const header = new Uint8Array(HEADER_SIZE);
    header.set(RVR_MAGIC_BYTES, 0);
    header[3] = RVR_PROTOCOL_VERSION_V1 & 0xFF;
    header[4] = (RVR_PROTOCOL_VERSION_V1 >> 8) & 0xFF;
    header[5] = COMPRESSION_ZSTD;

    const out = new Uint8Array(HEADER_SIZE + compressed.length);
    out.set(header, 0);
    out.set(compressed, HEADER_SIZE);

    return { bytes: out, cid: cid };
}

/**
 * Encode CPB v1.0 to binary Uint8Array
 */
async function encodeCPBV1(payload) {
    validateCPBV1Payload(payload);

    const fullPayload = {
        metadata: {
            user_did: payload.metadata?.user_did || "",
            issuer_did: payload.metadata?.issuer_did || null,
            graph_data: payload.metadata?.graph_data || { cid: null, version_label: "" },
            algorithm_data: payload.metadata?.algorithm_data || { did: "", name: "", version: "" },
            created: payload.metadata?.created || new Date().toISOString(),
            use_before: payload.metadata?.use_before || null,
            signature: payload.metadata?.signature || null
        },
        capabilities: payload.capabilities || [],
        evaluation_set: payload.evaluation_set || []
    };

    const canonicalBytes = new TextEncoder().encode(canonicalJSON(fullPayload));
    const zstd = await getZstd();
    const compressed = zstd.compress(canonicalBytes);

    const header = new Uint8Array(HEADER_SIZE);
    header.set(CPB_MAGIC_BYTES, 0);
    header[3] = CPB_PROTOCOL_VERSION_V1 & 0xFF;
    header[4] = (CPB_PROTOCOL_VERSION_V1 >> 8) & 0xFF;
    header[5] = COMPRESSION_ZSTD;

    const out = new Uint8Array(HEADER_SIZE + compressed.length);
    out.set(header, 0);
    out.set(compressed, HEADER_SIZE);

    const cid = await computeCID(fullPayload);
    return { bytes: out, cid: cid, payload: fullPayload };
}

/**
 * Decode KNW v2.0 binary file
 */
async function decodeKNWV2(blob) {
    if (!(blob instanceof Uint8Array)) {
        throw new KNWFormatError("blob must be a Uint8Array");
    }
    if (blob.length < HEADER_SIZE) {
        throw new KNWFormatError("File too short for valid KNW header");
    }

    const magic = String.fromCharCode(blob[0], blob[1], blob[2]);
    const version = blob[3] | (blob[4] << 8);
    const compression = blob[5];

    if (magic !== KNW_MAGIC) {
        throw new KNWFormatError(`Invalid magic header: expected "KNW", got "${magic}"`);
    }
    if (version !== PROTOCOL_VERSION_V2) {
        throw new KNWFormatError(`Unsupported KNW version: ${version} (expected v2)`);
    }
    if (compression !== COMPRESSION_ZSTD) {
        throw new KNWFormatError(`Unsupported compression: ${compression} (expected zstd)`);
    }

    const compressed = blob.subarray(HEADER_SIZE);
    const zstd = await getZstd();
    const payloadBytes = zstd.decompress(compressed);
    const text = new TextDecoder("utf-8").decode(payloadBytes);
    const payload = JSON.parse(text);

    validateKNWV2Payload(payload);

    const metadata = payload.metadata;
    const graph = payload.graph;
    const positions = payload.positions || {};
    const declaredCID = metadata.cid;

    const expectedCID = await computeCID(graph);
    if (declaredCID && declaredCID !== expectedCID) {
        throw new KNWFormatError(`CID verification failed: declared=${declaredCID}, calculated=${expectedCID}`);
    }

    return { metadata, graph, positions, format: 'knw' };
}

/**
 * Decode RVR v1.0 binary file
 */
async function decodeRVRV1(blob) {
    if (!(blob instanceof Uint8Array)) {
        throw new KNWFormatError("blob must be a Uint8Array");
    }
    if (blob.length < HEADER_SIZE) {
        throw new KNWFormatError("File too short for valid RVR header");
    }

    const magic = String.fromCharCode(blob[0], blob[1], blob[2]);
    const version = blob[3] | (blob[4] << 8);
    const compression = blob[5];

    if (magic !== RVR_MAGIC) {
        throw new KNWFormatError(`Invalid magic header: expected "RVR", got "${magic}"`);
    }
    if (version !== RVR_PROTOCOL_VERSION_V1) {
        throw new KNWFormatError(`Unsupported RVR version: ${version} (expected v1)`);
    }
    if (compression !== COMPRESSION_ZSTD) {
        throw new KNWFormatError(`Unsupported compression: ${compression} (expected zstd)`);
    }

    const compressed = blob.subarray(HEADER_SIZE);
    const zstd = await getZstd();
    const payloadBytes = zstd.decompress(compressed);
    const text = new TextDecoder("utf-8").decode(payloadBytes);
    const payload = JSON.parse(text);

    const metadata = payload.metadata || {};
    const resources = payload.resources || {};
    const declaredCID = metadata.cid;

    const expectedCID = await computeCID(resources);
    if (declaredCID && declaredCID !== expectedCID) {
        throw new KNWFormatError(`CID verification failed: declared=${declaredCID}, calculated=${expectedCID}`);
    }

    return { metadata, resources, format: 'rvr' };
}

/**
 * Decode CPB v1.0 binary file
 */
async function decodeCPBV1(blob) {
    if (!(blob instanceof Uint8Array)) {
        throw new KNWFormatError("blob must be a Uint8Array");
    }
    if (blob.length < HEADER_SIZE) {
        throw new KNWFormatError("File too short for valid CPB header");
    }

    const magic = String.fromCharCode(blob[0], blob[1], blob[2]);
    const version = blob[3] | (blob[4] << 8);
    const compression = blob[5];

    if (magic !== CPB_MAGIC) {
        throw new KNWFormatError(`Invalid magic header: expected "CPB", got "${magic}"`);
    }
    if (version !== CPB_PROTOCOL_VERSION_V1) {
        throw new KNWFormatError(`Unsupported CPB version: ${version} (expected v1)`);
    }
    if (compression !== COMPRESSION_ZSTD) {
        throw new KNWFormatError(`Unsupported compression: ${compression} (expected zstd)`);
    }

    const compressed = blob.subarray(HEADER_SIZE);
    const zstd = await getZstd();
    const payloadBytes = zstd.decompress(compressed);
    const text = new TextDecoder("utf-8").decode(payloadBytes);
    const payload = JSON.parse(text);

    validateCPBV1Payload(payload);

    const metadata = payload.metadata || {};
    const capabilities = payload.capabilities || [];
    const evaluationSet = payload.evaluation_set || [];
    const computedCID = await computeCID(payload);

    return { metadata, capabilities, evaluation_set: evaluationSet, cid: computedCID, format: 'cpb' };
}

/**
 * Decode any supported file (KNW, RVR, or CPB)
 * @param {Uint8Array} blob
 */
async function decodeFile(blob) {
    if (!(blob instanceof Uint8Array)) {
        throw new KNWFormatError("blob must be a Uint8Array");
    }
    if (blob.length < HEADER_SIZE) {
        throw new KNWFormatError("File too short for valid header");
    }

    const magic = String.fromCharCode(blob[0], blob[1], blob[2]);
    if (magic === KNW_MAGIC) {
        return decodeKNWV2(blob);
    } else if (magic === RVR_MAGIC) {
        return decodeRVRV1(blob);
    } else if (magic === CPB_MAGIC) {
        return decodeCPBV1(blob);
    } else {
        throw new KNWFormatError(`Unknown magic header: "${magic}"`);
    }
}

export {
    KNW_MAGIC,
    RVR_MAGIC,
    CPB_MAGIC,
    PROTOCOL_VERSION_V2,
    RVR_PROTOCOL_VERSION_V1,
    CPB_PROTOCOL_VERSION_V1,
    KNWFormatError,
    canonicalJSON,
    computeCID,
    encodeKNWV2,
    encodeRVRV1,
    encodeCPBV1,
    decodeKNWV2,
    decodeRVRV1,
    decodeCPBV1,
    decodeFile
};
