// Content script injected into Notion pages
// Provides automatic autocompletion for LaTeX equations

import { latexCommands, latexEnvironments } from './data/latex-commands.js';

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
  // Flag to prevent recursive calls when we modify the text
  let isProcessing = false;
  
  element.addEventListener('keydown', (event) => {
    // Detect backspace or delete key
    if (event.key === 'Backspace' || event.key === 'Delete') {
      isDeleting = true;
    } else {
      isDeleting = false;
    }
  });

  // Add input listener for autocomplete
  element.addEventListener('input', (event) => {
    if (isProcessing) return;
    isProcessing = true;
    handleInput(event, isDeleting);
    isProcessing = false;
  });
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

/**
 * Checks if the number of \begin{} matches the number of \end{}
 * @param {string} text - The text to check
 * @returns {boolean} - True if counts match, false otherwise
 */
function isBeginEndBalanced(text) {
  const beginCount = (text.match(/\\begin\{/g) || []).length;
  const endCount = (text.match(/\\end\{/g) || []).length;
  return beginCount === endCount;
}

/**
 * Finds the position of the \end{} tag corresponding to a given \begin{}
 * @param {string} text - The complete text
 * @param {number} beginPos - Position of the \begin{}
 * @returns {object|null} - {pos, endPos, name} or null if not found
 */
function findCorrespondingEnd(text, beginPos) {
  const beginRegex = /\\begin\{([^}]*)\}/g;
  const endRegex = /\\end\{([^}]*)\}/g;
  
  const begins = [];
  const ends = [];
  
  let match;
  while ((match = beginRegex.exec(text)) !== null) {
    begins.push({ name: match[1], pos: match.index, endPos: match.index + match[0].length });
  }
  while ((match = endRegex.exec(text)) !== null) {
    ends.push({ name: match[1], pos: match.index, endPos: match.index + match[0].length });
  }
  
  // Find our \begin{} tag
  const ourBegin = begins.find(b => b.pos === beginPos);
  if (!ourBegin) return null;
  
  // Create a sorted list of all tags after our \begin{}
  const tagsAfter = [];
  begins.forEach(b => {
    if (b.pos > ourBegin.pos) {
      tagsAfter.push({ type: 'begin', ...b });
    }
  });
  ends.forEach(e => {
    if (e.pos > ourBegin.pos) {
      tagsAfter.push({ type: 'end', ...e });
    }
  });
  tagsAfter.sort((a, b) => a.pos - b.pos);
  
  // Count nesting levels to find the corresponding \end{}
  let level = 0;
  for (const tag of tagsAfter) {
    if (tag.type === 'begin') {
      level++;
    } else {
      if (level === 0) {
        return { pos: tag.pos, endPos: tag.endPos, name: tag.name };
      }
      level--;
    }
  }
  
  return null;
}

/**
 * Synchronizes \begin{} and \end{} arguments
 * For each \begin{}, finds its corresponding \end{} and updates the argument to match
 * Also autocompletes environment names
 * @param {HTMLElement} element - The editor element
 * @returns {boolean} - True if any modification was made, false otherwise
 */
