let popupIcon = null;
let lastValidSelection = null;
let isApiCallInProgress = false;

function createPopupIcon() {
  if (document.getElementById("ai-text-improver-icon")) {
    return;
  }

  popupIcon = document.createElement("div");
  popupIcon.id = "ai-text-improver-icon";
  popupIcon.style.cssText = `
    position: absolute;
    background-color: white;
    color: #202124; 
    border: 1px solid #dadce0; 
    border-radius: 10px; 
    padding: 6px 12px;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-weight: 500;
    cursor: pointer;
    z-index: 2147483647;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    user-select: none;
    transition: opacity 0.1s ease-in-out, transform 0.1s ease-in-out;
    opacity: 0;
    transform: scale(0.95);
    pointer-events: none;
  `;
  popupIcon.innerHTML = `
    <img src="${chrome.runtime.getURL(
      "icons/icon16.png"
    )}" alt="Engify icon" style="width: 16px; height: 16px;"/>
    <span>Fix me!</span>
  `;
  document.body.appendChild(popupIcon);

  popupIcon.addEventListener("mousedown", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!lastValidSelection || isApiCallInProgress) return;
    isApiCallInProgress = true;
    const textSpan = popupIcon.querySelector("span");
    if (textSpan) {
      textSpan.textContent = "Fixing...";
    }
    try {
      const response = await chrome.runtime.sendMessage({
        action: "callGeminiAPI",
        textToEnhance: lastValidSelection.text,
      });
      if (typeof response === "undefined") {
        if (textSpan) {
          textSpan.textContent = "Update required. Please reload the page.";
        }
        console.log(
          "The extension has been updated. Please reload this page to continue using it."
        );
        setTimeout(hidePopup, 3000);
        return;
      }
      if (response.success) {
        replaceSelectedText(response.enhancedText);
        hidePopup();
      } else {
        if (textSpan) {
          textSpan.textContent = "Failed. Please try again.";
        }
        console.log("API Error:", response.error || "Unknown error");
        setTimeout(hidePopup, 3000);
      }
    } catch (e) {
      if (textSpan) {
        textSpan.textContent = "Failed. Please try again.";
      }
      if (e.message.includes("Extension context invalidated")) {
        console.log(
          "The extension has been updated. Please reload this page to continue using it."
        );
      } else {
        console.log("An unexpected error occurred:", e.message);
      }
      setTimeout(hidePopup, 3000);
    } finally {
      isApiCallInProgress = false;
    }
  });
}

function showPopup(range) {
  if (!popupIcon) createPopupIcon();

  const rect = range.getBoundingClientRect();
  popupIcon.style.visibility = "hidden";
  popupIcon.style.display = "flex";
  const iconRect = popupIcon.getBoundingClientRect();
  popupIcon.style.visibility = "visible";
  popupIcon.style.display = "none";

  // const isDarkMode =
  //   window.matchMedia &&
  //   window.matchMedia("(prefers-color-scheme: dark)").matches;
  // if (isDarkMode) {
  //   popupIcon.style.backgroundColor = "#2d2d2d";
  //   popupIcon.style.color = "#e8eaed";
  //   popupIcon.style.border = "1px solid #404040";
  // } else {
  //   popupIcon.style.backgroundColor = "white";
  //   popupIcon.style.color = "#202124";
  //   popupIcon.style.border = "1px solid #dadce0";
  // }
  popupIcon.style.backgroundColor = "white";
  popupIcon.style.color = "#202124";
  popupIcon.style.border = "1px solid #dadce0";

  let topPosition;
  const spaceAbove = rect.top;
  if (spaceAbove < iconRect.height + 15) {
    topPosition = window.scrollY + rect.bottom + 10;
  } else {
    topPosition = window.scrollY + rect.top - iconRect.height - 10;
  }
  const leftPosition = window.scrollX + rect.left;

  popupIcon.style.top = `${topPosition}px`;
  popupIcon.style.left = `${leftPosition}px`;
  popupIcon.style.display = "flex";
  popupIcon.style.opacity = "1";
  popupIcon.style.transform = "scale(1)";
  popupIcon.style.pointerEvents = "auto";

  const textSpan = popupIcon.querySelector("span");
  if (textSpan) {
    textSpan.textContent = "Fix me!";
  }
}

