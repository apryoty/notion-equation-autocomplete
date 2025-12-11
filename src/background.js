// Background script for the extension
// Handles extension lifecycle and messaging

// Uses webextension-polyfill for cross-browser compatibility (Chrome, Edge, Firefox)
import browser from 'webextension-polyfill';

browser.runtime.onInstalled.addListener(() => {
  console.log('Notion Equation Autocomplete installed');
});

// Listen for messages from content scripts
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GET_LATEX_COMMANDS') {
    // Handle requests for LaTeX commands
    sendResponse({ success: true });
  }
  return true;
});