function syncBeginEndArguments(element) {
  let text = element.textContent;
  const cursorPos = getCursorPosition(element);
  let modified = false;
  let offsetBeforeCursor = 0;
  
  // Find all \begin{} tags
  const beginRegex = /\\begin\{([^}]*)\}/g;
  const begins = [];
  let match;
  
  while ((match = beginRegex.exec(text)) !== null) {
    begins.push({
      pos: match.index,
      name: match[1]
    });
  }
  
  // Check if cursor is in a \begin{} and autocomplete environment name
  for (const begin of begins) {
    const beginStart = begin.pos + 7; // Position after \begin{
    const beginEnd = begin.pos + 7 + begin.name.length;
    
    if (cursorPos >= beginStart && cursorPos <= beginEnd && begin.name.length > 0) {
      // Find matching environment names
      const matches = latexEnvironments.filter(env => 
        env.name.startsWith(begin.name) && env.name !== begin.name
      );
      
      if (matches.length === 1) {
        // Exactly one match, autocomplete
        const completion = matches[0].name;
        const beforeName = text.substring(0, beginStart);
        const afterName = text.substring(beginEnd);
        text = beforeName + completion + afterName;
        offsetBeforeCursor += (completion.length - begin.name.length);
        modified = true;
        // Update the begin name for sync below
        begin.name = completion;
      } else if (matches.length > 1) {
        // Multiple matches, find longest common prefix
        const commonPrefix = findLongestCommonPrefix(matches.map(m => m.name));
        if (commonPrefix.length > begin.name.length) {
          const beforeName = text.substring(0, beginStart);
          const afterName = text.substring(beginEnd);
          text = beforeName + commonPrefix + afterName;
          offsetBeforeCursor += (commonPrefix.length - begin.name.length);
          modified = true;
          // Update the begin name for sync below
          begin.name = commonPrefix;
        }
      }
      break; // Only autocomplete the one where cursor is
    }
  }
  
  // Process each \begin{} and sync with its corresponding \end{}
  for (const begin of begins) {
    const correspondingEnd = findCorrespondingEnd(text, begin.pos);
    
    if (correspondingEnd && correspondingEnd.name !== begin.name) {
      // Update \end{} argument to match \begin{}
      const newEndTag = `\\end{${begin.name}}`;
      const oldLength = correspondingEnd.endPos - correspondingEnd.pos;
      const newLength = newEndTag.length;
      
      // Track offset if modification happens before cursor
      if (correspondingEnd.pos < cursorPos) {
        offsetBeforeCursor += (newLength - oldLength);
      }
      
      text = text.substring(0, correspondingEnd.pos) + newEndTag + text.substring(correspondingEnd.endPos);
      modified = true;
    }
  }
  
  if (modified) {
    element.textContent = text;
    // Adjust cursor position based on text changes before it
    setCursorPosition(element, cursorPos + offsetBeforeCursor);
  }
  
  return modified;
}

/**
 * Adds \end{} after a \begin{} if counts are unbalanced
 * @param {HTMLElement} element - The editor element
 */
function addEndIfNeeded(element) {
  const text = element.textContent;
  
  if (!isBeginEndBalanced(text)) {
    // Find the last \begin{} position
    const beginMatches = [...text.matchAll(/\\begin\{([^}]*)\}/g)];
    if (beginMatches.length === 0) return;
    
    const lastBegin = beginMatches[beginMatches.length - 1];
    const beginName = lastBegin[1];
    const insertPos = lastBegin.index + lastBegin[0].length;
    
    // Insert \n\n\end{} after the \begin{}
    const newText = text.substring(0, insertPos) + '\n\n\\end{' + beginName + '}' + text.substring(insertPos);
    element.textContent = newText;
  }
}

/**
 * Checks if the cursor is positioned inside a \begin{} argument (between braces)
 * @param {string} text - The complete text
 * @param {number} cursorPos - Current cursor position
 * @returns {boolean} - True if cursor is inside \begin{...}, false otherwise
 */
function isCursorInBeginArgument(text, cursorPos) {
  const beforeCursor = text.substring(0, cursorPos);
  
  // Find the last \begin{ before cursor
  const lastBeginStart = beforeCursor.lastIndexOf('\\begin{');
  if (lastBeginStart === -1) return false;
  
  // Find the closing } after that \begin{
  const afterBegin = text.substring(lastBeginStart);
  const closingBracePos = afterBegin.indexOf('}');
  
  if (closingBracePos === -1) {
    // No closing brace found, cursor is inside incomplete \begin{
    return true;
  }
  
  // Check if cursor is between \begin{ and }
  const absoluteClosingPos = lastBeginStart + closingBracePos;
  return cursorPos > lastBeginStart + 7 && cursorPos <= absoluteClosingPos; // 7 = length of "\begin{"
}

function handleInput(event, isDeleting) {
  const text = event.target.textContent;
  const cursorPos = getCursorPosition(event.target);
  
  // Autocomplete only if not deleting
  if (!isDeleting) {
    // Check if user is typing a LaTeX command
    const match = text.substring(0, cursorPos).match(/\\[\w]*$/);
    
    if (match) {
      const partial = match[0];
      autocompleteIfUnique(event.target, partial, cursorPos);
    }
  }
  
  // Synchronize \begin{} and \end{} arguments only if cursor is inside \begin{...}
  if (isCursorInBeginArgument(text, cursorPos)) {
    syncBeginEndArguments(event.target);
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
    
    // Special handling for \begin: add \end{} if needed
    if (completion === '\\begin') {
      addEndIfNeeded(element);
    }
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
