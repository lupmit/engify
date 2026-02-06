"use strict";

const WORKER_URL = "https://engify.lupmit.workers.dev";

const MAX_RETRY_ATTEMPTS = 2;
const INITIAL_RETRY_DELAY_MS = 1000;

function shouldRetry(status, errorMessage) {
  if (status === 429) return true;
  if (status >= 400 && status < 500) return false;
  if (status >= 500) return true;

  if (
    errorMessage.includes("Failed to fetch") ||
    errorMessage.includes("NetworkError")
  ) {
    return true;
  }

  return false;
}

function sendStatusUpdate(tabId, status) {
  chrome.tabs
    .sendMessage(tabId, { action: "updateStatus", status })
    .catch((e) => console.log("Error sending retry status message:", e));
}

async function callGeminiAPI(text, tabId, context, mode) {
  let lastError;
  let delay = INITIAL_RETRY_DELAY_MS;

  for (let attempt = 0; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      const body = { text };
      if (context) body.context = context;
      if (mode) body.mode = mode;

      const response = await fetch(WORKER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        const error = new Error(
          data.error || `HTTP error! status: ${response.status}`,
        );
        error.status = response.status;
        throw error;
      }

      if (data.success && data.enhancedText) {
        return data.enhancedText;
      }

      throw new Error(data.error || "Unexpected response format");
    } catch (error) {
      lastError = error;
      console.log(
        `API call failed on attempt ${attempt} of ${MAX_RETRY_ATTEMPTS}:`,
        error.message,
      );

      if (error.message.includes("blocked")) {
        break;
      }

      if (!shouldRetry(error.status, error.message)) {
        console.log("Error not retryable, stopping attempts");
        break;
      }

      if (attempt < MAX_RETRY_ATTEMPTS) {
        const statusMessage = `Retrying (${attempt + 1}/${MAX_RETRY_ATTEMPTS})...`;
        console.log(`Retrying in ${delay / 1000} seconds...`);

        if (tabId) {
          sendStatusUpdate(tabId, statusMessage);
        }

        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
      }
    }
  }

  console.log(`Error calling API after ${MAX_RETRY_ATTEMPTS} attempts.`);
  throw lastError;
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "aiTextEnhancer",
    title: "Enhance with AI",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "aiTextEnhancer" && info.selectionText) {
    chrome.tabs.sendMessage(tab.id, {
      action: "enhanceText",
      selectedText: info.selectionText,
    });
  }
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command === "fix-english") {
    try {
      await chrome.tabs.sendMessage(tab.id, { action: "enhanceText" });
    } catch (error) {
      console.log("Error sending message to tab:", error);
    }
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "callGeminiAPI") {
    callGeminiAPI(
      request.textToEnhance,
      sender.tab?.id,
      request.threadContext,
      request.mode,
    )
      .then((enhancedText) => sendResponse({ success: true, enhancedText }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }
});