function hidePopup() {
  if (popupIcon) {
    popupIcon.style.opacity = "0";
    popupIcon.style.transform = "scale(0.9)";
    popupIcon.style.pointerEvents = "none";
  }
}

/**
 * Replaces the content of a given Range with new text.
 * @param {string} newText The new text to insert.
 * @param {Range} range The range to replace.
 */
function replaceSelectedText(newText) {
  if (!lastValidSelection || !lastValidSelection.element) {
    console.log("No valid selection to replace.");
    return;
  }

  const el = lastValidSelection.element;
  el.focus();

  if (
    lastValidSelection.start !== null &&
    lastValidSelection.end !== null &&
    (el.tagName === "INPUT" || el.tagName === "TEXTAREA")
  ) {
    el.setSelectionRange(lastValidSelection.start, lastValidSelection.end);
    if (typeof el.setRangeText === "function") {
      el.setRangeText(newText);
    } else {
      el.value =
        el.value.substring(0, lastValidSelection.start) +
        newText +
        el.value.substring(lastValidSelection.end);
      el.selectionStart = lastValidSelection.start;
      el.selectionEnd = lastValidSelection.start + newText.length;
    }
    el.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
  } else if (lastValidSelection.range) {
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(lastValidSelection.range);
    document.execCommand("insertText", false, newText);
  }
}

function checkSelection(event) {
  if (isApiCallInProgress) {
    return;
  }
  if (popupIcon && popupIcon.contains(event.target)) {
    return;
  }

  setTimeout(() => {
    const activeEl = document.activeElement;
    let selectionText = "";
    let range = null;
    let element = null;
    let start = null;
    let end = null;
    let positionRef = null;

    if (
      activeEl &&
      (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA") &&
      typeof activeEl.selectionStart === "number"
    ) {
      const excludedInputTypes = ["email", "password", "number"];
      if (
        activeEl.tagName === "INPUT" &&
        excludedInputTypes.includes(activeEl.type.toLowerCase())
      ) {
        // Do nothing for excluded input types
      } else if (activeEl.selectionStart !== activeEl.selectionEnd) {
        selectionText = activeEl.value.substring(
          activeEl.selectionStart,
          activeEl.selectionEnd
        );
        element = activeEl;
        start = activeEl.selectionStart;
        end = activeEl.selectionEnd;
        positionRef = element;
      }
    } else {
      const selection = window.getSelection();
      if (
        selection &&
        !selection.isCollapsed &&
        selection.toString().trim().length > 0
      ) {
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
      lastValidSelection = {
        range: range,
        text: selectionText,
        element: element,
        start: start,
        end: end,
      };
      showPopup(positionRef);
    } else {
      hidePopup();
    }
  }, 10);
}

document.addEventListener("mouseup", checkSelection);
document.addEventListener("keyup", checkSelection);

document.addEventListener("mousedown", (event) => {
  if (isApiCallInProgress) {
    return;
  }
  if (popupIcon && !popupIcon.contains(event.target)) {
    hidePopup();
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "enhanceText") {
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) {
      const range = selection.getRangeAt(0);
      const text = selection.toString();
      chrome.runtime.sendMessage(
        { action: "callGeminiAPI", textToEnhance: text },
        (response) => {
          // This callback handles the final response from the background script
          if (chrome.runtime.lastError) {
            console.log(
              "Error sending message:",
              chrome.runtime.lastError.message
            );
            return;
          }
          if (response && response.success) {
            replaceSelectedText(response.enhancedText);
          } else {
            console.log("API Error:", response.error || "Unknown error");
          }
          hidePopup();
        }
      );
    }
    sendResponse(true);
  } else if (request.action === "updateStatus") {
    const textSpan = popupIcon.querySelector("span");
    if (textSpan) {
      textSpan.textContent = request.status;
    }
  }
  return true;
});
