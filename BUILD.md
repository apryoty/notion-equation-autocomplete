# Build Instructions

This document explains how to build the Notion Equation Autocomplete extension from source code.

## Requirements

- **Operating System**: Windows, macOS, or Linux
- **Node.js**: v18.0.0 or higher (tested with v18.x and v20.x)
- **npm**: v9.0.0 or higher (comes with Node.js)

## Installation

1. **Install Node.js and npm**
   - Download from: https://nodejs.org/
   - Verify installation:
     ```bash
     node --version
     npm --version
     ```

2. **Install dependencies**
   ```bash
   npm install
   ```
   This will install all required packages listed in `package.json`:
   - webpack v5.88.0+
   - babel-loader v9.1.3+
   - webextension-polyfill v0.10.0
   - Other dev dependencies

## Build Process

### Build Firefox version
```bash
npm run build:firefox
```
Output will be in `dist-firefox/` directory containing:
- `manifest.json` (from `manifest-firefox.json`)
- `background.js` (compiled and minified)
- `content.js` (compiled and minified)
- `icons/` (copied from source)

### Build Chrome version
```bash
npm run build:chrome
```
Output will be in `dist-chrome/` directory

### Build both versions
```bash
npm run build
```

## Verification

After building, you can verify the extension:
1. Files should be in `dist-firefox/` (or `dist-chrome/`)
2. `manifest.json` should be valid JSON
3. File sizes should be approximately:
   - `content.js`: ~58 KB
   - `background.js`: ~10 KB
   - `manifest.json`: ~1 KB

## Development

For development with auto-rebuild:
```bash
npm run dev:firefox
```

## Notes

- The build process uses webpack to bundle the source files
- Babel transpiles modern JavaScript for browser compatibility
- Code is minified in production mode
- The `webextension-polyfill` library is bundled for cross-browser compatibility
