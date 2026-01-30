/**
 * HumanSign JWS Token Creation
 * Creates RS256-signed JWS tokens matching backend verification
 */

import { base64UrlEncode, importPrivateKey } from './crypto.js';

/**
 * Create a JWS token with RS256 signature
 * @param {Object} payload - The payload to sign
 * @param {string} privateKeyPem - PEM-encoded RSA private key
 * @returns {Promise<string>} JWS token (header.payload.signature)
 */
export async function createJWS(payload, privateKeyPem) {
    // Import the private key
    const privateKey = await importPrivateKey(privateKeyPem);

    // Create JWT header
    const header = {
        alg: "RS256",
        typ: "JWT"
    };

    // Encode header and payload
    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));

    // Create signing input
    const signingInput = `${encodedHeader}.${encodedPayload}`;

    // Sign with RS256
    const signatureBuffer = await crypto.subtle.sign(
        { name: "RSASSA-PKCS1-v1_5" },
        privateKey,
        new TextEncoder().encode(signingInput)
    );

    // Encode signature
    const encodedSignature = base64UrlEncode(signatureBuffer);

    // Return complete JWS
    return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}

/**
 * Create HumanSign payload structure
 * @param {Object} options
 * @param {string} options.subject - User identifier
 * @param {number} options.sessionIndex - Session number
 * @param {number} options.rep - Repetition number
 * @param {string} options.documentHash - SHA-256 hash of document
 * @param {Array} options.chain - Event blockchain
 * @returns {Object} Payload ready for JWS signing
 */
export function createHumanSignPayload({ subject, sessionIndex, rep, documentHash, chain }) {
    return {
        subject,
        sessionIndex,
        rep,
        document_hash: documentHash,
        chain,
        // Add timestamp for when this was sealed
        iat: Math.floor(Date.now() / 1000)
    };
}
