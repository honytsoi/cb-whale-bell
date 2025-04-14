# CB Whale Bell 🐋

A client-side web application for Chaturbate broadcasters to track and monitor high-value tippers ("whales"). Safely store and analyze your tipping history without sharing sensitive data with third parties.

## Features

- **Performance Optimized**: Refactored to handle large tipping histories efficiently.
- **100% Client-Side**: All data processing and storage happens in your browser.
- **Secure**: Your data never leaves your device.
- **Aggregate Tracking**: Stores lifetime spending aggregates for all users.
- **Recent Event History**: Keeps detailed event history only for a configurable recent period (default 30 days) to save space and improve performance.
- **Whale Detection**: Identify whales based on lifetime totals and recent activity.
- **Real-Time Alerts**: Get notified when whales enter your room.
- **Data Export/Import**: Backup and restore your aggregate data and recent events (Note: JSON format updated in v2.0).
- **Cross-Browser Compatible**: Works on all modern browsers.

## Live Demo

Try it now: [CB Whale Bell Demo](https://cb-whale-bell.adult-webcam-faq.com/)

## Quick Start

1. Visit [CB Whale Bell](https://cb-whale-bell.adult-webcam-faq.com/)
2. In the Settings, import your tipping data (CSV format).
3. Configure your whale thresholds and the "Recent Event Retention (Days)" setting. Use automatic suggestions for thresholds if desired.
4. Save your settings.
5. Connect to the Events API via the toggle switch in the header.
6. Start tracking your whales!

## Local Development

### Prerequisites

- Modern web browser
- Local web server 

### Running Locally

1. Clone the repository:
   ```bash
   git clone https://github.com/honytsoi/cb-whale-bell.git
   cd cb-whale-bell
   ```

2. Open `index.html` by serving it through a local web server.

No build process or dependencies required - it's plain HTML, CSS, and JavaScript!

## Data Privacy

- All data processing happens in your browser.
- No data is ever sent to any server.
- **Aggregate user data** (lifetime totals, first/last seen) and **recent detailed events** (e.g., last 30 days, configurable) are stored in your browser's IndexedDB. Older detailed events are automatically pruned.
- You can clear all stored data anytime through the settings ("Factory Reset").
- Export your aggregate data and recent events anytime for backup (Note: JSON format updated in v2.0, merge-on-import is disabled).

## Browser Support

- Chrome/Edge (latest)

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## License

MIT License - feel free to use this project for any purpose.

## Support

Create an issue on GitHub if you need help or want to report a bug.
