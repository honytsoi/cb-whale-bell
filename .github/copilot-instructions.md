Document 2: Coding Guidelines and Standards
1. General Principles
Clarity & Readability: Code should be easy to understand. Prioritize clarity over excessive cleverness.
Consistency: Adhere to these guidelines uniformly across the codebase.
Maintainability: Write code that is easy to modify and debug.
Modularity: Structure code into logical, reusable modules with clear responsibilities.
2. Language & Formatting
JavaScript: Use modern JavaScript (ES6+ Modules). const by default, let when reassignment is necessary. Avoid var.
Formatter: Use Prettier with standard settings (or project-agreed settings) to ensure consistent code style. Auto-format on save is recommended.
Indentation: 4 spaces.
Line Length: Aim for ~100-120 characters, break lines thoughtfully.
Semicolons: Required.
Quotes: Use single quotes (') for strings unless double quotes (") are needed (e.g., within JSON).
HTML: Use semantic HTML5 elements. Ensure proper nesting and validation.
CSS: Use clear, descriptive class names (e.g., BEM or a similar convention). Avoid overly broad selectors. Keep CSS modular (potentially one file per component, or logically grouped).
3. Naming Conventions
Variables & Functions: camelCase (e.g., userData, calculateTotalSpent).
Constants: UPPER_SNAKE_CASE (e.g., MAX_HISTORY_PER_USER).
Classes: PascalCase (e.g., UserManager, ApiHandler).
Files: camelCase.js or kebab-case.js (be consistent, camelCase.js preferred for modules). CSS files often use kebab-case.css.
Boolean Variables: Use prefixes like is, has, should (e.g., isConnected, hasUnsavedChanges).
4. Comments & Documentation
Purpose: Explain why something is done, not what the code does (if the code is self-explanatory). Document complex logic, workarounds, or non-obvious decisions.
JSDoc: Use JSDoc comments for all non-trivial functions and modules, describing parameters, return values, and purpose.
TODO/FIXME: Use // TODO: for planned enhancements and // FIXME: for known issues needing attention. Include context.
Remove Dead Code: Delete commented-out code blocks; rely on version control history.
5. Modularity & Structure
Separation of Concerns: Maintain clear separation between UI logic (ui.js), API interaction (apiHandler.js), data management (userManager.js, dataManager.js), configuration (config.js), utilities (utils.js), and database interaction (db.js).
Single Responsibility: Each module and function should aim to do one thing well.
Exports/Imports: Use ES6 export and import. Avoid default exports where possible; prefer named exports for clarity.
Avoid Global Scope: Encapsulate logic within modules. Minimize global variables.
6. Error Handling
Use try...catch: Handle potential errors gracefully, especially around I/O (IndexedDB, fetch), parsing (JSON, CSV), and external libraries.
Specific Errors: Catch specific error types where possible.
User Feedback: Use the ui.js module to display user-friendly error messages. Avoid showing raw error objects or stack traces to the user.
Console Logging: Log detailed error information (including the error object) to the console for debugging purposes. Use console.error, console.warn, console.log, console.info, console.debug appropriately.
7. Performance
IndexedDB: Use Dexie's bulk operations (bulkPut, bulkAdd, bulkDelete) where appropriate. Be mindful of transaction costs. Debounce frequent saves (userManager.saveUsersDebounced).
DOM Manipulation: Minimize direct DOM manipulation in loops. Cache DOM element references. Update the DOM efficiently (e.g., batch updates if necessary).
Asynchronous Operations: Use async/await for cleaner asynchronous code. Be aware of blocking the main thread during computationally intensive tasks (e.g., large data processing – use setTimeout(..., 0) or Web Workers if necessary, though likely overkill for V1).
Event Handling: Add and remove event listeners appropriately to prevent memory leaks. Use event delegation where practical.
8. Security
Client-Side Data: Reiterate that all sensitive data stays local. Never transmit user history or detailed stats to any external server.
Input Sanitization: While less critical as data isn't shared, sanitize any user-provided input (like CSV notes) if it's ever rendered directly as HTML to prevent potential self-XSS (unlikely in this app's context, but good practice).
Dependencies: Keep external libraries (jsQR, PapaParse, CryptoJS, Dexie) updated to patch security vulnerabilities.
9. Libraries & Dependencies
Use CDNs (Current): Document the specific CDN URLs and versions used.
Future: Consider bundling dependencies locally (using a build tool like Vite or Parcel) for better control, offline capability, and performance (reduces external requests).
10. Testing
Manual Testing: Currently the primary method. Test thoroughly across supported browsers and with various data scenarios (empty history, large history, edge cases).
Aspirational: Aim to introduce unit tests (e.g., using Vitest or Jest) for core logic (parsing, calculations, utility functions) in the future.
11. Version Control (Git)
Commits: Write clear, concise commit messages following conventional commit format (e.g., feat: Add whale threshold suggestion, fix: Correct CSV duplicate detection).
Branching: Use feature branches for new development (feature/xxx). Merge into main via Pull Requests (even if solo developer, it's good practice).
.gitignore: Ensure build artifacts, secrets (none should exist!), and OS files are ignored.
