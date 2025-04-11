// apiHandler.js - Handles connection and communication with the Chaturbate Events API

import * as userManager from './userManager.js';
import * as configManager from './config.js';
import * as ui from './ui.js';
import { displayError, parseTimestamp } from './utils.js';

let currentUrl = null;
let broadcasterName = null;
let isConnected = false;
let stopFetching = false; // Flag to control the fetch loop
let fetchTimeoutId = null; // To manage retry timeouts

const RETRY_DELAY_MS = 5000; // Delay before retrying after an error
const NO_NEXT_URL_DELAY_MS = 3000; // Delay when API doesn't provide nextUrl

export function isApiConnected() {
    return isConnected;
}

export function connectWithUrl(apiUrl = null) {
    if (isConnected) { console.log("Already connected."); return; }
    const urlToConnect = apiUrl || document.getElementById('scannedUrl')?.value;
    if (!urlToConnect || !urlToConnect.startsWith('https://eventsapi.chaturbate.com/events/')) {
        ui.displayMessage('Invalid Events API URL format.', 'error', 'apiEndpointResult'); return; // Use correct ID
    }
    console.log(`Attempting to connect to: ${urlToConnect}`);
    ui.updateConnectionUI('connecting'); // Use the new function name
    try {
        const urlParts = urlToConnect.split('/');
        if (urlParts.length > 4) broadcasterName = urlParts[4];
        if (!broadcasterName) throw new Error("Could not extract broadcaster name from URL.");
        console.log(`Extracted broadcaster: ${broadcasterName}`);
    } catch (error) {
        console.error("Error parsing URL:", error);
        ui.displayMessage(`Error parsing URL: ${error.message}`, 'error', 'apiEndpointResult'); // Use correct ID
        ui.updateConnectionUI(false); return; // Use the new function name
    }
    if (fetchTimeoutId) clearTimeout(fetchTimeoutId);
    currentUrl = urlToConnect; stopFetching = false; isConnected = true;
    configManager.updateConfig({ scannedUrl: currentUrl, broadcasterName: broadcasterName });
    ui.updateConnectionUI(true, currentUrl, broadcasterName); // Use the new function name
    ui.displayMessage(`Connected as ${broadcasterName}. Fetching events...`, 'success', 'apiEndpointResult', 10000); // Use correct ID
    ui.addLogEntry(`Connected to Events API as ${broadcasterName}.`, 'info');
    fetchEvents();
}

async function fetchEvents() {
    if (stopFetching || !currentUrl) {
        console.log("Fetching stopped or no URL."); isConnected = false; return;
    }
    try {
        const response = await fetch(currentUrl);
        if (stopFetching) return;
        if (response.ok) {
            const data = await response.json();
            if (data.events && data.events.length > 0) {
                console.log('🌐 Raw events from API:', data.events.map(e => ({
                    method: e.method,
                    timestamp: e.timestamp,
                    object: e.object
                })));
                data.events.forEach(processEvent);
            }
            if (data.nextUrl) {
                currentUrl = data.nextUrl;
                // Long polling - immediately request the next URL
                fetchEvents();
            } else {
                // No nextUrl means we should retry with the same URL after a delay
                // This should be rare, as the API typically provides a nextUrl
                // Note: Messages related to polling/retrying might be better suited for the toggle text area
                // ui.displayMessage(`Polling...`, 'info', 'connectionToggleStatusText', NO_NEXT_URL_DELAY_MS); // Example: Target toggle text
                // Keeping original target for now, but consider changing if needed.
                ui.displayMessage(`Polling...`, 'info', 'connectionStatus', NO_NEXT_URL_DELAY_MS);
                fetchTimeoutId = setTimeout(fetchEvents, NO_NEXT_URL_DELAY_MS);
            }
        } else {
            console.error(`API request failed: ${response.status} ${response.statusText}`);
            // Note: Messages related to polling/retrying might be better suited for the toggle text area
            // ui.displayMessage(`API Error: ${response.status}. Retrying...`, 'error', 'connectionToggleStatusText'); // Example: Target toggle text
            // Keeping original target for now, but consider changing if needed.
            ui.displayMessage(`API Error: ${response.status}. Retrying...`, 'error', 'connectionStatus');
            fetchTimeoutId = setTimeout(fetchEvents, RETRY_DELAY_MS);
        }
    } catch (error) {
        if (stopFetching) return;
        console.error("Network error during fetch:", error);
        // Note: Messages related to polling/retrying might be better suited for the toggle text area
        // ui.displayMessage('Network Error. Retrying...', 'error', 'connectionToggleStatusText'); // Example: Target toggle text
        // Keeping original target for now, but consider changing if needed.
        ui.displayMessage('Network Error. Retrying...', 'error', 'connectionStatus');
        fetchTimeoutId = setTimeout(fetchEvents, RETRY_DELAY_MS);
    }
}

