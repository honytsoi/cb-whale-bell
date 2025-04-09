// utils.js - Shared utility functions

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
 * Simple error display helper (can be expanded or replaced by ui.js).
 * Logs error to console and shows an alert.
 * @param {string} message The error message.
 * @param {Error} [errorObject] Optional error object for console logging.
 */
export function displayError(message, errorObject = null) {
    console.error(message, errorObject || '');
    alert(`Error: ${message}`);
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