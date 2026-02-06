const GOOGLE_API_KEYS = [];
const GROQ_API_KEYS = [];

const PROVIDERS = [
  {
    provider: "groq",
    model: "llama-3.3-70b-versatile",
    label: "Groq Llama 3.3 70B",
  },
  {
    provider: "google",
    model: "gemini-2.5-flash-lite",
    label: "Gemini 2.5 Flash Lite",
  },
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

function getNextKey(keys) {
  const index = Date.now() % keys.length;
  return keys[index];
}

async function callGoogle(model, apiKey, prompt) {
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    }),
  });
  return {
    response,
    extractText: (data) =>
      data.candidates?.[0]?.content?.parts?.[0]?.text?.trim(),
    extractBlock: (data) => data.promptFeedback?.blockReason,
  };
}

async function callGroq(model, apiKey, prompt) {
  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
      }),
    },
  );
  return {
    response,
    extractText: (data) => data.choices?.[0]?.message?.content?.trim(),
    extractBlock: () => null,
  };
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

    const userPrompt = `---TEXT TO PROCESS---\n${text}\n---END---`;
    const googlePrompt = `${SYSTEM_PROMPT}\n\n${userPrompt}`;
    let lastError = null;

    for (const { provider, model, label } of PROVIDERS) {
      try {
        let result;
        if (provider === "google") {
          const apiKey = getNextKey(GOOGLE_API_KEYS);
          result = await callGoogle(model, apiKey, googlePrompt);
        } else if (provider === "groq") {
          const apiKey = getNextKey(GROQ_API_KEYS);
          result = await callGroq(model, apiKey, userPrompt);
        }

        const { response, extractText, extractBlock } = result;

        if (response.status === 429) {
          lastError = `${label} rate limited`;
          continue;
        }

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errorMessage =
            errorData.error?.message ||
            `HTTP error! status: ${response.status}`;
          lastError = `${label}: ${errorMessage}`;
          continue;
        }

        const data = await response.json();
        const enhancedText = extractText(data);

        if (enhancedText) {
          return new Response(JSON.stringify({ success: true, enhancedText }), {
            headers: {
              "Content-Type": "application/json",
              ...corsHeaders(origin),
            },
          });
        }

        const blockReason = extractBlock(data);
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

        lastError = `${label}: Unexpected response format`;
      } catch (e) {
        lastError = `${label}: ${e.message}`;
        continue;
      }
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