// --- Event Processing Logic ---
function processEvent(event) {
    if (!event || !event.method || !event.object) { console.warn("Skipping invalid event object:", event); return; }
    const { method, object } = event;
    const timestamp = parseTimestamp(event.timestamp) || new Date().toISOString();

    // Log raw event before processing
    console.log('⚡ Processing event:', {
        method,
        timestamp,
        object: event.object
    });

    try {
        switch (method) {
            case 'userEnter': {
                const username = object.user?.username;
                if (username && username !== 'Anonymous') {
                    // Add event first, which also marks user online and returns if they were new
                    const isNewUser = userManager.addEvent(username, 'userEnter', { timestamp });

                    // Log user status (new/existing) before whale check
                    console.log(`User Entered: ${username} (${isNewUser ? 'NEW user' : 'Existing user'})`);
                    ui.addLogEntry(`${username} entered.`, 'user-enter'); // Changed from 'info' to 'user-enter'

                    // Perform detailed whale check (logs internally now)
                    const thresholds = configManager.getConfig();
                    if (userManager.isWhale(username, thresholds)) {
                        ui.triggerWhaleNotification(username); // Trigger sound/visuals if whale
                    }
                }
                break;
            }
            case 'userLeave': {
                const username = object.user?.username;
                if (username && username !== 'Anonymous') {
                     ui.addLogEntry(`${username} left.`, 'user-leave'); // Changed from 'info' to 'user-leave'
                    userManager.addEvent(username, 'userLeave', { timestamp });
                }
                break;
            }
            case 'tip': {
                 if (object.tip && object.user) {
                     const username = object.user.username;
                     const isAnon = object.tip.isAnon || false;
                     if (username && username !== 'Anonymous' && !isAnon) {
                         const amount = parseInt(object.tip.tokens, 10);
                         const message = object.tip.message || '';
                         if (!isNaN(amount) && amount > 0) {
                             ui.addLogEntry(`${username} tipped ${amount} tokens.`, 'tip');
                             userManager.addEvent(username, 'tip', { amount: amount, note: message, timestamp: timestamp });
                         } else { console.warn("Skipping tip event with invalid amount:", event); }
                     } else {
                          if (isAnon && object.tip.tokens) {
                               const amount = parseInt(object.tip.tokens, 10);
                               if (!isNaN(amount) && amount > 0) { ui.addLogEntry(`Anonymous tip of ${amount} tokens received.`, 'tip-anon'); }
                          }
                     }
                 } else { console.warn("Skipping malformed tip event:", event); }
                break;
            }
            case 'privateMessage': {
                 const fromUser = object.message?.from_user;
                 const messageText = object.message?.message;
                 if (fromUser && fromUser !== 'Anonymous' && messageText) {
                     // userManager.addEvent(fromUser, 'privateMessage', { content: messageText, isPrivate: true, timestamp });
                 }
                break;
            }
            case 'mediaPurchase': {
                 const username = object.user?.username;
                 const mediaName = object.media?.mediaName || object.media?.name || 'Unknown Media';
                 const price = object.media?.price ? parseInt(object.media.price, 10) : null;
                 if (username && username !== 'Anonymous' && price !== null && !isNaN(price) && price > 0) {
                     ui.addLogEntry(`${username} purchased '${mediaName}' for ${price} tokens.`, 'media');
                     userManager.addEvent(username, 'mediaPurchase', { item: mediaName, amount: price, timestamp: timestamp });
                 } else if (username && username !== 'Anonymous') { console.warn("Skipping mediaPurchase event with missing/invalid price:", event); }
                break;
            }
            default:
                break;
        }
    } catch (error) {
        console.error(`Error processing event (${method}):`, error, event);
        ui.addLogEntry(`Error processing event: ${method}. Check console.`, 'error');
    }
}

export function initializeAPI() {
    console.log("Initializing API handler...");
    const config = configManager.getConfig();
    if (config.scannedUrl && config.broadcasterName) {
        console.log(`Found existing API configuration for ${config.broadcasterName}`);
        // Don't auto-connect, but populate the URL field
        const urlInput = document.getElementById('scannedUrl');
        if (urlInput) {
            urlInput.value = config.scannedUrl;
        }
    }
}

export function disconnect() {
    console.log("Disconnecting from API...");
    if (!isConnected) { console.log("Already disconnected."); return; }
    stopFetching = true; isConnected = false;
    if (fetchTimeoutId) { clearTimeout(fetchTimeoutId); fetchTimeoutId = null; }
    ui.updateConnectionUI(false); // Use the new function name
    ui.displayMessage("Disconnected from Events API.", 'info', 'apiEndpointResult'); // Use correct ID
    ui.addLogEntry("Disconnected from Events API.", 'info');
}