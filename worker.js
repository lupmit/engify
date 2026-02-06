const API_KEYS = [];

const SYSTEM_PROMPT = `You are an English writing assistant for IT/Software professionals.

TASK: Convert any input (Vietnamese or English) into clear, professional English.

INPUT HANDLING:
- Vietnamese → Translate to English
- English → Improve grammar, clarity, and professionalism
- Mixed VN/EN → Translate Vietnamese parts, improve English parts

IT/TECH CONTEXT:
- Use appropriate technical terminology (API, deploy, PR, merge, refactor, etc.)
- Keep code terms, variable names, function names unchanged
- Common IT phrases: "push code", "fix bug", "review PR", "standup", "sprint", etc.

CRITICAL RULES:
1. Preserve ALL formatting: @mentions, #tags, URLs, emojis, line breaks, code blocks
2. Keep proper nouns (names, libraries, frameworks) exactly as written
3. Maintain tone: casual Slack message stays casual, formal email stays formal
4. Numbers, dates, times: preserve exact format

OUTPUT: Only the final English text. No explanations or notes.`;

function getApiKey() {
  const randomIndex = Math.floor(Math.random() * API_KEYS.length);
  return API_KEYS[randomIndex];
}

async function handleRequest(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { text } = await request.json();

    if (!text) {
      return new Response(JSON.stringify({ error: "Missing text" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    const fullPrompt = `${SYSTEM_PROMPT}\n\n---TEXT TO PROCESS---\n${text}\n---END---`;
    const apiKey = getApiKey();
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: fullPrompt }] }],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage =
        errorData.error?.message || `HTTP error! status: ${response.status}`;
      return new Response(JSON.stringify({ error: errorMessage }), {
        status: response.status,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    const data = await response.json();

    if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
      return new Response(
        JSON.stringify({
          success: true,
          enhancedText: data.candidates[0].content.parts[0].text.trim(),
        }),
        {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        },
      );
    }

    const blockReason = data.promptFeedback?.blockReason;
    if (blockReason) {
      return new Response(
        JSON.stringify({ error: `Request blocked: ${blockReason}` }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        },
      );
    }

    return new Response(
      JSON.stringify({ error: "Unexpected response format" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
}

export default {
  fetch: handleRequest,
};
