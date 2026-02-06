const API_KEYS = [];

const MODELS = [
  { name: "gemma-3-27b-it", label: "Gemma 3 27B" },
  { name: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
];

const MAX_TEXT_LENGTH = 5000;
const MIN_TEXT_LENGTH = 2;

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

function getNextApiKey() {
  const index = Date.now() % API_KEYS.length;
  return API_KEYS[index];
}

function isAllowedOrigin(origin) {
  return origin && origin.startsWith("chrome-extension://");
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

async function handleRequest(request) {
  const origin = request.headers.get("Origin");

  if (!isAllowedOrigin(origin)) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: corsHeaders(origin),
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

    if (
      !text ||
      typeof text !== "string" ||
      text.trim().length < MIN_TEXT_LENGTH
    ) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid text" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(origin),
          },
        },
      );
    }

    if (text.length > MAX_TEXT_LENGTH) {
      return new Response(
        JSON.stringify({
          error: `Text too long. Maximum ${MAX_TEXT_LENGTH} characters.`,
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(origin),
          },
        },
      );
    }

    const fullPrompt = `${SYSTEM_PROMPT}\n\n---TEXT TO PROCESS---\n${text}\n---END---`;
    const apiKey = getNextApiKey();
    let lastError = null;

    for (const model of MODELS) {
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model.name}:generateContent?key=${apiKey}`;

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: fullPrompt }] }],
        }),
      });

      if (response.status === 429) {
        lastError = `${model.label} rate limited`;
        continue;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage =
          errorData.error?.message || `HTTP error! status: ${response.status}`;
        return new Response(JSON.stringify({ error: errorMessage }), {
          status: response.status,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(origin),
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
              ...corsHeaders(origin),
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
              ...corsHeaders(origin),
            },
          },
        );
      }

      lastError = `${model.label}: Unexpected response format`;
      continue;
    }

    return new Response(
      JSON.stringify({ error: lastError || "All models failed" }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(origin),
        },
      },
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(origin),
      },
    });
  }
}

export default {
  fetch: handleRequest,
};
