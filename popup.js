document.addEventListener("DOMContentLoaded", () => {
  const geminiApiKeyInput = document.getElementById("geminiApiKey");
  const saveButton = document.getElementById("saveButton");
  const statusDiv = document.getElementById("status");

  chrome.storage.sync.get(["geminiApiKey"], (result) => {
    geminiApiKeyInput.value = result.geminiApiKey || "";
  });

  saveButton.addEventListener("click", () => {
    const geminiApiKey = geminiApiKeyInput.value;
    chrome.storage.sync.set({ geminiApiKey }, () => {
      statusDiv.textContent = "Settings saved!";
      saveButton.disabled = true;
      setTimeout(() => {
        statusDiv.textContent = "";
        saveButton.disabled = false;
      }, 2000);
    });
  });

  const inputs = [geminiApiKeyInput];
  inputs.forEach((input) => {
    input.addEventListener("input", () => {
      saveButton.disabled = false;
      statusDiv.textContent = "";
    });
  });
});