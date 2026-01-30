/**
 * HumanSign Background Service Worker
 * Manages event chain, signing, and file generation
 * 
 * NOTE: All utility functions are inlined here because Chrome Manifest V3
 * service workers have issues with ES module imports
 */

// ============================================================================
// CRYPTO UTILITIES (from lib/crypto.js)
// ============================================================================

function bufferToHex(buffer) {
    const byteArray = new Uint8Array(buffer);
    return Array.from(byteArray)
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');
}

async function computeDocumentHash(content) {
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
 * Recursively sort object keys for consistent JSON serialization
 * This matches Python's json.dumps(obj, sort_keys=True)
 */
function sortObjectKeys(obj) {
    if (Array.isArray(obj)) {
        return obj.map(sortObjectKeys);
    } else if (obj !== null && typeof obj === 'object') {
        const sorted = {};
        Object.keys(obj).sort().forEach(key => {
            sorted[key] = sortObjectKeys(obj[key]);
        });
        return sorted;
    }
    return obj;
}

/**
 * Serialize to JSON matching Python's json.dumps() format
 * Python uses ', ' after commas and ': ' after colons by default
 */
function pythonJsonStringify(obj) {
    const jsonStr = JSON.stringify(obj);
    // Add space after colons (for objects) and commas
    // This is a simplified approach that works for our data structure
    return jsonStr
        .replace(/,(?=[\[\{"\d])/g, ', ')  // Add space after comma before [, {, ", or digit
        .replace(/:(?=[\[\{"\d])/g, ': '); // Add space after colon before [, {, ", or digit
}

async function computeBlockHash(prevHash, events) {
    // Sort keys to match Python's json.dumps(events, sort_keys=True)
    const sortedEvents = sortObjectKeys(events);
    // Use Python-compatible JSON format (with spaces after , and :)
    const eventsJson = pythonJsonStringify(sortedEvents);
    // Concatenate prev_hash + events_json and hash
    const payload = prevHash + eventsJson;
    const buffer = new TextEncoder().encode(payload);
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    return bufferToHex(hashBuffer);
}

function base64UrlEncode(data) {
    let base64;
    if (typeof data === 'string') {
        base64 = btoa(unescape(encodeURIComponent(data)));
    } else {
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

async function importPrivateKey(pem) {
    const pemContents = pem
        .replace(/-----BEGIN RSA PRIVATE KEY-----/, '')
        .replace(/-----END RSA PRIVATE KEY-----/, '')
        .replace(/-----BEGIN PRIVATE KEY-----/, '')
        .replace(/-----END PRIVATE KEY-----/, '')
        .replace(/\s/g, '');

    const binaryString = atob(pemContents);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }

    try {
        return await crypto.subtle.importKey(
            'pkcs8',
            bytes.buffer,
            { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
            false,
            ['sign']
        );
    } catch (e) {
        console.error('Failed to import key as PKCS8, trying to wrap PKCS1:', e);
        throw new Error('Invalid private key format. Please use PKCS8 format.');
    }
}

// ============================================================================
// JWS UTILITIES (from lib/jws.js)
// ============================================================================

async function createJWS(payload, privateKeyPem) {
    const privateKey = await importPrivateKey(privateKeyPem);

    const header = {
        alg: "RS256",
        typ: "JWT"
    };

    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const signingInput = `${encodedHeader}.${encodedPayload}`;

    const signatureBuffer = await crypto.subtle.sign(
        { name: "RSASSA-PKCS1-v1_5" },
        privateKey,
        new TextEncoder().encode(signingInput)
    );

    const encodedSignature = base64UrlEncode(signatureBuffer);
    return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}

function createHumanSignPayload({ subject, sessionIndex, rep, documentHash, chain }) {
    return {
        subject,
        sessionIndex,
        rep,
        document_hash: documentHash,
        chain,
        iat: Math.floor(Date.now() / 1000)
    };
}

// ============================================================================
// EVENT CHAIN CLASS (from lib/chain.js)
// ============================================================================

class EventChain {
    constructor() {
        this.blocks = [];
        this.currentEvents = [];
        this.previousHash = "GENESIS";
        this.eventCount = 0;
    }

    addEvent(timestamp, eventType) {
        this.currentEvents.push([timestamp, eventType]);
        this.eventCount++;
    }

    getPendingCount() {
        return this.currentEvents.length;
    }

    getTotalCount() {
        return this.eventCount;
    }

    async sealBlock() {
        if (this.currentEvents.length === 0) return null;

        const blockHash = await computeBlockHash(
            this.previousHash,
            this.currentEvents
        );

        const block = {
            events: [...this.currentEvents],
            prev_hash: this.previousHash,
            block_hash: blockHash
        };

        this.blocks.push(block);
        this.previousHash = blockHash;
        this.currentEvents = [];

        return block;
    }

    async finalize() {
        await this.sealBlock();
        return this.blocks;
    }

    getChain() {
        return this.blocks;
    }

    reset() {
        this.blocks = [];
        this.currentEvents = [];
        this.previousHash = "GENESIS";
        this.eventCount = 0;
    }

    toJSON() {
        return {
            blocks: this.blocks,
            currentEvents: this.currentEvents,
            previousHash: this.previousHash,
            eventCount: this.eventCount
        };
    }

    static fromJSON(data) {
        const chain = new EventChain();
        chain.blocks = data.blocks || [];
        chain.currentEvents = data.currentEvents || [];
        chain.previousHash = data.previousHash || "GENESIS";
        chain.eventCount = data.eventCount || 0;
        return chain;
    }
}

// ============================================================================
// MAIN BACKGROUND SCRIPT
// ============================================================================

// Current session state
let eventChain = new EventChain();
let sessionConfig = {
    subject: 'user',
    sessionIndex: 1,
    rep: 1
};
let isRecording = false;
let privateKey = null;

// Block sealing configuration
const BLOCK_SIZE_THRESHOLD = 50;
const BLOCK_TIME_THRESHOLD = 30000;
let blockSealTimer = null;

// Load private key from bundled file
async function loadPrivateKey() {
    try {
        const url = chrome.runtime.getURL('keys/private.pem');
        const response = await fetch(url);
        if (response.ok) {
            privateKey = await response.text();
            console.log('[HumanSign] Private key loaded successfully');
            return true;
        } else {
            console.error('[HumanSign] Failed to fetch private key:', response.status);
        }
    } catch (error) {
        console.error('[HumanSign] Failed to load private key:', error);
    }
    return false;
}

// Initialize on startup
loadPrivateKey();

// Load saved session state on startup
chrome.storage.local.get(['sessionConfig', 'eventChain', 'isRecording'], (data) => {
    if (data.sessionConfig) {
        sessionConfig = data.sessionConfig;
    }
    if (data.eventChain) {
        eventChain = EventChain.fromJSON(data.eventChain);
    }
    // Don't auto-resume recording on extension reload
    // User must explicitly start recording
    isRecording = false;
    chrome.storage.local.set({ isRecording: false });
    console.log('[HumanSign] State loaded:', { sessionConfig, isRecording, eventCount: eventChain.getTotalCount() });
    console.log('[HumanSign] Recording auto-disabled on startup (user must start manually)');
});

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[HumanSign] Received message:', message.type);

    // Handle synchronous responses for simple queries
    if (message.type === 'GET_SESSION_STATUS') {
        sendResponse({
            isRecording,
            eventCount: eventChain.getTotalCount(),
            blockCount: eventChain.getChain().length,
            pendingEvents: eventChain.getPendingCount(),
            sessionConfig,
            hasPrivateKey: !!privateKey
        });
        return false;
    }

    if (message.type === 'CHECK_PRIVATE_KEY') {
        sendResponse({ hasKey: !!privateKey });
        return false;
    }

    // Handle async operations
    handleAsyncMessage(message, sender).then(sendResponse).catch(error => {
        console.error('[HumanSign] Error handling message:', error);
        sendResponse({ success: false, error: error.message });
    });

    return true; // Keep channel open for async response
});

async function handleAsyncMessage(message, sender) {
    console.log('[HumanSign] handleAsyncMessage:', message.type, 'from tab:', sender.tab?.id);

    switch (message.type) {
        case 'KEYSTROKE_EVENT':
            console.log('[HumanSign] Processing KEYSTROKE_EVENT');
            await handleKeystrokeEvent(message.data);
            return { success: true };

        case 'START_SESSION':
            await startSession(message.data);
            return { success: true };

        case 'STOP_SESSION':
            await stopSession();
            return { success: true };

        case 'SEAL_DOCUMENT':
            const result = await sealDocument(message.data);
            return { success: true, ...result };

        case 'UPDATE_SESSION_CONFIG':
            sessionConfig = { ...sessionConfig, ...message.data };
            await chrome.storage.local.set({ sessionConfig });
            return { success: true };

        case 'RESET_SESSION':
            eventChain.reset();
            await saveState();
            return { success: true };

        case 'CONTENT_SCRIPT_READY':
            if (isRecording && sender.tab?.id) {
                try {
                    await chrome.tabs.sendMessage(sender.tab.id, {
                        type: 'START_RECORDING',
                        data: sessionConfig
                    });
                } catch (e) {
                    console.log('[HumanSign] Could not resume recording on tab');
                }
            }
            return { success: true };

        default:
            return { success: false, error: 'Unknown message type' };
    }
}

async function handleKeystrokeEvent(data) {
    console.log('[HumanSign] handleKeystrokeEvent called, isRecording:', isRecording, 'data:', data);

    if (!isRecording) {
        console.warn('[HumanSign] Not recording, ignoring event');
        return;
    }

    eventChain.addEvent(data.timestamp, data.eventType);
    console.log('[HumanSign] Event added! Total events:', eventChain.getTotalCount(), 'Pending:', eventChain.getPendingCount());

    if (eventChain.getPendingCount() >= BLOCK_SIZE_THRESHOLD) {
        console.log('[HumanSign] Sealing block (threshold reached)');
        await sealCurrentBlock();
    } else if (!blockSealTimer) {
        console.log('[HumanSign] Starting block seal timer');
        blockSealTimer = setTimeout(async () => {
            if (eventChain.getPendingCount() > 0) {
                console.log('[HumanSign] Sealing block (timer expired)');
                await sealCurrentBlock();
            }
            blockSealTimer = null;
        }, BLOCK_TIME_THRESHOLD);
    }

    await saveState();
    console.log('[HumanSign] State saved');
}

async function sealCurrentBlock() {
    if (blockSealTimer) {
        clearTimeout(blockSealTimer);
        blockSealTimer = null;
    }

    await eventChain.sealBlock();
    await saveState();
}

async function startSession(config) {
    console.log('[HumanSign] startSession called with config:', config);
    sessionConfig = { ...sessionConfig, ...config };
    isRecording = true;
    console.log('[HumanSign] isRecording set to TRUE');

    await chrome.storage.local.set({ sessionConfig, isRecording });
    console.log('[HumanSign] State saved to storage');

    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });

    // Problematic URLs that don't support content scripts properly
    const blockedPatterns = [
        'chrome://',
        'chrome-extension://',
        'https://docs.google.com/document',
        'https://docs.google.com/spreadsheets',
        'https://docs.google.com/presentation',
        'edge://',
        'about:'
    ];

    for (const tab of tabs) {
        if (!tab.id || !tab.url) {
            console.warn('[HumanSign] Tab has no ID or URL:', tab);
            continue;
        }

        // Check if URL is blocked
        const isBlocked = blockedPatterns.some(pattern => tab.url.startsWith(pattern));
        if (isBlocked) {
            console.error('[HumanSign] Cannot record on this page:', tab.url);
            console.error('[HumanSign] Google Docs, Chrome pages, and similar sites are not supported');
            console.error('[HumanSign] Please try on a regular webpage like wikipedia.org or a simple blog');
            // Stop recording since we can't use this tab
            isRecording = false;
            await chrome.storage.local.set({ isRecording: false });
            continue;
        }

        try {
            // Try to send message to content script
            await chrome.tabs.sendMessage(tab.id, {
                type: 'START_RECORDING',
                data: sessionConfig
            });
            console.log('[HumanSign] Recording started on tab:', tab.id, tab.url);
        } catch (e) {
            // Content script might not be loaded, try to inject it
            console.log('[HumanSign] Content script not ready, attempting injection');
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['content/content.js']
                });
                // Wait for script to load
                await new Promise(resolve => setTimeout(resolve, 200));
                // Try sending message again
                await chrome.tabs.sendMessage(tab.id, {
                    type: 'START_RECORDING',
                    data: sessionConfig
                });
                console.log('[HumanSign] Recording started after injection on tab:', tab.id);
            } catch (injectionError) {
                console.error('[HumanSign] Failed to inject content script:', injectionError);
                console.error('[HumanSign] This page may not support extensions. Try a simpler webpage.');
                // Stop recording on failure
                isRecording = false;
                await chrome.storage.local.set({ isRecording: false });
            }
        }
    }
}

async function stopSession() {
    isRecording = false;
    await sealCurrentBlock();
    await chrome.storage.local.set({ isRecording });

    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
        if (tab.id) {
            try {
                await chrome.tabs.sendMessage(tab.id, { type: 'STOP_RECORDING' });
            } catch (e) {
                // Tab might not have content script loaded
            }
        }
    }
}

async function sealDocument(data) {
    if (!privateKey) {
        await loadPrivateKey();
    }

    if (!privateKey) {
        throw new Error('Private key not found. Please ensure keys/private.pem exists.');
    }

    await sealCurrentBlock();
    const chain = eventChain.getChain();

    if (chain.length === 0) {
        throw new Error('No keystroke events recorded. Please type something first.');
    }

    let documentContent = data.documentContent || '';
    if (!documentContent && data.fileContent) {
        documentContent = data.fileContent;
    }

    const documentHash = await computeDocumentHash(documentContent);

    const payload = createHumanSignPayload({
        subject: sessionConfig.subject,
        sessionIndex: sessionConfig.sessionIndex,
        rep: sessionConfig.rep,
        documentHash,
        chain
    });

    const jws = await createJWS(payload, privateKey);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `document_${timestamp}.humansign`;

    // Service workers can't use URL.createObjectURL, use data URL instead
    const base64Data = btoa(jws);
    const dataUrl = `data:application/octet-stream;base64,${base64Data}`;

    await chrome.downloads.download({
        url: dataUrl,
        filename,
        saveAs: true
    });

    const eventCount = chain.reduce((sum, block) => sum + block.events.length, 0);
    const blockCount = chain.length;

    eventChain.reset();
    sessionConfig.sessionIndex++;
    await saveState();
    await stopSession();

    return { filename, eventCount, blockCount, documentHash };
}

async function saveState() {
    await chrome.storage.local.set({
        eventChain: eventChain.toJSON(),
        sessionConfig,
        isRecording
    });
}

console.log('[HumanSign] Background service worker initialized');
