# Citation Styler Client Sync — Zotero Plugin

## Project Overview

This is a Zotero plugin that enables users to install and manage custom citation styles directly within Zotero. The plugin authenticates users via license keys, validates their credentials, and provides an interface for installing and updating purchased custom styles.

**Repository:** https://github.com/POBrien333/citationstyler-client-sync
**Plugin ID:** `citationstyler-sync@citationstyler.com`
**License:** AGPL-3.0-or-later
**Version:** see `version` in `package.json`

## Release Process Notes

- Never commit to `main` directly; every change goes through a branch + PR.
- When the user asks to "release" or "prepare a release":
  1. On a branch, add a new version entry to the **Changelog** section in `README.md`
  2. Bump the version with `npm version X.Y.Z --no-git-tag-version` (updates `package.json` and `package-lock.json`)
  3. Open a PR; the user merges it
  4. Tag the merge commit and push **only the tag**: `git tag vX.Y.Z <merge-sha> && git push origin vX.Y.Z`
  5. The tag triggers `.github/workflows/release.yml`, which builds, creates the GitHub release with the XPI, and updates `update.json`
- **Do not run `npm run release` locally.** Outside CI it bumps the version, commits, tags and pushes straight to `main`.

## Planned for a Future Release

Raise these with the user when preparing the next release.

### Send the license key in a header instead of the URL

- **Problem:** `src/modules/customStyles.ts` sends the key as a query parameter: `GET /styles?license_key=…` and `GET /styles/{id}?license_key=…`. URLs end up in server access logs, proxy logs and caches. (The validate endpoint already uses a POST body and is fine.)
- **Order matters:**
  1. **Server first:** accept the key in a request header (e.g. `X-License-Key`) on both endpoints, **while still accepting `?license_key=`**, because every installed copy up to v1.0.8 uses it.
  2. **Plugin:** once the server is live, send the header and stop adding `license_key` to the URL. Keep the `license_key=` log redaction in `src/utils/logger.ts`.
  3. **Later:** the server can drop query-parameter support once nearly all users run the new version.
- **Status:** waiting on the server change (step 1).

## Key Features

- **License Validation**: Users enter email and license key; the plugin validates against a backend service
- **Custom Styles Installation**: Browse and install purchased citation styles directly in Zotero
- **Update Management**: Check for and install style updates
- **Zotero Integration**: Fully integrated preferences pane in Zotero settings
- **Multi-device Support**: Activation limits enforced per license
- **Graceful Degradation**: Cache-based validation allows offline usage

## Technology Stack

