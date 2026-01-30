/**
 * HumanSign Crypto Utilities
 * SHA-256 hashing functions matching backend implementation
 */

/**
 * Convert ArrayBuffer to hex string
 */
export function bufferToHex(buffer) {
    const byteArray = new Uint8Array(buffer);
    return Array.from(byteArray)
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * Compute SHA-256 hash of text content (for document hashing)
 * @param {string|ArrayBuffer} content - File content
 * @returns {Promise<string>} Hex-encoded SHA-256 hash
 */
export async function computeDocumentHash(content) {
    let buffer;
    if (typeof content === 'string') {
        buffer = new TextEncoder().encode(content);
    } else {
        buffer = content;
    }
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    return bufferToHex(hashBuffer);
}

/**
 * Compute block hash matching backend implementation
 * Backend: hashlib.sha256(prev_hash.encode() + json.dumps(events, sort_keys=True).encode()).hexdigest()
 * @param {string} prevHash - Previous block hash or "GENESIS"
 * @param {Array} events - Array of [timestamp, eventType] tuples
 * @returns {Promise<string>} Hex-encoded SHA-256 hash
 */
export async function computeBlockHash(prevHash, events) {
    // Match Python's json.dumps with sort_keys=True
    // For arrays of primitives, sorting keys doesn't change output
    // but we need exact JSON format matching
    const eventsJson = JSON.stringify(events);
    const payload = prevHash + eventsJson;
    const buffer = new TextEncoder().encode(payload);
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    return bufferToHex(hashBuffer);
}

/**
 * Base64URL encode (for JWS)
 */
export function base64UrlEncode(data) {
    let base64;
    if (typeof data === 'string') {
        base64 = btoa(data);
    } else {
        // ArrayBuffer
        const bytes = new Uint8Array(data);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        base64 = btoa(binary);
    }
    return base64
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

/**
 * Import PEM private key for RS256 signing
 * @param {string} pem - PEM-encoded RSA private key
 * @returns {Promise<CryptoKey>}
 */
export async function importPrivateKey(pem) {
    // Remove PEM headers and whitespace
    const pemContents = pem
        .replace(/-----BEGIN RSA PRIVATE KEY-----/, '')
        .replace(/-----END RSA PRIVATE KEY-----/, '')
        .replace(/-----BEGIN PRIVATE KEY-----/, '')
        .replace(/-----END PRIVATE KEY-----/, '')
        .replace(/\s/g, '');
    
    // Decode base64 to ArrayBuffer
    const binaryString = atob(pemContents);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    
    // Try PKCS#8 first, then PKCS#1 (RSA)
    try {
        return await crypto.subtle.importKey(
            'pkcs8',
            bytes.buffer,
            { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
            false,
            ['sign']
        );
    } catch (e) {
        // Fallback: wrap PKCS#1 in PKCS#8
        const pkcs8 = wrapPKCS1inPKCS8(bytes);
        return await crypto.subtle.importKey(
            'pkcs8',
            pkcs8,
            { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
            false,
            ['sign']
        );
    }
}

/**
 * Wrap PKCS#1 RSA private key in PKCS#8 container
 */
function wrapPKCS1inPKCS8(pkcs1Bytes) {
    // PKCS#8 header for RSA
    const pkcs8Header = new Uint8Array([
        0x30, 0x82, 0x00, 0x00, // SEQUENCE, length placeholder
        0x02, 0x01, 0x00,       // INTEGER 0 (version)
        0x30, 0x0d,             // SEQUENCE
        0x06, 0x09,             // OID
        0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, // rsaEncryption
        0x05, 0x00,             // NULL
        0x04, 0x82, 0x00, 0x00  // OCTET STRING, length placeholder
    ]);
    
    const totalLen = pkcs8Header.length + pkcs1Bytes.length - 4;
    const keyLen = pkcs1Bytes.length;
    
    // Update length fields
    pkcs8Header[2] = (totalLen >> 8) & 0xff;
    pkcs8Header[3] = totalLen & 0xff;
    pkcs8Header[pkcs8Header.length - 2] = (keyLen >> 8) & 0xff;
    pkcs8Header[pkcs8Header.length - 1] = keyLen & 0xff;
    
    const result = new Uint8Array(pkcs8Header.length + pkcs1Bytes.length);
    result.set(pkcs8Header);
    result.set(pkcs1Bytes, pkcs8Header.length);
    
    return result.buffer;
}
