/**
 * HumanSign Extension - Popup Logic
 */

// DOM Elements
const mainView = document.getElementById('mainView');
const settingsView = document.getElementById('settingsView');
const settingsBtn = document.getElementById('settingsBtn');
const backBtn = document.getElementById('backBtn');

const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');
const eventCount = document.getElementById('eventCount');
const blockCount = document.getElementById('blockCount');
const sessionIndex = document.getElementById('sessionIndex');

const subjectInput = document.getElementById('subjectInput');
const recordBtn = document.getElementById('recordBtn');
const sealBtn = document.getElementById('sealBtn');
const fileSection = document.getElementById('fileSection');
const documentFile = document.getElementById('documentFile');
const fileLabel = document.getElementById('fileLabel');
const confirmSealBtn = document.getElementById('confirmSealBtn');

const alertBox = document.getElementById('alertBox');
const alertMessage = document.getElementById('alertMessage');

const keyStatus = document.getElementById('keyStatus');
const resetBtn = document.getElementById('resetBtn');

// State
let isRecording = false;
let updateInterval = null;

// Initialize
document.addEventListener('DOMContentLoaded', init);

async function init() {
    // Load current status
    await refreshStatus();

    // Check if private key is loaded
    await checkPrivateKey();

    // Start periodic status updates
    updateInterval = setInterval(refreshStatus, 1000);

    // Setup event listeners
    setupEventListeners();
}

function setupEventListeners() {
    // Navigation
    settingsBtn.addEventListener('click', showSettings);
    backBtn.addEventListener('click', showMain);

    // Recording
    recordBtn.addEventListener('click', toggleRecording);

    // Sealing
    sealBtn.addEventListener('click', showFileSection);
    documentFile.addEventListener('change', handleFileSelect);
    confirmSealBtn.addEventListener('click', sealDocument);

    // Settings
    resetBtn.addEventListener('click', resetSession);

    // Subject input
    subjectInput.addEventListener('change', updateSubject);
}

// Navigation
function showSettings() {
    mainView.style.display = 'none';
    settingsView.style.display = 'block';
    checkPrivateKey(); // Refresh key status when opening settings
}

function showMain() {
    settingsView.style.display = 'none';
    mainView.style.display = 'block';
}

// Status Updates
async function refreshStatus() {
    try {
        const response = await sendMessage({ type: 'GET_SESSION_STATUS' });

        isRecording = response.isRecording;

        // Update UI
        eventCount.textContent = response.eventCount || 0;
        blockCount.textContent = response.blockCount || 0;
        sessionIndex.textContent = response.sessionConfig?.sessionIndex || 1;

        // Only update subject input if user is not currently editing it
        if (response.sessionConfig?.subject && document.activeElement !== subjectInput) {
            subjectInput.value = response.sessionConfig.subject;
        }

        updateRecordingUI();

        // Enable seal button if we have events
        sealBtn.disabled = response.eventCount === 0;

    } catch (error) {
        console.error('Failed to get status:', error);
    }
}

function updateRecordingUI() {
    if (isRecording) {
        statusIndicator.classList.add('recording');
        statusIndicator.classList.remove('idle');
        statusText.textContent = 'Recording';
        recordBtn.classList.add('recording');
        recordBtn.querySelector('span').textContent = 'Stop Recording';
    } else {
        statusIndicator.classList.remove('recording');
        statusIndicator.classList.add('idle');
        statusText.textContent = 'Ready';
        recordBtn.classList.remove('recording');
        recordBtn.querySelector('span').textContent = 'Start Recording';
    }
}

// Recording Control
async function toggleRecording() {
    try {
        if (isRecording) {
            await sendMessage({ type: 'STOP_SESSION' });
            showAlert('Recording stopped', 'success');
        } else {
            // Check if we're on a supported page
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            const unsupportedPages = [
                'chrome://',
                'chrome-extension://',
                'docs.google.com/document',
                'docs.google.com/spreadsheets',
                'docs.google.com/presentation',
                'edge://',
                'about:'
            ];
            
            const isUnsupported = unsupportedPages.some(pattern => 
                tab.url && tab.url.includes(pattern)
            );
            
            if (isUnsupported) {
                showAlert('❌ This page is not supported. Please use a regular webpage like Wikipedia, GitHub, or a blog. Google Docs, Chrome internal pages, and similar sites block extensions.', 'error');
                return;
            }
            
            await sendMessage({
                type: 'START_SESSION',
                data: {
                    subject: subjectInput.value || 'user'
                }
            });
            showAlert('✅ Recording started! Type in any text field on the page.', 'success');
        }

        await refreshStatus();

    } catch (error) {
        showAlert('Failed to toggle recording: ' + error.message, 'error');
    }
}

