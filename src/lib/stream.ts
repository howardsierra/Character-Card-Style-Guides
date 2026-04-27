import { GoogleGenAI } from "@google/genai";
import { AIProvider, ApiKeys } from "./api";

async function readSseStream(response: Response, onChunk: (text: string) => void, provider: AIProvider) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    
    let boundary = buffer.indexOf("\n");
    while (boundary !== -1) {
      const line = buffer.slice(0, boundary).trim();
      buffer = buffer.slice(boundary + 1);
      boundary = buffer.indexOf("\n");

      if (!line || !line.startsWith("data: ")) continue;
      
      const dataStr = line.slice(6);
      if (dataStr === "[DONE]") continue;

      try {
        const data = JSON.parse(dataStr);
        if (provider === "anthropic") {
          if (data.type === "content_block_delta" && data.delta?.text) {
            onChunk(data.delta.text);
          }
        } else {
          // openai, openrouter
          if (data.choices && data.choices[0]?.delta?.content) {
            onChunk(data.choices[0].delta.content);
          }
        }
      } catch (e) {
        // ignore parse error for incomplete chunks
      }
    }
  }
}

export async function callAIProviderStream(
  provider: AIProvider,
  keys: ApiKeys,
  prompt: string,
  systemPrompt: string,
  onChunk: (text: string) => void,
  jsonMode: boolean = false,
  maxTokens: number = 131072,
  model?: string
): Promise<string> {
  let providerMaxTokens = maxTokens;
  if (provider === "anthropic" && maxTokens < 5000) providerMaxTokens = maxTokens;
  else if (provider === "openai" && maxTokens < 5000) providerMaxTokens = maxTokens;
  else if (provider === "gemini" && maxTokens < 5000) providerMaxTokens = maxTokens;

  const finalSystemPrompt = jsonMode 
    ? `${systemPrompt}\n\nIMPORTANT: You must respond ONLY with valid JSON. Do not include any conversational text, markdown formatting, or explanations outside the JSON object. Ensure all strings are properly escaped.`
    : systemPrompt;

  let fullText = "";
  const handleChunk = (chunk: string) => {
    fullText += chunk;
    onChunk(fullText); // pass the FULL text every time as expected by our React states
  };

  if (provider === "gemini") {
    const ai = new GoogleGenAI({ apiKey: keys.gemini || process.env.GEMINI_API_KEY });
    const config: any = {
      maxOutputTokens: providerMaxTokens,
      systemInstruction: finalSystemPrompt,
    };
    if (jsonMode) {
      config.responseMimeType = "application/json";
    }
    const responseStream = await ai.models.generateContentStream({
      model: model || "gemini-3.1-pro-preview",
      contents: prompt,
      config,
    });
    for await (const chunk of responseStream) {
      if (chunk.text) handleChunk(chunk.text);
    }
    return fullText;
  }

  // Anthropic
  if (provider === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": keys.anthropic || "",
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: model || "claude-3-opus-20240229",
        max_tokens: providerMaxTokens,
        system: finalSystemPrompt,
        messages: [{ role: "user", content: prompt }],
        stream: true
      }),
    });
    if (!res.ok) throw new Error(`Anthropic stream error: ${res.statusText}`);
    await readSseStream(res, handleChunk, provider);
    return fullText;
  }

  // OpenAI
  if (provider === "openai" || provider === "openai-responses") {
    const body: any = {
      model: model || "gpt-4-turbo-preview",
      max_completion_tokens: providerMaxTokens,
      messages: [
        { role: "system", content: finalSystemPrompt },
        { role: "user", content: prompt }
      ],
      stream: true
    };
    const endpoint = provider === "openai-responses" ? "https://api.openai.com/v1/responses" : "https://api.openai.com/v1/chat/completions";
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${keys.openai}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`OpenAI stream error: ${res.statusText}`);
    await readSseStream(res, handleChunk, "openai");
    return fullText;
  }

  // OpenRouter
  if (provider === "openrouter" || provider === "openrouter-responses") {
    const body: any = {
      model: model || "anthropic/claude-3-opus",
      max_tokens: providerMaxTokens,
      messages: [
        { role: "system", content: finalSystemPrompt },
        { role: "user", content: prompt }
      ],
      stream: true
    };
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${keys.openrouter}`,
        "HTTP-Referer": window.location.href,
        "X-Title": "SillyTavern Style Guide Generator",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`OpenRouter stream error: ${res.statusText}`);
    await readSseStream(res, handleChunk, "openrouter");
    return fullText;
  }

  // Default fallback
  throw new Error("Unsupported provider for streaming: " + provider);
}
