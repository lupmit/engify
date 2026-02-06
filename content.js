"use strict";

const SELECTION_CHECK_DELAY_MS = 50;
const ERROR_DISPLAY_DURATION_MS = 3000;
const POPUP_ANIMATION_DURATION_MS = 100;
const EXCLUDED_INPUT_TYPES = ["email", "password", "number"];
const MAX_CONTEXT_MESSAGES = 20;
const MAX_CONTEXT_LENGTH = 4000;

// Command definitions - add new commands here
const COMMANDS = [
  {
    prefix: "/sum",
    mode: "summarize",
    label: "Summary",
    processingLabel: "Summarizing",
    requiresContext: true,
  },
  // Add more commands here in the future
  // Example:
  // {
  //   prefix: "/translate",
  //   mode: "translate",
  //   label: "Translate",
  //   processingLabel: "Translating",
  //   requiresContext: false,
  // },
];

// Default command (no prefix)
const DEFAULT_COMMAND = {
  prefix: null,
  mode: "enhance",
  label: "Fix me!",
  processingLabel: "Fixing",
  requiresContext: false,
};

let popupIcon = null;
let lastValidSelection = null;
let isApiCallInProgress = false;
let selectionCheckTimeout = null;

function detectCommand(text) {
  if (!text || typeof text !== "string") {
    return DEFAULT_COMMAND;
  }

  const trimmedText = text.trim();

  // Check each command prefix
  for (const command of COMMANDS) {
    if (trimmedText.startsWith(command.prefix)) {
      return command;
    }
  }

  // Return default if no command prefix found
  return DEFAULT_COMMAND;
}

function getThreadContext(element) {
  let container = element?.parentElement;
  const maxDepth = 15;
  let bestMessages = null;
  const inputRect = element?.getBoundingClientRect();

  for (let depth = 0; container && depth < maxDepth; depth++) {
    const seen = new Set();
    const texts = [];

    // Check if this looks like a thread boundary
    const isThreadContainer =
      container.hasAttribute("data-thread-id") ||
      container.hasAttribute("data-conversation-id") ||
      /thread|conversation|discussion/i.test(container.className || "") ||
      /thread|conversation|discussion/i.test(
        container.getAttribute("data-qa") || "",
      ) ||
      (container.getAttribute("role") === "article" &&
        /thread|conversation|message/i.test(
          container.getAttribute("aria-label") || "",
        ));

    const candidates = container.querySelectorAll(
      "[role='listitem'], [role='article'], [role='comment'], " +
        "[data-qa*='message'], [data-testid*='message'], [data-testid*='comment'], " +
        "[data-testid*='note'], [aria-label*='message'], [aria-label*='comment']",
    );

    if (candidates.length >= 2) {
      candidates.forEach((el) => {
        if (element && el.contains(element)) return;
        const elRect = el.getBoundingClientRect();
        if (inputRect && elRect.bottom > inputRect.top) return;
        const text = el.innerText?.trim();
        if (text && text.length > 3 && text.length < 2000 && !seen.has(text)) {
          seen.add(text);
          texts.push(text);
        }
      });
    }

    if (texts.length < 2) {
      const children = Array.from(container.children);
      if (children.length >= 3) {
        const tagCounts = {};
        children.forEach((c) => {
          const key =
            c.tagName + (c.className ? "." + c.className.split(" ")[0] : "");
          tagCounts[key] = (tagCounts[key] || 0) + 1;
        });

        const dominantTag = Object.entries(tagCounts).sort(
          (a, b) => b[1] - a[1],
        )[0];

        if (dominantTag && dominantTag[1] >= 3) {
          children.forEach((child) => {
            if (element && child.contains(element)) return;
            const childRect = child.getBoundingClientRect();
            if (inputRect && childRect.bottom > inputRect.top) return;
            const text = child.innerText?.trim();
            if (
              text &&
              text.length > 3 &&
              text.length < 2000 &&
              !seen.has(text)
            ) {
              seen.add(text);
              texts.push(text);
            }
          });
        }
      }
    }

    if (texts.length >= 2) {
      bestMessages = texts.slice(-MAX_CONTEXT_MESSAGES);
      // If we found messages and this is a thread container, stop here
      if (isThreadContainer || bestMessages.length >= MAX_CONTEXT_MESSAGES) {
        console.log(`[Engify] Thread boundary detected at depth ${depth}`);
        break;
      }
    }

    container = container.parentElement;
  }

  if (bestMessages && bestMessages.length >= 2) {
    console.log(`[Engify] Context found: ${bestMessages.length} messages`);
    bestMessages.forEach((msg, i) =>
      console.log(
        `[Engify] [${i + 1}] ${msg.slice(0, 100)}${msg.length > 100 ? "..." : ""}`,
      ),
    );

    let context = bestMessages.join("\n---\n");
    if (context.length > MAX_CONTEXT_LENGTH) {
      context = context.slice(-MAX_CONTEXT_LENGTH);
      console.log(`[Engify] Context truncated to ${MAX_CONTEXT_LENGTH} chars`);
    }
    return context;
  }

  console.log("[Engify] No thread context found");
  return null;
}