// Subject Update
async function updateSubject() {
    try {
        await sendMessage({
            type: 'UPDATE_SESSION_CONFIG',
            data: { subject: subjectInput.value }
        });
    } catch (error) {
        console.error('Failed to update subject:', error);
    }
}

// File Section
function showFileSection() {
    fileSection.style.display = 'block';
    sealBtn.style.display = 'none';
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        fileLabel.textContent = file.name;
        document.querySelector('.file-input-label').classList.add('has-file');
        confirmSealBtn.disabled = false;
    }
}

// Seal Document
async function sealDocument() {
    const file = documentFile.files[0];

    if (!file) {
        // Try to get content from page
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_DOCUMENT_CONTENT' });

            if (response.content) {
                await performSeal(response.content);
            } else {
                showAlert('Please select a document file', 'warning');
            }
        } catch (error) {
            showAlert('Please select a document file', 'warning');
        }
        return;
    }

    try {
        confirmSealBtn.disabled = true;
        confirmSealBtn.textContent = 'Processing...';

        const fileContent = await readFile(file);
        await performSeal(fileContent);

    } catch (error) {
        showAlert('Failed to seal document: ' + error.message, 'error');
    } finally {
        confirmSealBtn.disabled = false;
        confirmSealBtn.textContent = 'Seal Document';
    }
}

async function performSeal(documentContent) {
    try {
        const response = await sendMessage({
            type: 'SEAL_DOCUMENT',
            data: { documentContent }
        });

        if (response.success) {
            showAlert(
                `Document sealed! ${response.eventCount} events in ${response.blockCount} blocks.`,
                'success'
            );

            // Reset UI
            fileSection.style.display = 'none';
            sealBtn.style.display = 'flex';
            documentFile.value = '';
            fileLabel.textContent = 'Choose file...';
            document.querySelector('.file-input-label').classList.remove('has-file');

            await refreshStatus();
        } else {
            throw new Error(response.error);
        }

    } catch (error) {
        throw error;
    }
}

// Private Key Status Check
async function checkPrivateKey() {
    try {
        const response = await sendMessage({ type: 'CHECK_PRIVATE_KEY' });

        if (response.hasKey) {
            keyStatus.textContent = 'Loaded';
            keyStatus.classList.remove('not-set');
            keyStatus.classList.add('set');
        } else {
            keyStatus.textContent = 'Not Found';
            keyStatus.classList.remove('set');
            keyStatus.classList.add('not-set');
        }
    } catch (error) {
        keyStatus.textContent = 'Error';
        keyStatus.classList.remove('set');
        keyStatus.classList.add('not-set');
        console.error('Failed to check private key:', error);
    }
}

// Reset Session
async function resetSession() {
    if (!confirm('This will delete all recorded events. Continue?')) {
        return;
    }

    try {
        await sendMessage({ type: 'RESET_SESSION' });
        await refreshStatus();
        showAlert('Session reset successfully', 'success');
        showMain();
    } catch (error) {
        showAlert('Failed to reset session: ' + error.message, 'error');
    }
}

// Utility Functions
function sendMessage(message) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(message, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else {
                resolve(response);
            }
        });
    });
}

function readFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsText(file);
    });
}

function showAlert(message, type = 'success') {
    alertMessage.textContent = message;
    alertBox.className = `alert ${type}`;
    alertBox.style.display = 'block';

    setTimeout(() => {
        alertBox.style.display = 'none';
    }, 4000);
}

// Cleanup on unload
window.addEventListener('unload', () => {
    if (updateInterval) {
        clearInterval(updateInterval);
    }
});
