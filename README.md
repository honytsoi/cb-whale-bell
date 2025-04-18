# CB Whale Bell 🐋

A client-side web application for Chaturbate broadcasters to track and monitor high-value tippers ("whales") and other key user activity. Safely store and analyze your tipping history and real-time events without sharing sensitive data with third parties.

## Features

-   **100% Client-Side & Secure**: All data processing and storage happens *only* in your browser. Your data never leaves your device.
-   **Tiered Data Storage**: Efficiently stores lifetime spending aggregates (total tips, privates, etc.) for all users in one IndexedDB store, while keeping detailed event history (tips, entries, follows, etc.) only for a configurable recent period (default 30 days) in another store to save space and improve performance.
-   **Performance Optimized**: Refactored data handling (utilizing IndexedDB and tiered storage) to efficiently manage large tipping histories and event volumes.
-   **Whale Detection**: Identify users who meet your personalized whale criteria based on lifetime totals and recent activity.
-   **Real-Time Alerts**: Get instant audible notifications and visible highlights in the activity log when users meeting your whale criteria enter your room.
-   **Track Follow Events**: See when users follow your channel directly in the real-time activity log.
-   **Detailed Activity Log**: View recent user entries, follows, tips, media purchases, and more with clear timestamps and event types.
-   **Automatic Threshold Suggestions**: Analyze your imported history data to recommend personalized whale criteria settings.
-   **Data Export/Import (v2.1 Format)**: Backup and restore your complete dataset (lifetime aggregates, recent events, and settings) in a secure JSON format. Optional password encryption is available for exports.
    -   **Important:** Importing data will **REPLACE** all existing data (users, recent events, settings) in the application. Merging data is currently disabled in v2.1.
-   **Cross-Browser Compatible**: Works on most modern browsers (Chrome, Edge, Firefox, Safari - latest versions recommended). Utilizes the Web Audio API for alert sounds.

## Live Demo

Try it now: [CB Whale Bell Demo](https://cb-whale-bell.adult-webcam-faq.com/)

## Quick Start Guide

Follow these steps to get set up:

1.  Visit the application: [CB Whale Bell](https://cb-whale-bell.adult-webcam-faq.com/)
2.  Click the "Settings" button in the header.
3.  **Step 1: Configure Events API**
    *   Scan the QR code provided by Chaturbate for your Events API (requires camera permission) or manually paste the API URL into the input field.
4.  **Step 2: Import History (Optional)**
    *   If you want to include past data for lifetime totals and threshold suggestions, import your token history CSV file. [Guide](https://www.adult-webcam-faq.com/guide/exporting-chaturbate-data/) on exporting your history.
5.  **Step 3: Set Whale Thresholds**
    *   Configure the token amounts for your whale criteria (Lifetime Spending, Recent Tips, etc.).
    *   Use the "Suggest Thresholds" button to analyze your imported history and get recommendations.
6.  In the "Advanced Settings" section, you can adjust the "Recent Event Retention (Days)" to control how long detailed event history is kept.
7.  Click the "Save Configuration" button at the bottom of the settings panel.
8.  Close the settings panel.
9.  Use the **toggle switch** in the header (next to the app title) to connect to the Chaturbate Events API. The switch will turn green and show 'Connected' when successful. (The toggle is disabled until an API URL is saved in settings).
10. Start tracking your whales and activity!

## Local Development

### Prerequisites

-   Modern web browser
-   Local web server (e.g., Python's `http.server`, VS Code Live Server extension, Nginx, Apache) to properly handle modules and other features. Opening `index.html` directly via `file://` URL might not work as expected due to browser security restrictions on local files.

### Running Locally

1.  Clone the repository:
    ```bash
    git clone https://github.com/honytsoi/cb-whale-bell.git
    cd cb-whale-bell
    ```

2.  Serve the directory using a local web server. For example, with Python:
    ```bash
    python -m http.server
    ```
3.  Open your web browser and navigate to `http://localhost:8000` (or the address/port your server uses).

No complex build process or external dependencies required locally - it's plain HTML, CSS, and JavaScript! External libraries (jsQR, PapaParse, CryptoJS, Dexie) are loaded via CDN links in `index.html`.

## Data Privacy

-   All data processing and logic runs entirely within your web browser.
-   No data is ever sent to any server, including the developer's.
-   **Aggregate user data** (lifetime totals, first/last seen dates) and **recent detailed events** (e.g., last 30 days, configurable) are stored persistently in your browser's IndexedDB database.
-   Older detailed events are automatically pruned from the IndexedDB based on your "Recent Event Retention" setting to manage browser storage space and maintain performance.
-   You can clear *all* stored data (users, events, settings) anytime through the settings panel ("Factory Reset").
-   You can export your data backup anytime, with an optional password encryption layer for added security.

## Browser Support

-   Most modern browsers are supported. Tested primarily on:
    -   Chrome (latest)
    -   Edge (latest)
-   Likely compatible with recent versions of Firefox and Safari, though minor UI variations may occur.

## Contributing

Contributions are welcome! Please feel free to fork the repository, create a feature branch, commit your changes, and open a Pull Request.

1.  Fork the repository
2.  Create your feature branch (`git checkout -b my-new-feature`)
3.  Commit your changes (`git commit -am 'Add some feature'`)
4.  Push to the branch (`git push origin my-new-feature`)
5.  Open a Pull Request

## License

[MIT License](LICENSE) - feel free to use this project for any purpose.

## Support

If you encounter any issues, have questions, or want to suggest improvements, please create an issue on the [GitHub repository](https://github.com/honytsoi/cb-whale-bell/issues).