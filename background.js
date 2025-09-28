// Don't worry about it. it's free for everyone
const DEFAULT_KEY = "AIzaSyCedhKl0Tbcg3qb1_WoQRDPFpH5K82BNVE";

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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "callGeminiAPI") {
    callGeminiAPI(request.textToEnhance, sender.tab?.id)
      .then((enhancedText) => sendResponse({ success: true, enhancedText }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

async function callGeminiAPI(text, tabId) {
  const { geminiApiKey } = await chrome.storage.sync.get(["geminiApiKey"]);

  let apiKey = geminiApiKey;
  if (!geminiApiKey) {
    apiKey = DEFAULT_KEY;
  }

  const defaultSystemPrompt = `
    Correct the sentence into simple, clear English. 
    Keep all tags, mentions, names, and acronyms exactly. 
    If meaningless, return as is. 
    Return only the corrected sentence.
  `;
  const finalSystemPrompt = defaultSystemPrompt;

  const fullPrompt = `${finalSystemPrompt}\n\n${text}`;

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;

  let lastError;
  const maxAttempts = 5;
  let delay = 1000;

  for (let attempt = 0; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: fullPrompt }],
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage =
          errorData.error?.message || `HTTP error! status: ${response.status}`;
        throw new Error(errorMessage);
      }

      const data = await response.json();

      if (
        data.candidates &&
        data.candidates.length > 0 &&
        data.candidates[0].content.parts &&
        data.candidates[0].content.parts.length > 0
      ) {
        return data.candidates[0].content.parts[0].text.trim();
      } else {
        const blockReason = data.promptFeedback?.blockReason;
        if (blockReason) {
          throw new Error(
            `Request was blocked by the API. Reason: ${blockReason}`
          );
        }
        throw new Error(
          "Received an unexpected response format from the Gemini API."
        );
      }
    } catch (error) {
      lastError = error;
      console.log(
        `Gemini API call failed on attempt ${attempt} of ${maxAttempts}:`,
        error.message
      );

      if (error.message.includes("blocked by the API")) {
        break;
      }

      if (attempt < maxAttempts) {
        const nextAttempt = attempt + 1;
        const statusMessage = `Retrying (${nextAttempt}/${maxAttempts})...`;
        console.log(`Retrying in ${delay / 1000} seconds...`);

        if (tabId) {
          chrome.tabs
            .sendMessage(tabId, {
              action: "updateStatus",
              status: statusMessage,
            })
            .catch((e) =>
              console.log("Error sending retry status message:", e)
            );
        }

        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
      }
    }
  }

  console.log(`Error calling Gemini API after ${maxAttempts} attempts.`);
  throw lastError;
}
