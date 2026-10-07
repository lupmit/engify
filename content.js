"use strict";

const SELECTION_CHECK_DELAY_MS = 50;
const ERROR_DISPLAY_DURATION_MS = 3000;
const POPUP_ANIMATION_DURATION_MS = 100;
const EXCLUDED_INPUT_TYPES = ["email", "password", "number"];

let popupIcon = null;
let lastValidSelection = null;
let isApiCallInProgress = false;
let selectionCheckTimeout = null;

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
    border-radius: 9999px;
    padding: 0;
    border: 0;
    background: var(--engify-toolbar-surface);
    box-shadow: var(--engify-toolbar-outline);
    display: none;
    font-family: "Engify Inter", ui-sans-serif, system-ui, sans-serif;
    line-height: 20px;
    -webkit-font-smoothing: antialiased;
    z-index: 2147483647;
    user-select: none;
    transition: opacity ${POPUP_ANIMATION_DURATION_MS}ms ease-in-out,
        transform ${POPUP_ANIMATION_DURATION_MS}ms ease-in-out;
    opacity: 0;
    transform: scale(0.95);
    pointer-events: none;
  `;

  popupIcon.innerHTML = `
    <div class="engify-toolbar-content">
      <button class="engify-button" type="button">
        <span class="engify-button-background" aria-hidden="true"></span>
        <span class="engify-button-focus-ring" aria-hidden="true"></span>
        <span class="engify-button-content">
          <span class="status-text">Fix me!</span>
          <span class="spinner" aria-hidden="true" style="display: none;">
            <svg viewBox="0 0 20 20" width="100%" height="100%" fill="currentColor">
              <path d="M9.045 2.078q-1.04.135-1.609.33a7.982 7.982 0 1 0 10.236 9.9q.15-.49.256-1.356c.069-.568.55-.997 1.122-.997h.008c.56 0 .995.486.937 1.041q-.113 1.068-.279 1.663c-1.18 4.233-5.064 7.338-9.674 7.338C4.496 19.997 0 15.501 0 9.955 0 5.382 3.058 1.522 7.24.31Q7.868.13 9 .006a.94.94 0 0 1 1.042.933v.008c0 .574-.428 1.058-.997 1.131" />
            </svg>
          </span>
        </span>
        <span class="engify-button-overlay" aria-hidden="true"></span>
      </button>
    </div>
  `;

  const style = document.createElement("style");
  style.textContent = `
    @font-face {
      font-family: "Engify Inter";
      font-style: normal;
      font-weight: 600;
      font-display: swap;
      src: url("https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuGKYMZg.ttf") format("truetype");
    }
    #ai-text-improver-icon,
    #ai-text-improver-icon * { box-sizing: border-box; }
    /* Solid toolbar with Cladd inset outlines and transparent xs buttons. */
    #ai-text-improver-icon {
      --engify-toolbar-surface: #2d2d2d;
      --engify-toolbar-outline: inset 1px 1px 0 0 color-mix(in oklab, white 8%, transparent),
        inset -1px -1px 0 0 color-mix(in oklab, white 7%, transparent);
      --engify-button-surface: color-mix(in oklab, white 6%, var(--engify-toolbar-surface) 100%);
      --engify-hover: color-mix(in oklab, white 5%, transparent);
      --engify-pressed: color-mix(in oklab, white 3%, transparent);
      --engify-primary: oklch(from #388aff 0.95 0.18 h);
      color: oklch(0.9 0 0);
      color-scheme: dark;
    }
    #ai-text-improver-icon[data-theme="light"] {
      --engify-toolbar-surface: #f5f5f5;
      --engify-toolbar-outline: inset 0 0 0 1px oklch(0.89 0 0),
        inset 1.5px 1.5px 0 0 color-mix(in oklab, white 60%, transparent);
      --engify-button-surface: color-mix(in oklab, black 4%, var(--engify-toolbar-surface) 100%);
      --engify-hover: color-mix(in oklab, black 3%, transparent);
      --engify-pressed: color-mix(in oklab, white 6%, transparent);
      --engify-primary: oklch(from #388aff 0.5 0.18 h);
      color: oklch(0.32 0 0);
      color-scheme: light;
    }
    #ai-text-improver-icon .engify-button-background,
    #ai-text-improver-icon .engify-button-overlay {
      position: absolute;
      inset: 0;
      border-radius: inherit;
      pointer-events: none;
    }
    #ai-text-improver-icon .engify-toolbar-content {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 4px;
    }
    #ai-text-improver-icon .engify-button {
      all: unset;
      box-sizing: border-box;
      position: relative;
      display: inline-block;
      height: 16px;
      border-radius: 9999px;
      appearance: none;
      font: inherit;
      font-size: 12px;
      line-height: 16px;
      font-weight: 600;
      text-align: left;
      cursor: auto;
      user-select: none;
      -webkit-tap-highlight-color: transparent;
    }
    #ai-text-improver-icon .engify-button-background {
      transition: background-color 200ms;
    }
    #ai-text-improver-icon .engify-button-content {
      box-sizing: border-box;
      position: relative;
      display: flex;
      width: 100%;
      height: 100%;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 0 10px;
      white-space: nowrap;
      transition: transform 200ms, opacity 200ms;
    }
    #ai-text-improver-icon .engify-button-overlay {
      opacity: 0;
      transition: opacity 200ms, background-color 200ms;
    }
    #ai-text-improver-icon .engify-button-focus-ring {
      position: absolute;
      z-index: 1;
      inset: -6px;
      border: 2px solid var(--engify-primary);
      border-radius: inherit;
      opacity: 0;
      transform: scale(0.95);
      pointer-events: none;
      transition: transform 200ms, opacity 200ms;
    }
    #ai-text-improver-icon .engify-button:focus-visible > .engify-button-focus-ring {
      opacity: 1;
      transform: scale(1);
    }
    @media (hover: hover) {
      #ai-text-improver-icon .engify-button:hover:not(:active) > .engify-button-background {
        background: var(--engify-button-surface);
      }
      #ai-text-improver-icon .engify-button:hover:not(:active) > .engify-button-overlay {
        background: var(--engify-hover);
        opacity: 1;
      }
    }
    #ai-text-improver-icon .engify-button:active > .engify-button-background {
      background: var(--engify-button-surface);
    }
    #ai-text-improver-icon .engify-button:active > .engify-button-overlay {
      background: var(--engify-pressed);
      opacity: 1;
    }
    #ai-text-improver-icon .engify-button:active > .engify-button-content {
      transform: scale(0.95);
      opacity: 0.75;
    }
    #ai-text-improver-icon .spinner {
      position: relative;
      flex-shrink: 0;
      width: 12px;
      height: 12px;
      color: var(--engify-primary);
      pointer-events: none;
      transition: opacity 200ms, scale 200ms;
      opacity: 1;
      scale: 1;
    }
    #ai-text-improver-icon .spinner svg {
      display: block;
      animation: engify-spin 1.5s infinite linear;
    }
    @starting-style {
      #ai-text-improver-icon .spinner { opacity: 0; scale: 0; }
    }
    @keyframes engify-spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    @media (prefers-reduced-motion: reduce) {
      #ai-text-improver-icon,
      #ai-text-improver-icon * {
        transition: none !important;
      }
      #ai-text-improver-icon .spinner svg { animation: none; }
    }
  `;
  document.head.appendChild(style);
  document.body.appendChild(popupIcon);

  popupIcon.addEventListener("mousedown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    performTextEnhancement();
  });
  popupIcon.querySelector(".engify-button").addEventListener("click", (event) => {
    if (event.detail === 0) {
      event.preventDefault();
      event.stopPropagation();
      performTextEnhancement();
    }
  });

  return popupIcon;
}

function setPopupLoading(icon, loading) {
  if (!icon) {
    return;
  }
  icon.querySelector(".engify-button").setAttribute("aria-busy", String(loading));
  const spinner = icon.querySelector(".spinner");
  if (spinner) {
    spinner.style.display = loading ? "inline-block" : "none";
  }
}

function updatePopupStatus(message, showSpinner = true) {
  const icon = createPopupIcon();
  if (!icon) {
    return;
  }

  const textSpan = icon.querySelector(".status-text");
  if (textSpan) {
    textSpan.textContent = message;
  }
  setPopupLoading(icon, showSpinner);
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
  const themeRoot = lastValidSelection.element.closest(
    ".dark, .light, [data-theme='dark'], [data-theme='light']",
  );
  if (themeRoot) {
    icon.dataset.theme =
      themeRoot.classList.contains("dark") || themeRoot.dataset.theme === "dark"
        ? "dark"
        : "light";
  } else {
    let element = lastValidSelection.element;
    let background = "";
    while (element) {
      background = window.getComputedStyle(element).backgroundColor;
      if (background !== "transparent" && background !== "rgba(0, 0, 0, 0)") {
        break;
      }
      element = element.parentElement;
    }
    const dark = element
      ? isColorDark(background)
      : window.matchMedia("(prefers-color-scheme: dark)").matches;
    icon.dataset.theme = dark ? "dark" : "light";
  }

  icon.style.visibility = "hidden";
  icon.style.display = "flex";
  const iconRect = icon.getBoundingClientRect();
  icon.style.visibility = "visible";
  icon.style.display = "none";

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

  const textSpan = icon.querySelector(".status-text");
  if (textSpan) {
    textSpan.textContent = "Fix me!";
  }
  setPopupLoading(icon, false);
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
  if (
    !lastValidSelection ||
    lastValidSelection.element.readOnly ||
    lastValidSelection.element.disabled ||
    isApiCallInProgress
  ) {
    return;
  }

  clearTimeout(selectionCheckTimeout);
  isApiCallInProgress = true;
  const icon = createPopupIcon();
  updatePopupStatus("Fixing");

  try {
    const response = await chrome.runtime.sendMessage({
      action: "callGeminiAPI",
      textToEnhance: lastValidSelection.text,
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
    setPopupLoading(icon, false);
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
        !activeElement.readOnly &&
        !activeElement.disabled &&
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
          if (temp.getAttribute("contenteditable") === "false") {
            break;
          }
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
