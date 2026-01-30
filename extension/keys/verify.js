#!/usr/bin/env node

/**
 * HumanSign Verification Script
 * 
 * Usage: node verify.js <humansign-file> [document-file]
 * 
 * Verifies a .humansign file and optionally checks the document hash
 */

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length === 0) {
    console.error('Usage: node verify.js <humansign-file> [document-file]');
    console.error('');
    console.error('Examples:');
    console.error('  node verify.js document.humansign');
    console.error('  node verify.js document.humansign document.txt');
    process.exit(1);
}

const humansignFile = args[0];
const documentFile = args[1];

// Check if files exist
if (!fs.existsSync(humansignFile)) {
    console.error('Error: .humansign file not found:', humansignFile);
    process.exit(1);
}

if (documentFile && !fs.existsSync(documentFile)) {
    console.error('Error: Document file not found:', documentFile);
    process.exit(1);
}

// Read public key
const publicKeyPath = path.join(__dirname, 'public.pem');
if (!fs.existsSync(publicKeyPath)) {
    console.error('Error: public.pem not found in', __dirname);
    console.error('Make sure public.pem is in the same directory as this script');
    process.exit(1);
}

const publicKey = fs.readFileSync(publicKeyPath);

// Read and parse .humansign file
console.log('📄 Reading .humansign file...');
const jws = fs.readFileSync(humansignFile, 'utf8').trim();
const parts = jws.split('.');

if (parts.length !== 3) {
    console.error('Error: Invalid JWS format. Expected 3 parts, got', parts.length);
    process.exit(1);
}

const [header64, payload64, signature64] = parts;

// Decode header
const header = JSON.parse(Buffer.from(header64, 'base64url').toString());
console.log('✅ JWS Header:', header);

// Decode payload
const payload = JSON.parse(Buffer.from(payload64, 'base64url').toString());

console.log('\n📊 Signature Information:');
console.log('  Author:', payload.subject);
console.log('  Session:', payload.sessionIndex);
console.log('  Rep:', payload.rep);
console.log('  Issued At:', new Date(payload.iat * 1000).toISOString());
console.log('  Document Hash:', payload.document_hash);

// Calculate event statistics
let totalEvents = 0;
let totalBlocks = payload.chain.length;
payload.chain.forEach(block => {
    totalEvents += block.events.length;
});

console.log('\n⌨️  Keystroke Data:');
console.log('  Total Events:', totalEvents);
console.log('  Total Blocks:', totalBlocks);
console.log('  Events per Block (avg):', (totalEvents / totalBlocks).toFixed(1));

// Calculate typing duration
if (payload.chain.length > 0 && payload.chain[0].events.length > 0) {
    const firstEvent = payload.chain[0].events[0];
    const lastBlock = payload.chain[payload.chain.length - 1];
    const lastEvent = lastBlock.events[lastBlock.events.length - 1];
    
    const duration = (lastEvent[0] - firstEvent[0]) / 1000; // seconds
    console.log('  Duration:', duration.toFixed(2), 'seconds');
    
    if (duration > 0) {
        const wpm = (totalEvents / 2) / (duration / 60); // Rough WPM estimate
        console.log('  Typing Speed (est):', wpm.toFixed(1), 'WPM');
    }
}

// Verify signature
console.log('\n🔐 Verifying Signature...');
const verify = crypto.createVerify('RSA-SHA256');
verify.update(header64 + '.' + payload64);

let isValid = false;
try {
    // Try base64url decoding
    const signatureBuffer = Buffer.from(signature64, 'base64url');
    isValid = verify.verify(publicKey, signatureBuffer);
} catch (e) {
    console.error('Error verifying signature:', e.message);
}

if (isValid) {
    console.log('✅ Signature is VALID');
    console.log('   The keystroke data has not been tampered with');
} else {
    console.log('❌ Signature is INVALID');
    console.log('   The data may have been modified or the wrong public key was used');
    process.exit(1);
}

// Verify document hash if document provided
if (documentFile) {
    console.log('\n📝 Verifying Document...');
    const documentContent = fs.readFileSync(documentFile, 'utf8');
    const documentHash = crypto.createHash('sha256').update(documentContent).digest('hex');
    
    console.log('  Expected Hash:', payload.document_hash);
    console.log('  Document Hash:', documentHash);
    
    if (documentHash === payload.document_hash) {
        console.log('✅ Document hash MATCHES');
        console.log('   This signature corresponds to the provided document');
    } else {
        console.log('❌ Document hash DOES NOT MATCH');
        console.log('   This signature was created for a different document');
    }
}

// Verify blockchain integrity
console.log('\n🔗 Verifying Blockchain...');
let blockValid = true;
for (let i = 0; i < payload.chain.length; i++) {
    const block = payload.chain[i];
    
    // Compute expected block hash
    const prevHash = block.prev_hash;
    const eventsJson = JSON.stringify(block.events);
    const computedHash = crypto.createHash('sha256')
        .update(prevHash + eventsJson)
        .digest('hex');
    
    if (computedHash !== block.block_hash) {
        console.log(`❌ Block ${i} hash mismatch`);
        blockValid = false;
        break;
    }
    
    // Check that prev_hash matches previous block
    if (i > 0 && block.prev_hash !== payload.chain[i - 1].block_hash) {
        console.log(`❌ Block ${i} prev_hash doesn't match previous block`);
        blockValid = false;
        break;
    }
}

if (blockValid) {
    console.log('✅ Blockchain is VALID');
    console.log('   All blocks are properly linked and hashed');
} else {
    console.log('❌ Blockchain is INVALID');
    console.log('   The event chain has been tampered with');
}

console.log('\n' + '='.repeat(60));
if (isValid && blockValid) {
    console.log('✅ VERIFICATION PASSED');
    console.log('This document was typed by a human with the captured keystroke pattern.');
} else {
    console.log('❌ VERIFICATION FAILED');
    console.log('The signature or blockchain is invalid.');
}
console.log('='.repeat(60));
