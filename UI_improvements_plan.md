Overview
The Chaturbate Whale Bell app is designed to monitor real-time events from Chaturbate's Events API, identify "whale" users based on predefined thresholds, and notify the broadcaster via sound alerts. The app should have an intuitive and clean interface optimized for mobile use, ensuring minimal interaction while maintaining full functionality.

User Workflow
App Launch
Initial Screen :
A simple welcome screen or direct entry into the main interface.
Display a connection status indicator (e.g., disconnected/connecting/connected).
Settings Icon (⚙️): Positioned at the top-right corner for accessing configuration.
Token History Import (Optional but Encouraged)
Prompt : If no token history has been loaded yet, display a non-intrusive reminder prompting the user to import their token history CSV.
Action : Provide a clear button or link to initiate the import process.
Outcome : Once imported, update internal data structures and thresholds automatically. Optionally suggest thresholds based on imported data.
Threshold Configuration
Automatic Suggestion : After importing token history, offer to set thresholds automatically. Ensure this doesn’t override any manual settings from previous sessions unless explicitly allowed by the user.
Manual Adjustment : Allow users to manually adjust thresholds via the settings panel.
Persistence : Save all threshold settings in localStorage so they persist across sessions.
Connect to Event Feed
QR Code Scanner : Primary method for connecting to the Events API. Display a prominent “Scan QR Code” button.
Manual URL Input : Alternative option for entering the Events API URL manually.
Saved Connection : Automatically reconnect to the last-used Events API URL if available.
Event Monitoring Interface
Clean UI : A single-screen interface without scrolling, optimized for mobile use.
Start/Stop Controls : Include large, easily accessible buttons for starting and stopping event monitoring.
Real-Time Activity Log : Display recent activity (e.g., user enters/exits, tips received) in a concise log format.
Whale Notifications : Play a bell sound and highlight whale notifications prominently when detected.
Settings Panel
Basic Settings : Thresholds, sound preferences, and connection details.
Advanced Settings : Separate section for advanced configurations (e.g., pruning settings, backup options).
Accessibility : Ensure all settings are reachable via the settings icon (⚙️).
Detailed Components and Functionalities
1. Header Section
Title : “Chaturbate Whale Bell”
Connection Status : Indicator showing current connection state (Disconnected/Connecting/Connected).
Settings Icon : Cog wheel (⚙️) positioned at the top-right corner.
2. Main Interface
Start/Stop Buttons :
Large, centered buttons labeled “Start Monitoring” and “Stop Monitoring.”
Change button states dynamically based on current monitoring status.
Recent Activity Log :
Displays the latest events (user enters/exits, tips, media purchases).
Use color-coded entries for different event types (e.g., green for user enter, blue for tips).
Limit log length to prevent overcrowding.
Whale Notification Area :
Dedicated space to highlight whale notifications with visual cues (e.g., whale emoji 🐳).
Play a distinct bell sound upon detecting a whale.
3. Settings Panel
Basic Settings :
Thresholds : Input fields for lifetime spending, recent tip amounts, etc.
Sound Preferences : Dropdown or upload option for selecting/notification sounds.
Connection Details : QR code scanner button and manual URL input field.
Advanced Settings :
Data Management : Options for importing/exporting data, factory reset.
Pruning Settings : Configure automatic data pruning to manage storage efficiently.
Backup Options : Enable password protection for exported backups.
Separation of Initial/Ongoing Settings :
Clearly label which settings are part of the initial setup versus ongoing adjustments.
Use collapsible sections or tabs to organize settings logically.
4. Token History Import
Import Button : Prominent button labeled “Import Token History (.csv)”.
Progress Indicator : Show progress bar and stats during import (e.g., users found, tokens processed).
Success/Failure Messages : Informative messages post-import indicating success or failure.
5. Mobile Optimization
Single-Screen Layout : Ensure all critical elements fit within a single screen without requiring scrolling.
Touch-Friendly Controls : Large buttons and interactive elements suitable for touch input.
Minimized Interaction : Reduce the need for frequent interactions once the app is set up.
Visual Design Guidelines
Color Scheme :
Use a consistent and professional color palette (e.g., dark theme with light accents).
Highlight important elements like start/stop buttons and whale notifications with contrasting colors.
Typography :
Clear and legible fonts suitable for small screens.
Use font weights and sizes to establish hierarchy (e.g., larger font for headers).
Icons and Visual Cues :
Utilize standard icons (e.g., cog wheel for settings, play/pause for start/stop).
Incorporate subtle animations for feedback (e.g., button press animations, loading spinners).
Responsive Design :
Ensure the layout adapts seamlessly to various screen sizes and orientations.
Test extensively on actual mobile devices to verify usability.
Technical Considerations
State Management :
Persist user settings and thresholds using localStorage.
Handle edge cases like storage quota exceeded gracefully.
Performance Optimization :
Debounce save operations to minimize performance impact.
Optimize data processing tasks (e.g., parsing CSV, recalculating stats) to run efficiently even on lower-end devices.
Error Handling :
Provide informative error messages for common issues (e.g., invalid CSV format, failed API connections).
Offer troubleshooting tips or links to documentation where applicable.
Security :
Implement optional password-based encryption for data exports.
Validate and sanitize all user inputs to prevent potential vulnerabilities.
Wireframe Sketch
Below is a conceptual wireframe illustrating the proposed layout:

