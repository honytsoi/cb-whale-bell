## Chaturbate Whale Bell Action Plan

([X] marks already completed
[D] marks delayed, to be done later
[>] marks currently in progress
[R] marks rejected steps not to be done
[?] marks steps that need clarificaiton
lines with no mark should have [ ] added to show they are not done
)

### 1. Project Setup

1. [X} Create a new directory for the project.
2. [X] Initialize a Git repository and link it to GitHub.
3. Set up Cloudflare Pages and configure the GitHub workflow for automatic deployment.

### 2. Core Technologies and Libraries

1. Include HTML5 for structure.
2. Use CSS3 for styling (consider a simple framework or the existing `main.css` structure).
3. Implement JavaScript (ES6+ Modules) for application logic.
4. Integrate `jsQR` for QR code scanning.
5. Use `PapaParse` for CSV parsing.
6. Include `CryptoJS` for optional password-based encryption/decryption.

### 3. Functional Requirements Implementation

#### 3.1 Data Import (Token History CSV)

1. Create a file input button for importing the token history CSV.
2. Use `PapaParse` to parse the CSV file.
3. Validate required columns (`"User"`, `"Token change"`, `"Timestamp"`, `"Note"`).
4. Extract and process data (username, amount, timestamp, note).
5. Implement duplicate prevention and private show grouping logic.
6. Display success or error messages.

#### 3.2 Event Feed Connection (Chaturbate Events API)

1. Implement QR code scanning using `jsQR`.
2. Provide manual URL input for connecting to the Events API.
3. Establish a polling loop to fetch events from the API.
4. Handle connection errors and implement reconnection attempts.

#### 3.3 User Data Management

1. Implement the `UserManager` class.
2. Use `localStorage` to persist user data.
3. Define the user object structure and core methods (`addUser`, `getUser`, `addEvent`, `updateTokenStats`, etc.).

#### 3.4 Real-time Event Processing

1. Process `userEnter`, `userLeave`, `tip`, `privateMessage`, and `mediaPurchase` events.
2. Call `userManager.addEvent` for each relevant event.
3. Implement whale check logic during `userEnter` events.

#### 3.5 Configuration Management

1. Store configuration settings in `localStorage`.
2. Create a settings UI with input fields for thresholds and other settings.
3. Implement `loadConfig`, `saveConfig`, and `initConfig` functions.

#### 3.6 Whale Notification

1. Trigger the whale notification when `userManager.isWhale` returns `true`.
2. Use the JavaScript `Audio` object to play the bell sound.
3. Optionally display a visual notification.

#### 3.7 Data Export/Import/Backup

1. Implement data export functionality with optional password encryption.
2. Create data import functionality with decryption and validation.
3. Provide a factory reset option.

### 4. Non-Functional Requirements

1. Optimize performance, especially for `getSpentInPeriod` calculations.
2. Ensure efficient use of `localStorage` and implement pruning if necessary.
3. Design a simple and clear UI.
4. Handle errors gracefully and implement automatic reconnection for the event feed.
5. Ensure data security with optional password encryption for export/import.

### 5. User Interface

1. Design the header with connection status and settings button.
2. Create the main area for displaying recent user enter events.
3. Implement the settings panel with all necessary configuration options.
4. Add a footer with project information.

### 6. Testing and Deployment

1. Manually test all functionalities with various scenarios.
2. Ensure correct deployment via Cloudflare Pages and GitHub workflow.
3. Document instructions for serving the application locally in the README.

By following this action plan, we can systematically develop the Chaturbate Whale Bell application according to the provided specification.