function createPopupIcon() {
  if (popupIcon) {
    return popupIcon;
  }
  if (!document.body) {
    return null;
  }

  popupIcon = document.createElement("div");
  popupIcon.id = "ai-text-improver-icon";
  popupIcon.style.cssText = `
    position: absolute;
    background-color: white;
    color: #202124;
    border: 1px solid #dadce0;
    border-radius: 8px;
    padding: 2px 6px;
    display: none;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
        Helvetica, Arial, sans-serif;
    font-weight: 500;
    cursor: pointer;
    z-index: 2147483647;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    user-select: none;
    transition: opacity ${POPUP_ANIMATION_DURATION_MS}ms ease-in-out,
        transform ${POPUP_ANIMATION_DURATION_MS}ms ease-in-out;
    opacity: 0;
    transform: scale(0.95);
    pointer-events: none;
  `;

  const iconUrl = chrome.runtime.getURL("icons/icon16.png");
  popupIcon.innerHTML = `
    <img src="${iconUrl}" alt="Engify" style="width: 10px; height: 10px;">
    <span class="status-text">Fix me!</span>
    <span class="spinner" style="display: none; width: 10px; height: 10px;
        border: 2px solid #f3f3f3; border-top: 2px solid #3498db;
        border-radius: 50%; animation: spin 0.8s linear infinite;"></span>
  `;

  const style = document.createElement("style");
  style.textContent = `
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
  document.body.appendChild(popupIcon);

  popupIcon.addEventListener("mousedown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    performTextEnhancement();
  });

  return popupIcon;
}

function updatePopupStatus(message, showSpinner = true) {
  const icon = createPopupIcon();
  if (!icon) {
    return;
  }

  const textSpan = icon.querySelector(".status-text");
  const spinner = icon.querySelector(".spinner");

  if (textSpan) {
    textSpan.textContent = message;
  }
  if (spinner) {
    spinner.style.display = showSpinner ? "inline-block" : "none";
  }
}

function isColorDark(color) {
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) {
    return false;
  }

  const r = parseInt(match[1], 10);
  const g = parseInt(match[2], 10);
  const b = parseInt(match[3], 10);

  return r * 0.299 + g * 0.587 + b * 0.114 < 186;
}

function showPopup(positionRef) {
  const icon = createPopupIcon();
  if (!icon) {
    return;
  }

  const rect = positionRef.getBoundingClientRect();

  icon.style.visibility = "hidden";
  icon.style.display = "flex";
  const iconRect = icon.getBoundingClientRect();
  icon.style.visibility = "visible";
  icon.style.display = "none";

  const computedStyle = window.getComputedStyle(lastValidSelection.element);
  const backgroundColor = computedStyle.backgroundColor;

  if (isColorDark(backgroundColor)) {
    icon.style.backgroundColor = "#2d2d2d";
    icon.style.color = "#e8eaed";
    icon.style.border = "1px solid #555";
  } else {
    icon.style.backgroundColor = "white";
    icon.style.color = "#202124";
    icon.style.border = "1px solid #dadce0";
  }

  const spaceAbove = rect.top;
  let topPosition;
  if (spaceAbove < iconRect.height + 10) {
    topPosition = window.scrollY + rect.bottom + 5;
  } else {
    topPosition = window.scrollY + rect.top - iconRect.height - 5;
  }
  const leftPosition = window.scrollX + rect.left;

  icon.style.top = `${topPosition}px`;
  icon.style.left = `${leftPosition}px`;
  icon.style.display = "flex";
  icon.style.opacity = "1";
  icon.style.transform = "scale(1)";
  icon.style.pointerEvents = "auto";

  const command = detectCommand(lastValidSelection.text);

  const textSpan = icon.querySelector(".status-text");
  if (textSpan) {
    textSpan.textContent = command.label;
  }
  const spinner = icon.querySelector(".spinner");
  if (spinner) {
    spinner.style.display = "none";
  }
}

function hidePopup() {
  if (popupIcon) {
    popupIcon.style.opacity = "0";
    popupIcon.style.transform = "scale(0.9)";
    popupIcon.style.pointerEvents = "none";
  }
}

function dispatchInputEvents(element) {
  element.dispatchEvent(
    new Event("input", { bubbles: true, cancelable: true }),
  );
  element.dispatchEvent(
    new Event("change", { bubbles: true, cancelable: true }),
  );
}

function replaceTextInInput(element, newText, start, end) {
  element.setSelectionRange(start, end);

  if (document.execCommand("insertText", false, newText)) {
    return true;
  }

  element.value =
    element.value.substring(0, start) + newText + element.value.substring(end);
  element.selectionStart = start + newText.length;
  element.selectionEnd = start + newText.length;
  dispatchInputEvents(element);
  return true;
}

function replaceTextInContentEditable(range, element, newText) {
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);

  range.deleteContents();
  const textNode = document.createTextNode(newText);
  range.insertNode(textNode);

  selection.removeAllRanges();
  const newRange = document.createRange();
  newRange.setStartAfter(textNode);
  newRange.collapse(true);
  selection.addRange(newRange);

  element.dispatchEvent(
    new Event("input", { bubbles: true, cancelable: true }),
  );
  return true;
}

function replaceSelectedText(newText) {
  if (!lastValidSelection || !lastValidSelection.element) {
    return;
  }

  const element = lastValidSelection.element;
  element.focus();

  const isInputOrTextarea =
    element.tagName === "INPUT" || element.tagName === "TEXTAREA";
  const hasValidIndices =
    lastValidSelection.start !== null && lastValidSelection.end !== null;

  if (isInputOrTextarea && hasValidIndices) {
    replaceTextInInput(
      element,
      newText,
      lastValidSelection.start,
      lastValidSelection.end,
    );
    return;
  }

  if (lastValidSelection.range) {
    replaceTextInContentEditable(lastValidSelection.range, element, newText);
  }
}

async function performTextEnhancement() {
  if (!lastValidSelection || isApiCallInProgress) {
    return;
  }

  isApiCallInProgress = true;
  const icon = createPopupIcon();
  const textSpan = icon?.querySelector(".status-text");
  const spinner = icon?.querySelector(".spinner");

  const context = getThreadContext(lastValidSelection.element);
  const command = detectCommand(lastValidSelection.text);
  const isCommandMode = command.prefix !== null;

  if (textSpan) {
    textSpan.textContent = command.processingLabel;
  }
  if (spinner) {
    spinner.style.display = "inline-block";
  }

  try {
    if (command.requiresContext && !context) {
      updatePopupStatus("No context found", false);
      setTimeout(hidePopup, ERROR_DISPLAY_DURATION_MS);
      return;
    }

    const response = await chrome.runtime.sendMessage({
      action: "callGeminiAPI",
      textToEnhance: isCommandMode ? "" : lastValidSelection.text,
      mode: command.mode,
      threadContext: context,
    });

    if (response === undefined) {
      updatePopupStatus("Update required. Reload page.", false);
      console.log("Extension updated. Please reload this page.");
      setTimeout(hidePopup, ERROR_DISPLAY_DURATION_MS);
      return;
    }

    if (response.success) {
      replaceSelectedText(response.enhancedText);
      hidePopup();
    } else {
      updatePopupStatus("Failed. Try again.", false);
      console.log("API Error:", response.error || "Unknown error");
      setTimeout(hidePopup, ERROR_DISPLAY_DURATION_MS);
    }
  } catch (error) {
    updatePopupStatus("Error occurred.", false);
    console.log("Error:", error.message);
    setTimeout(hidePopup, ERROR_DISPLAY_DURATION_MS);
  } finally {
    isApiCallInProgress = false;
    if (spinner) {
      spinner.style.display = "none";
    }
  }
}

function checkSelection(event) {
  if (isApiCallInProgress) {
    return;
  }

  const icon = createPopupIcon();
  if (icon && icon.contains(event.target)) {
    return;
  }

  if (selectionCheckTimeout) {
    clearTimeout(selectionCheckTimeout);
  }

  selectionCheckTimeout = setTimeout(() => {
    lastValidSelection = null;

    const activeElement = document.activeElement;
    let selectionText = "";
    let range = null;
    let element = null;
    let start = null;
    let end = null;
    let positionRef = null;

    const isInputOrTextarea =
      activeElement &&
      (activeElement.tagName === "INPUT" ||
        activeElement.tagName === "TEXTAREA") &&
      typeof activeElement.selectionStart === "number";

    if (isInputOrTextarea) {
      const isExcludedType =
        activeElement.tagName === "INPUT" &&
        EXCLUDED_INPUT_TYPES.includes(activeElement.type.toLowerCase());

      if (
        !isExcludedType &&
        activeElement.selectionStart !== activeElement.selectionEnd
      ) {
        selectionText = activeElement.value.substring(
          activeElement.selectionStart,
          activeElement.selectionEnd,
        );
        element = activeElement;
        start = activeElement.selectionStart;
        end = activeElement.selectionEnd;
        positionRef = element;
      }
    } else {
      const selection = window.getSelection();
      const hasSelection =
        selection &&
        !selection.isCollapsed &&
        selection.toString().trim().length > 0;

      if (hasSelection) {
        const potentialRange = selection.getRangeAt(0);
        let container = potentialRange.commonAncestorContainer;
        if (container.nodeType === Node.TEXT_NODE) {
          container = container.parentElement;
        }

        let editableAncestor = null;
        let temp = container;
        while (temp) {
          if (temp.isContentEditable) {
            editableAncestor = temp;
            break;
          }
          temp = temp.parentElement;
        }

        if (editableAncestor) {
          selectionText = selection.toString();
          element = editableAncestor;
          range = potentialRange;
          positionRef = range;
        }
      }
    }

    if (selectionText.trim().length > 0 && element) {
      lastValidSelection = { range, text: selectionText, element, start, end };
      showPopup(positionRef);
    } else {
      hidePopup();
    }
  }, SELECTION_CHECK_DELAY_MS);
}

function addSelectionListeners() {
  document.addEventListener("mouseup", checkSelection);
  document.addEventListener("keyup", checkSelection);
}

function removeSelectionListeners() {
  document.removeEventListener("mouseup", checkSelection);
  document.removeEventListener("keyup", checkSelection);
}

addSelectionListeners();

if (document.body) {
  createPopupIcon();
} else {
  document.addEventListener("DOMContentLoaded", () => createPopupIcon());
}

document.addEventListener("mousedown", (event) => {
  if (isApiCallInProgress) {
    return;
  }
  const icon = createPopupIcon();
  if (icon && !icon.contains(event.target)) {
    hidePopup();
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    removeSelectionListeners();
  } else {
    addSelectionListeners();
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "enhanceText") {
    if (lastValidSelection) {
      performTextEnhancement();
    }
    sendResponse(true);
  } else if (request.action === "updateStatus") {
    updatePopupStatus(request.status, true);
  }
  return true;
});