Copy
1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
+-------------------------------------------------------------+
| Chaturbate Whale Bell              [⚙️]                     |
| Status: Connected                                             |
+-------------------------------------------------------------+
|                                                             |
|                    [Start Monitoring]                       |
|                                                             |
| Recent Activity Log:                                         |
| - UserX entered                                              |
| - UserY tipped 5000 tokens                                   |
| - 🐳 WhaleUser entered                                       |
|                                                             |
| Whale Notification:                                          |
| 🐳 WhaleUser just entered!                                   |
|                                                             |
|                    [Stop Monitoring]                        |
|                                                             |
+-------------------------------------------------------------+
Conclusion
This specification aims to create a cohesive, user-friendly experience for the Chaturbate Whale Bell app. By adhering to these guidelines, designers and developers can build an application that meets both functional and aesthetic requirements, ensuring it operates smoothly on mobile devices while providing essential features for broadcasters.




## Colors and pallets

<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Gradient Starry Background</title>
  <style>
    body {
      margin: 0;
      overflow: hidden;
    }
    canvas {
      display: block;
    }
  </style>
</head>
<body>
  <canvas id="canvas"></canvas>
  <script src="script.js"></script>
</body>
</html>

// Get the canvas element and its context
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// Set canvas dimensions to match the viewport
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// Define gradient colors
const gradientColors = ['#330066', '#FF69B4', '#FFB6C1', '#FFFF00', '#ADD8E6'];

// Function to create a linear gradient
function createGradient(ctx, colors) {
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  colors.forEach((color, index) => {
    gradient.addColorStop(index / (colors.length - 1), color);
  });
  return gradient;
}

// Draw the gradient background
function drawBackground() {
  const gradient = createGradient(ctx, gradientColors);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// Draw floating circles
function drawCircles() {
  const circleCount = 5;
  const minRadius = 20;
  const maxRadius = 100;

  for (let i = 0; i < circleCount; i++) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const radius = Math.random() * (maxRadius - minRadius) + minRadius;
    const opacity = Math.random() * 0.5 + 0.5; // Random opacity between 0.5 and 1

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
    ctx.fill();
    ctx.closePath();
  }
}

// Draw stars
function drawStars() {
  const starCount = 50;
  const minSize = 1;
  const maxSize = 5;

  for (let i = 0; i < starCount; i++) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const size = Math.random() * (maxSize - minSize) + minSize;
    const points = 5; // Number of points in the star
    const innerRadius = size / 2;
    const outerRadius = size;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.random() * Math.PI);

    ctx.beginPath();
    for (let j = 0; j < points * 2; j++) {
      const isPoint = j % 2 === 0;
      const radius = isPoint ? outerRadius : innerRadius;
      const angle = (Math.PI * 2) / (points * 2) * j;
      ctx.lineTo(radius * Math.cos(angle), radius * Math.sin(angle));
    }
    ctx.closePath();
    ctx.fillStyle = 'white';
    ctx.fill();
    ctx.restore();
  }
}

// Main animation loop
function animate() {
  ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear the canvas
  drawBackground(); // Draw the gradient background
  drawCircles(); // Draw floating circles
  drawStars(); // Draw stars

  requestAnimationFrame(animate); // Request next frame
}

// Start the animation
animate();

