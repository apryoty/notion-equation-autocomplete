// Content script injected into Notion pages
// Provides automatic autocompletion for LaTeX equations

import { latexCommands } from './data/latex-commands.js';

// Initialize the autocomplete functionality
function init() {
  
  // Wait for Notion editor to be ready
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) {
          // Check if the node itself matches or contains matching elements
          const matches = [];
          if (node.matches && node.matches('.notion-overlay-container .content-editable-leaf-rtl[data-content-editable-leaf="true"]')) {
            matches.push(node);
          }
          if (node.querySelectorAll) {
            const innerMatches = node.querySelectorAll('.notion-overlay-container .content-editable-leaf-rtl[data-content-editable-leaf="true"]');
            matches.push(...innerMatches);
          }
          
          if (matches.length > 0) {
            matches.forEach(attachToEquationEditor);
          }
        }
      });
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // Attach to existing equation editors
  attachToExistingEditors();
}

function attachToExistingEditors() {
  // Find and attach to existing equation editors in the page
  const selectors = [
    '.notion-overlay-container .content-editable-leaf-rtl[data-content-editable-leaf="true"]',
  ];
  
  selectors.forEach(selector => {
    const editors = document.querySelectorAll(selector);
    editors.forEach(attachToEquationEditor);
  });
}

function attachToEquationEditor(element) {
  // Check if this is an equation editor
  if (!isEquationEditor(element)) return;
  
  // Avoid attaching multiple times
  if (element.dataset.notionAutocompleteAttached) {
    return;
  }
  element.dataset.notionAutocompleteAttached = 'true';

  // Track if user is deleting (backspace/delete key)
  let isDeleting = false;
  
  element.addEventListener('keydown', (event) => {
    // Detect backspace or delete key
    if (event.key === 'Backspace' || event.key === 'Delete') {
      isDeleting = true;
    } else {
      isDeleting = false;
    }
  });

  // Add input listener for autocomplete
  element.addEventListener('input', (event) => handleInput(event, isDeleting));
}

function isEquationEditor(element) {
  // Logic to detect if element is a Notion equation editor
  const isLeaf = element.getAttribute('data-content-editable-leaf') === 'true';
  const hasLeafClass = element.classList.contains('content-editable-leaf-rtl') || 
                       element.classList.contains('content-editable-leaf');
  const isContentEditable = element.getAttribute('contenteditable') === 'true';
  
  // Must have all three attributes to be an equation editor
  return isLeaf && hasLeafClass && isContentEditable;
}

function handleInput(event, isDeleting) {
  // Don't autocomplete if user is deleting
  if (isDeleting) {
    return;
  }
  
  const text = event.target.textContent;
  const cursorPos = getCursorPosition(event.target);
  
  // Check if user is typing a LaTeX command
  const match = text.substring(0, cursorPos).match(/\\[\w]*$/);
  
  if (match) {
    const partial = match[0];
    autocompleteIfUnique(event.target, partial, cursorPos);
  }
}

function autocompleteIfUnique(element, partial, cursorPos) {
  // Find matching commands
  const matches = latexCommands.filter(cmd => 
    cmd.command.startsWith(partial) && cmd.command !== partial
  );
  
  if (matches.length === 0) return;
  
  // If there's exactly one match, complete with the full command + after
  if (matches.length === 1) {
    const match = matches[0];
    const completion = match.command;
    const after = match.after || '';
    const text = element.textContent;
    
    // Calculate positions BEFORE modifying text
    const beforeCompletion = text.substring(0, cursorPos - partial.length);
    const afterCursor = text.substring(cursorPos);
    
    // Replace partial command with full command + after text
    const newText = beforeCompletion + completion + after + afterCursor;
    
    // Clear any existing formatting and set new text
    element.innerHTML = '';
    element.textContent = newText;
    
    // Trigger input event to let Notion re-format the content
    element.dispatchEvent(new Event('input', { bubbles: true }));
    
    // Calculate cursor position in the NEW text
    // Start position is where we inserted the completion
    const insertPosition = beforeCompletion.length;
    let newCursorPos = insertPosition + completion.length;
    
    if (after.includes('{')) {
      // Position cursor right AFTER the first '{' in the 'after' string
      const firstBraceInAfter = after.indexOf('{');
      newCursorPos = insertPosition + completion.length + firstBraceInAfter + 1;
    }
    
    setCursorPosition(element, newCursorPos);
  } 
  // If there are multiple matches, complete with the longest common prefix
  else if (matches.length > 1) {
    const commonPrefix = findLongestCommonPrefix(matches.map(m => m.command));
    
    // Only autocomplete if the common prefix is longer than what user typed
    if (commonPrefix.length > partial.length) {
      const text = element.textContent;
      const newText = text.substring(0, cursorPos - partial.length) + 
                     commonPrefix +
                     text.substring(cursorPos);
      
      // Clear any existing formatting and set new text
      element.innerHTML = '';
      element.textContent = newText;
      
      // Trigger input event to let Notion re-format the content
      element.dispatchEvent(new Event('input', { bubbles: true }));
      
      const newCursorPos = cursorPos - partial.length + commonPrefix.length;
      setCursorPosition(element, newCursorPos);
    }
  }
}

function findLongestCommonPrefix(strings) {
  if (strings.length === 0) return '';
  if (strings.length === 1) return strings[0];
  
  // Sort strings to compare first and last (which will be most different)
  const sorted = strings.slice().sort();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  let i = 0;
  
  while (i < first.length && first[i] === last[i]) {
    i++;
  }
  
  return first.substring(0, i);
}

function getCursorPosition(element) {
  const selection = window.getSelection();
  if (selection.rangeCount === 0) return 0;
  
  const range = selection.getRangeAt(0);
  const preCaretRange = range.cloneRange();
  preCaretRange.selectNodeContents(element);
  preCaretRange.setEnd(range.endContainer, range.endOffset);
  
  return preCaretRange.toString().length;
}

function setCursorPosition(element, position) {
  // Wait for the next frame to ensure DOM is updated
  requestAnimationFrame(() => {
    const range = document.createRange();
    const selection = window.getSelection();
    
    // Walk through all text nodes to find the one containing our position
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    
    let currentPos = 0;
    let textNode = walker.nextNode();
    let targetNode = null;
    let targetOffset = 0;
    
    // Find which text node contains the target position
    while (textNode) {
      const nodeLength = textNode.textContent.length;
      
      if (currentPos + nodeLength >= position) {
        // This node contains our target position
        targetNode = textNode;
        targetOffset = position - currentPos;
        break;
      }
      
      currentPos += nodeLength;
      textNode = walker.nextNode();
    }
    
    // If no text node found or position is beyond all text, use last node
    if (!targetNode) {
      // Reset walker to find last text node
      walker.currentNode = element;
      while ((textNode = walker.nextNode())) {
        targetNode = textNode;
      }
      targetOffset = targetNode ? targetNode.textContent.length : 0;
    }
    
    if (targetNode) {
      // Ensure offset doesn't exceed node length
      const safeOffset = Math.min(targetOffset, targetNode.textContent.length);
      
      range.setStart(targetNode, safeOffset);
      range.collapse(true);
      
      selection.removeAllRanges();
      selection.addRange(range);
    } else {
      // Fallback: no text nodes, create one
      const newTextNode = document.createTextNode('');
      element.appendChild(newTextNode);
      range.setStart(newTextNode, 0);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  });
}

// Start the extension
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