- **Language**: TypeScript
- **Framework**: [Zotero Plugin Toolkit](https://github.com/windingwind/zotero-plugin-toolkit) v6 (only `BasicTool` is used, see `src/utils/ztoolkit.ts`)
- **Build Tool**: [zotero-plugin-scaffold](https://www.npmjs.com/package/zotero-plugin-scaffold)
- **Testing**: Mocha + Chai
- **Code Quality**: ESLint + Prettier
- **Target**: Zotero 7+ (supports Firefox 115+)
- **Package Manager**: npm (Node.js 18+)

## Project Structure

```
├── src/
│   ├── addon.ts                 # Main addon class & data management
│   ├── index.ts                 # Plugin initialization entry point
│   ├── hooks.ts                 # Lifecycle hooks (startup, shutdown, prefs events)
│   ├── modules/
│   │   ├── license.ts           # License validation & credential management
│   │   └── customStyles.ts      # Style installation & update logic
│   └── utils/
│       ├── ztoolkit.ts          # Zotero toolkit wrapper
│       ├── locale.ts            # i18n localization strings
│       ├── prefs.ts             # Preferences utilities
│       └── window.ts            # Window management utilities
│
├── addon/
│   ├── manifest.json            # Plugin manifest (templated)
│   ├── content/
│   │   ├── preferences.xhtml    # Preferences pane UI
│   │   ├── icons/               # Plugin icons
│   │   └── styles/              # UI stylesheets
│   └── locale/                  # i18n translation files
│
├── test/
│   └── startup.test.ts          # Mocha test suite
│
├── zotero-plugin.config.ts      # Build configuration
├── package.json                 # Dependencies & config
├── tsconfig.json                # TypeScript configuration
└── eslint.config.mjs            # ESLint configuration
```

## Core Modules

### License Module (`src/modules/license.ts`)

Handles license validation, credential storage, and Zotero account integration.

**Key Functions:**

- `validate(credentials, forceRefresh)` — Validate email + license key against backend
- `saveCredentials(email, licenseKey)` — Store credentials in Zotero prefs (plaintext, not encrypted)
- `loadCredentials()` — Retrieve stored credentials
- `clearCredentials()` — Remove stored credentials
- `getZoteroUserId()` — Get logged-in Zotero account ID
- `isCacheExpiringSoon()` — Check if validation cache is expiring

**Features:**

- Cache-based validation for offline support (14-day cache + 7-day grace period)
- The cache is bound to a SHA-256 fingerprint of email + license key + Zotero user ID, so it is only reused for the exact credentials that earned it
- Grace period handling
- Device activation limit enforcement

### Custom Styles Module (`src/modules/customStyles.ts`)

Manages style installation, rendering, and updates.

**Key Functions:**

- `renderStylesInPrefs(doc, container, statusDiv, validationResult, licenseKey)` — Display available styles in preferences
- `checkAndInstallUpdates(doc, container, statusDiv, licenseKey)` — Fetch and install style updates
- `installStyleToZotero(styleId, styleContent)` — Install a style to Zotero (`Zotero.Styles.install` resolves to `{ styleTitle, styleID }`)

## Lifecycle Hooks (`src/hooks.ts`)

### `onStartup()`

- Waits for Zotero initialization
- Initializes localization
- Registers the preferences pane
- Opens preferences on first install

### `onMainWindowLoad(win)`

- Initializes ZToolkit for each window
- Registers FTL (Fluent) localization strings

### `onMainWindowUnload(win)` / `onShutdown()`

- Cleans up event listeners
- Closes dialog windows
- Unregisters all handlers

### `onPrefsEvent(type, data)`

Handles the preferences pane UI interactions:

- **Email/License Input**: Form fields for credentials
- **Verify Button**: Triggers license validation
- **Styles Container**: Displays installable styles with Install/Update buttons
- **Logout Button**: Clears stored credentials
- **Check for Updates Button**: Fetches updates for installed styles

**Status Colors:**

- Green (#28a745): Verified license
- Orange (#fd7e14): Grace period or expiring soon
- Red (#dc3545): Errors (invalid email, missing credentials, validation failed)
- Gray (#888): In-progress or neutral

## Build & Development

### Scripts

```bash
npm start              # Start dev server with hot-reload
npm run build          # Build plugin & run TypeScript check
npm run lint:check     # Check formatting & linting
npm run lint:fix       # Auto-fix formatting & linting
npm run release        # Build release XPI
npm test               # Run Mocha test suite
npm run update-deps    # Update dependencies
```

### Build Output

- **Development**: `.scaffold/build/` directory
- **Release**: XPI file for distribution
- Manifest is templated with package.json values

## Configuration

### package.json Config Section

```json
"config": {
  "addonName": "Citation Styler Client Sync",
  "addonID": "citationstyler-sync@citationstyler.com",
  "addonRef": "citationstyler-sync",           // Namespace for chrome://
  "addonInstance": "CitationStylerSync",      // Global Zotero object instance
  "prefsPrefix": "extensions.zotero.citationstyler-sync"  // Prefs storage prefix
}
```

### Environment Variables

- `NODE_ENV`: "development" or "production" (passed to plugin via `__env__`)
- Plugin sets `__env__` in esbuild define

## Important Implementation Details

### First Install Experience

When the plugin is first installed:

1. Checks `extensions.citationstyler.installed` preference
2. If not set, opens the preferences pane automatically
3. User enters email and license key
4. Plugin validates against backend
5. Installed styles are displayed

### Preferences Pane Elements

All elements queried in `onPrefsEvent`:

- `#prefs-verify-btn` — License verification button
- `#prefs-email-input` — Email address input
- `#prefs-license-input` — License key input
- `#prefs-status` — Status messages
- `#prefs-styles-container` — Installed styles list
- `#prefs-logout-btn` — Clear credentials button
- `#prefs-check-updates-btn` — Check for updates button
- `#prefs-update-row` — Update controls container
- `#prefs-update-status` — Update status message

### Zotero Integration

- Uses `Zotero.Prefs` for persistent storage
- Uses `Zotero.getMainWindows()` to iterate windows
- Uses `Zotero.PreferencePanes.register()` to add settings pane
- Uses `Zotero.Utilities.Internal.openPreferences()` to open prefs
- Uses `MozXULElement.insertFTLIfNeeded()` for localization

### Email Validation

Simple regex validation in `onPrefsEvent`:

```typescript
!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
```

## Localization

Localization strings are stored in `addon/locale/` and referenced via `getString(key, options)` from `src/utils/locale.ts`.

**Common Keys:**

- `prefs-title` — Preferences pane title
- `email-placeholder`, `license-placeholder` — Input placeholders
- `status-verifying`, `status-verified`, `status-verification-failed` — Status messages
- `status-no-zotero` — Zotero account not logged in
- `status-grace-period` — License in grace period
- `status-all-uptodate` — No updates available

## Error Handling

**Common User-Facing Errors:**

- "Please log in to your Zotero account" → User must sign in at zotero.org
- "Email does not match this license key" → Email/key mismatch
- "Activation limit reached" → Too many devices for this license

**Developer Error Handling:**

- Try-catch blocks around validation and update checks
- Errors logged via `csLog()` (`src/utils/logger.ts`), which keeps a 200-entry buffer for the "Copy Logs" button and redacts `license_key=` values
- User receives readable error messages in status display

## Release Process

See **Release Process Notes** at the top. In short: changelog + version bump via PR, then push a `vX.Y.Z` tag. CI (`zotero-plugin release` in CI mode) builds the XPI, uploads it to the `vX.Y.Z` GitHub release, and updates `update.json` on the `release` tag, which installed copies poll via the manifest's `update_url`.

## Testing

Tests are written in Mocha + Chai in `test/startup.test.ts`.

**Key Test Requirement:**

- Tests wait for plugin initialization via: `Zotero.CitationStylerSync.data.initialized`

## Known Limitations & Notes

- Plugin requires active Zotero account (zotero.org login)
- License validation requires internet connection (unless cached)
- Email validation is basic regex-based
- Cache expiration is configurable in license module
- Style installation depends on Zotero's style management API

## Author & Support

**Author:** Citation Styler
**Email:** info@citationstyler.com
**Website:** https://citationstyler.com
**Issues:** https://github.com/POBrien333/citationstyler-client-sync/issues
