// utils.js - Shared utility functions
import * as ui from './ui.js'; // Import the ui module

/**
 * Debounce function to limit the rate at which a function can fire.
 * @param {Function} func The function to debounce.
 * @param {number} wait The number of milliseconds to delay.
 * @param {boolean} immediate If true, trigger the function on the leading edge instead of the trailing.
 * @returns {Function} The debounced function.
 */
export function debounce(func, wait, immediate = false) {
    let timeout;
    return function executedFunction(...args) {
        const context = this;
        const later = function() {
            timeout = null;
            if (!immediate) func.apply(context, args);
        };
        const callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        if (callNow) func.apply(context, args);
    };
}

/**
 * Error display helper. Logs to console and uses the UI message system.
 * @param {string} message The error message for the user.
 * @param {Error} [errorObject] Optional error object for console logging.
 * @param {string} [elementId='connectionToggleStatusText'] Optional UI element ID for message display.
 */
export function displayError(message, errorObject = null, elementId = 'connectionToggleStatusText') { // Default to header status text
    console.error(`Error Util: ${message}`, errorObject || '');
    // Use the UI system instead of alert()
    try {
        // Try displaying in a specific element, fallback to a generic one if needed
        ui.displayMessage(`Error: ${message}`, 'error', elementId, 8000); // Show for 8 seconds
    } catch (uiError) {
        // Fallback if ui.displayMessage itself fails (e.g., during init)
        console.error("Fallback alert because ui.displayMessage failed:", uiError);
        alert(`Critical Error: ${message}`); // Keep alert as ultimate fallback
    }
}

/**
 * Parses a timestamp string into an ISO 8601 string.
 * Handles potential invalid dates.
 * @param {string} timestampStr The timestamp string to parse.
 * @returns {string | null} ISO 8601 string or null if invalid.
 */
export function parseTimestamp(timestampStr) {
    try {
        const date = new Date(timestampStr);
        if (isNaN(date.getTime())) {
            return null; // Invalid date
        }
        return date.toISOString();
    } catch (e) {
        return null; // Error during parsing
    }
}

// Add other general utility functions as needed...