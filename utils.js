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
    // Create and show toast notification
    try {
        showToastNotification(`Error: ${message}`, 'error');
        // Also try displaying in the specified element if it exists
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = `Error: ${message}`;
            element.className = 'error';
            // Clear after 8 seconds
            setTimeout(() => {
                if (element.textContent === `Error: ${message}`) {
                    element.textContent = '';
                    element.className = '';
                }
            }, 8000);
        }
    } catch (uiError) {
        // If everything fails, log the error but don't show alert
        console.error("Critical UI Error:", uiError);
    }
}

/**
 * Shows a toast notification
 * @param {string} message The message to show
 * @param {string} type The type of notification ('error', 'success', 'info')
 */
export function showToastNotification(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    // Remove the toast after animation completes (3s)
    setTimeout(() => {
        if (toast.parentElement) {
            toast.parentElement.removeChild(toast);
        }
    }, 3000);
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