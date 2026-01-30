/**
 * HumanSign Content Script
 * Captures keystroke events when recording is active
 */

console.log('[HumanSign] Content script loaded');

let isRecording = false;
let sessionData = null;
let eventsSent = 0;

// Listen for messages from popup/background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[HumanSign Content] Received message:', message.type, message);

    switch (message.type) {
        case 'START_RECORDING':
            console.log('[HumanSign Content] Starting recording with data:', message.data);
            startRecording(message.data);
            sendResponse({ success: true });
            break;

        case 'STOP_RECORDING':
            stopRecording();
            sendResponse({ success: true });
            break;

        case 'GET_STATUS':
            sendResponse({
                isRecording,
                sessionData,
                eventsSent
            });
            break;

        case 'GET_DOCUMENT_CONTENT':
            const content = getDocumentContent();
            sendResponse({ content });
            break;

        default:
            sendResponse({ success: false, error: 'Unknown message type' });
    }
    return true;
});

/**
 * Start recording keystroke events
 */
function startRecording(data) {
    if (isRecording) {
        console.log('[HumanSign] Already recording');
        return;
    }

    sessionData = {
        subject: data?.subject || 'anonymous',
        sessionIndex: data?.sessionIndex || 1,
        rep: data?.rep || 1,
        startTime: Date.now()
    };

    isRecording = true;
    eventsSent = 0;

    // Add event listeners to the document - capture ALL keystrokes
    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('keyup', handleKeyUp, true);

    // Show recording indicator
    showRecordingIndicator();

    console.log('[HumanSign] Recording started for:', sessionData.subject);
    console.log('[HumanSign] Listening for keystrokes on:', window.location.href);
}

/**
 * Stop recording keystroke events
 */
function stopRecording() {
    if (!isRecording) {
        console.log('[HumanSign] Not recording');
        return;
    }

    isRecording = false;

    // Remove event listeners
    document.removeEventListener('keydown', handleKeyDown, true);
    document.removeEventListener('keyup', handleKeyUp, true);

    // Hide recording indicator
    hideRecordingIndicator();

    console.log('[HumanSign] Recording stopped, events sent:', eventsSent);
}

/**
 * Handle keydown events
 */
function handleKeyDown(event) {
    if (!isRecording) {
        console.log('[HumanSign Content] KeyDown but not recording');
        return;
    }
    
    console.log('[HumanSign Content] KeyDown detected, sending event');
    sendKeystrokeEvent('keydown');
}

/**
 * Handle keyup events
 */
function handleKeyUp(event) {
    if (!isRecording) {
        console.log('[HumanSign Content] KeyUp but not recording');
        return;
    }
    
    console.log('[HumanSign Content] KeyUp detected, sending event');
    sendKeystrokeEvent('keyup');
}

/**
 * Send keystroke event to background script
 */
function sendKeystrokeEvent(eventType) {
    const eventData = {
        timestamp: Date.now(),
        eventType: eventType
    };

    chrome.runtime.sendMessage({
        type: 'KEYSTROKE_EVENT',
        data: eventData
    }, (response) => {
        if (chrome.runtime.lastError) {
            console.error('[HumanSign] Failed to send event:', chrome.runtime.lastError.message);
            // Stop recording if we can't communicate with background
            if (chrome.runtime.lastError.message.includes('Receiving end does not exist')) {
                console.error('[HumanSign] Background script disconnected, stopping recording');
                stopRecording();
            }
        } else {
            eventsSent++;
            if (eventsSent === 1) {
                console.log('[HumanSign] First event sent successfully!');
            }
            if (eventsSent % 10 === 0) {
                console.log('[HumanSign] Events sent:', eventsSent);
            }
        }
    });
}

/**
 * Get text content from editable areas on the page
 */
function getDocumentContent() {
    let content = '';

    // Get from textareas and inputs
    document.querySelectorAll('textarea, input[type="text"]').forEach(el => {
        if (el.value) {
            content += el.value + '\n';
        }
    });

    // Get from contenteditable elements
    document.querySelectorAll('[contenteditable="true"]').forEach(el => {
        if (el.innerText) {
            content += el.innerText + '\n';
        }
    });

    // If nothing found, try to get body text
    if (!content.trim()) {
        content = document.body?.innerText || '';
    }

    return content.trim();
}

// Recording indicator element
let indicatorElement = null;

/**
 * Show visual indicator that recording is active
 */
function showRecordingIndicator() {
    if (indicatorElement) return;

    indicatorElement = document.createElement('div');
    indicatorElement.id = 'humansign-indicator';
    indicatorElement.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        z-index: 2147483647;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 8px 16px;
        border-radius: 20px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 12px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 8px;
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    `;

    const dot = document.createElement('span');
    dot.style.cssText = `
        width: 8px;
        height: 8px;
        background: #ff4444;
        border-radius: 50%;
        animation: humansign-blink 1s ease-in-out infinite;
    `;

    const text = document.createTextNode('HumanSign Recording');

    indicatorElement.appendChild(dot);
    indicatorElement.appendChild(text);

    // Add animation styles
    const style = document.createElement('style');
    style.id = 'humansign-styles';
    style.textContent = `
        @keyframes humansign-blink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
        }
    `;

    document.head.appendChild(style);
    document.body.appendChild(indicatorElement);

    console.log('[HumanSign] Recording indicator shown');
}

/**
 * Hide recording indicator
 */
function hideRecordingIndicator() {
    if (indicatorElement) {
        indicatorElement.remove();
        indicatorElement = null;
    }

    const style = document.getElementById('humansign-styles');
    if (style) style.remove();

    console.log('[HumanSign] Recording indicator hidden');
}

// Notify background script that content script is ready
try {
    chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_READY' }, (response) => {
        if (chrome.runtime.lastError) {
            console.log('[HumanSign] Background not ready yet:', chrome.runtime.lastError.message);
        } else {
            console.log('[HumanSign] Content script registered with background');
        }
    });
} catch (e) {
    console.log('[HumanSign] Could not contact background:', e);
}
