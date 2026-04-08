import { GoogleGenAI } from "@google/genai";
import { jsonrepair } from "jsonrepair";
import { CharacterCard } from "./parser";

export type AIProvider = "gemini" | "anthropic" | "openrouter" | "openai" | "custom";

export interface ApiKeys {
  gemini: string;
  anthropic: string;
  openrouter: string;
  openai: string;
  customEndpoint: string;
  customKey: string;
}

export interface AIModel {
  id: string;
  name: string;
}

const customMaxCompletionSupport = new Map<string, boolean>();

function isUnsupportedMaxCompletionError(errMsg: string): boolean {
  const normalized = errMsg.toLowerCase();
  return normalized.includes("max_completion_tokens") &&
    (normalized.includes("unsupported") || normalized.includes("unknown") || normalized.includes("invalid"));
}

function findBalancedJSON(text: string, startFrom: number = 0): { value: string; endIndex: number } | null {
  const openers = new Set(['{', '[']);
  for (let i = startFrom; i < text.length; i++) {
    const ch = text[i];
    if (!openers.has(ch)) continue;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let j = i; j < text.length; j++) {
      const c = text[j];
      if (escaped) { escaped = false; continue; }
      if (c === '\\' && inString) { escaped = true; continue; }
      if (c === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (c === '{' || c === '[') depth++;
      if (c === '}' || c === ']') depth--;
      if (depth === 0) {
        return { value: text.substring(i, j + 1), endIndex: j + 1 };
      }
    }
    // Braces never balanced — return from opener to end so jsonrepair can attempt to fix truncated JSON
    return { value: text.substring(i), endIndex: text.length };
  }
  return null;
}

function extractJSON(text: string): unknown {
  // Strategy 1: Extract from markdown code blocks (handles ```json, ```JSON, ```js, bare ``` etc.)
  const codeBlockMatch = text.match(/```(?:\w+)?\s*\n?([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(jsonrepair(codeBlockMatch[1].trim()));
    } catch (e) {
      // Fall through to strategy 2
    }
  }

  // Strategy 2: Try each balanced JSON structure in order (skips prose braces like {from your idea})
  let searchFrom = 0;
  while (searchFrom < text.length) {
    const result = findBalancedJSON(text, searchFrom);
    if (!result) break;
    try {
      return JSON.parse(jsonrepair(result.value.trim()));
    } catch (e) {
      searchFrom = result.endIndex;
      continue;
    }
  }

  // Strategy 3: First opener to last closer — handles unescaped quotes in string values
  // that cause the balanced scanner to close prematurely
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(jsonrepair(text.substring(firstBrace, lastBrace + 1).trim()));
    } catch (e) {
      // Fall through
    }
  }
  const firstBracket = text.indexOf('[');
  const lastBracket = text.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    try {
      return JSON.parse(jsonrepair(text.substring(firstBracket, lastBracket + 1).trim()));
    } catch (e) {
      // Fall through
    }
  }

  // Strategy 4: Try the raw text with jsonrepair as last resort
  return JSON.parse(jsonrepair(text.trim()));
}

export async function fetchModels(provider: AIProvider, keys: ApiKeys): Promise<AIModel[]> {
  try {
    switch (provider) {
      case "gemini": {
        const key = keys.gemini || process.env.GEMINI_API_KEY;
        const defaultModels = [
          { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro Preview" },
          { id: "gemini-3.1-flash-preview", name: "Gemini 3.1 Flash Preview" },
          { id: "gemini-3-flash-preview", name: "Gemini 3 Flash Preview" },
          { id: "gemini-3.1-flash-lite-preview", name: "Gemini 3.1 Flash Lite Preview" },
          { id: "gemini-2.5-pro-preview", name: "Gemini 2.5 Pro Preview" },
          { id: "gemini-2.5-flash-preview", name: "Gemini 2.5 Flash Preview" },
          { id: "gemini-3.1-flash-image-preview", name: "Gemini 3.1 Flash Image Preview (Nano Banana 2)" },
          { id: "gemini-2.5-flash-image", name: "Gemini 2.5 Flash Image (Nano Banana)" }
        ];
        if (!key) return defaultModels;
        try {
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
          if (!res.ok) throw new Error("Failed to fetch Gemini models");
          const data = await res.json();
          const fetchedModels = data.models
            .filter((m: any) => m.supportedGenerationMethods.includes("generateContent"))
            .map((m: any) => ({
              id: m.name.replace("models/", ""),
              name: m.displayName || m.name.replace("models/", "")
            }));
            
          // Ensure image models are always available
          const imageModels = [
            { id: "gemini-3.1-flash-image-preview", name: "Gemini 3.1 Flash Image Preview (Nano Banana 2)" },
            { id: "gemini-2.5-flash-image", name: "Gemini 2.5 Flash Image (Nano Banana)" }
          ];
          
          for (const im of imageModels) {
            if (!fetchedModels.find((m: any) => m.id === im.id)) {
              fetchedModels.push(im);
            }
          }
          
          return fetchedModels;
        } catch (e) {
          console.warn("Could not fetch Gemini models, using defaults", e);
          return defaultModels;
        }
      }
      case "openai": {
        const defaultModels = [
          { id: "gpt-4o", name: "GPT-4o" },
          { id: "gpt-4o-mini", name: "GPT-4o Mini" },
          { id: "o1", name: "o1" },
          { id: "o1-preview", name: "o1 Preview" },
          { id: "o1-mini", name: "o1 Mini" },
          { id: "o3-mini", name: "o3 Mini" }
        ];
        if (!keys.openai) return defaultModels;
        try {
          const res = await fetch("https://api.openai.com/v1/models", {
            headers: { "Authorization": `Bearer ${keys.openai}` }
          });
          if (!res.ok) throw new Error("Failed to fetch OpenAI models");
          const data = await res.json();
          return data.data
            .map((m: any) => ({ id: m.id, name: m.id }))
            .sort((a: any, b: any) => a.id.localeCompare(b.id));
        } catch (e) {
          console.warn("Could not fetch OpenAI models, using defaults", e);
          return defaultModels;
        }
      }
      case "openrouter": {
        try {
          const res = await fetch("https://openrouter.ai/api/v1/models");
          if (!res.ok) throw new Error("Failed to fetch OpenRouter models");
          const data = await res.json();
          return data.data
            .map((m: any) => ({ id: m.id, name: m.name }))
            .sort((a: any, b: any) => a.name.localeCompare(b.name));
        } catch (e) {
          console.warn("Could not fetch OpenRouter models", e);
          return [];
        }
      }
      case "anthropic": {
        const defaultModels = [
          { id: "claude-3-7-sonnet-20250219", name: "Claude 3.7 Sonnet" },
          { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet" },
          { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku" },
          { id: "claude-3-opus-20240229", name: "Claude 3 Opus" }
        ];
        if (!keys.anthropic) return defaultModels;
        try {
          const res = await fetch("https://api.anthropic.com/v1/models", {
            headers: {
              "x-api-key": keys.anthropic,
              "anthropic-version": "2023-06-01",
              "anthropic-dangerous-direct-browser-access": "true"
            }
          });
          if (!res.ok) throw new Error("Failed to fetch Anthropic models");
          const data = await res.json();
          return data.data
            .map((m: any) => ({ id: m.id, name: m.display_name || m.id }))
            .sort((a: any, b: any) => a.name.localeCompare(b.name));
        } catch (e) {
          console.warn("Could not fetch Anthropic models, using defaults", e);
          return defaultModels;
        }
      }
      case "custom": {
        if (!keys.customEndpoint || !keys.customKey) return [];
        try {
          const baseUrl = keys.customEndpoint.replace(/\/chat\/completions\/?$/, "");
          const res = await fetch(`${baseUrl}/models`, {
            headers: { "Authorization": `Bearer ${keys.customKey}` }
          });
          if (!res.ok) throw new Error("Failed to fetch Custom models");
          const data = await res.json();
          if (data && data.data && Array.isArray(data.data)) {
            return data.data.map((m: any) => ({ id: m.id, name: m.id }));
          }
          throw new Error("Invalid format");
        } catch (e) {
          console.warn("Could not fetch custom models, using default", e);
          return [{ id: "default", name: "Default Custom Model" }];
        }
      }
      default:
        return [];
    }
  } catch (error) {
    console.error(`Error fetching models for ${provider}:`, error);
    if (provider === "anthropic") {
      return [
        { id: "claude-3-7-sonnet-20250219", name: "Claude 3.7 Sonnet" },
        { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet" },
        { id: "claude-3-opus-20240229", name: "Claude 3 Opus" },
        { id: "claude-3-haiku-20240307", name: "Claude 3 Haiku" }
      ];
    }
    if (provider === "gemini") {
      return [
        { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro Preview" },
        { id: "gemini-3.1-flash-preview", name: "Gemini 3.1 Flash Preview" },
        { id: "gemini-3-flash-preview", name: "Gemini 3 Flash Preview" },
        { id: "gemini-3.1-flash-lite-preview", name: "Gemini 3.1 Flash Lite Preview" },
        { id: "gemini-2.5-pro-preview", name: "Gemini 2.5 Pro Preview" },
        { id: "gemini-2.5-flash-preview", name: "Gemini 2.5 Flash Preview" },
        { id: "gemini-3.1-flash-image-preview", name: "Gemini 3.1 Flash Image Preview (Nano Banana 2)" },
        { id: "gemini-2.5-flash-image", name: "Gemini 2.5 Flash Image (Nano Banana)" }
      ];
    }
    return [];
  }
}

const SYSTEM_PROMPT = `You are an expert literary analyst and character designer. Your task is to analyze a collection of character cards (from the same creator) and generate a comprehensive writing style guide that captures their unique authorial voice, formatting, and structural DNA.

The output MUST be formatted as a Markdown document that closely matches the structure and sections of the "ElysianSuns Style Guide" example.

Required Sections:
1. Description Structure & Template (How they format their character definitions)
2. Archetype Naming Conventions (Patterns in how they name or label archetypes)
3. First Message Architecture (How they structure their opening messages)
4. Prose Voice & Signature Techniques (Metaphors, punctuation, sensory details)
5. Dialogue Voice & Speech Patterns (Speech registers, tags, pet names)
6. Internal Monologue Techniques (How they handle character thoughts)
7. Relationship & Supporting Cast Writing (How NPCs are handled)
8. Possessiveness & Emotional Spectrum (How emotions and toxicity/warmth are portrayed)
9. Thematic DNA & World-Building (Recurring themes, genres)
10. Tonal Range & Register Flexibility (Registers used)
11. Shared Universes & Character Variants (If applicable)
12. Page Presentation & HTML Formatting (If applicable)
13. Quick-Reference Checklist
14. Full Character Catalog (List of the analyzed characters and their archetypes)

Analyze the provided character data deeply. Look for recurring patterns in:
- The use of brackets, asterisks, or quotes.
- The structure of the first message (e.g., sensory opening -> internal thought -> dialogue).
- The way vulnerability or toxicity is expressed.
- The formatting of the character description (e.g., W++ format, Ali:Chat, plain text, bracketed headers).

Output ONLY the Markdown document. Make it look professional and attractive.`;

async function callAIProvider(
  provider: AIProvider,
  keys: ApiKeys,
  prompt: string,
  systemPrompt: string,
  jsonMode: boolean = false,
  maxTokens: number = 131072,
  model?: string
): Promise<string> {
  try {
    let providerMaxTokens = maxTokens;
    if (provider === "anthropic") providerMaxTokens = Math.min(maxTokens, 16384);
    else if (provider === "openai") providerMaxTokens = Math.min(maxTokens, 16384);
    else if (provider === "gemini") providerMaxTokens = Math.min(maxTokens, 16384);

    const finalSystemPrompt = jsonMode 
      ? `${systemPrompt}\n\nIMPORTANT: You must respond ONLY with valid JSON. Do not include any conversational text, markdown formatting, or explanations outside the JSON object. Ensure all strings are properly escaped.`
      : systemPrompt;

    switch (provider) {
      case "gemini": {
        const ai = new GoogleGenAI({ apiKey: keys.gemini || process.env.GEMINI_API_KEY });
        const config: any = {
          maxOutputTokens: providerMaxTokens,
          systemInstruction: finalSystemPrompt,
        };
        if (jsonMode) {
          config.responseMimeType = "application/json";
        }
        const response = await ai.models.generateContent({
          model: model || "gemini-3.1-pro-preview",
          contents: prompt,
          config,
        });
        return response.text || "";
      }
      case "anthropic": {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": keys.anthropic,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true"
          },
          body: JSON.stringify({
            model: model || "claude-3-opus-20240229",
            max_tokens: providerMaxTokens,
            system: finalSystemPrompt,
            messages: [{ role: "user", content: prompt }],
          }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const errMsg = errData.error?.message || errData.message || res.statusText;
          throw new Error(`Anthropic API error: ${errMsg}`);
        }
        const data = await res.json();
        return data.content[0].text;
      }
      case "openai": {
        const makeOpenAIBody = (useMaxCompletionTokens: boolean) => {
          const body: any = {
            model: model || "gpt-4-turbo-preview",
            messages: [
              { role: "system", content: finalSystemPrompt },
              { role: "user", content: prompt }
            ],
          };
          if (useMaxCompletionTokens) {
            body.max_completion_tokens = providerMaxTokens;
          } else {
            body.max_tokens = providerMaxTokens;
          }
          if (jsonMode) {
            body.response_format = { type: "json_object" };
          }
          return body;
        };

        const sendOpenAIRequest = async (useMaxCompletionTokens: boolean) => {
          const res = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${keys.openai}`,
            },
            body: JSON.stringify(makeOpenAIBody(useMaxCompletionTokens)),
          });
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            const errMsg = errData.error?.message || errData.message || res.statusText;
            return { ok: false as const, errMsg };
          }
          const data = await res.json();
          return { ok: true as const, data };
        };

        let openaiResult = await sendOpenAIRequest(true);
        if (!openaiResult.ok && isUnsupportedMaxCompletionError(openaiResult.errMsg)) {
          openaiResult = await sendOpenAIRequest(false);
        }
        if (!openaiResult.ok) {
          throw new Error(`OpenAI API error: ${openaiResult.errMsg}`);
        }
        const openaiChoice = openaiResult.data.choices?.[0];
        if (!openaiChoice) {
          throw new Error(`OpenAI returned no choices. Response: ${JSON.stringify(openaiResult.data).substring(0, 200)}`);
        }
        return openaiChoice.message?.content || openaiChoice.text || "";
      }
      case "openrouter": {
        const makeOpenRouterBody = (useMaxCompletionTokens: boolean) => {
          const body: any = {
            model: model || "anthropic/claude-3-opus",
            messages: [
              { role: "system", content: finalSystemPrompt },
              { role: "user", content: prompt }
            ],
          };
          if (useMaxCompletionTokens) {
            body.max_completion_tokens = providerMaxTokens;
          } else {
            body.max_tokens = providerMaxTokens;
          }
          return body;
        };

        // OpenRouter models vary in JSON mode support, rely on prompt + regex parsing
        const sendOpenRouterRequest = async (useMaxCompletionTokens: boolean) => {
          const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${keys.openrouter}`,
              "HTTP-Referer": window.location.href,
              "X-Title": "SillyTavern Style Guide Generator",
            },
            body: JSON.stringify(makeOpenRouterBody(useMaxCompletionTokens)),
          });
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            const errMsg = errData.error?.message || errData.message || res.statusText;
            return { ok: false as const, errMsg };
          }
          const data = await res.json();
          return { ok: true as const, data };
        };

        let openrouterResult = await sendOpenRouterRequest(true);
        if (!openrouterResult.ok && isUnsupportedMaxCompletionError(openrouterResult.errMsg)) {
          openrouterResult = await sendOpenRouterRequest(false);
        }
        if (!openrouterResult.ok) {
          throw new Error(`OpenRouter API error: ${openrouterResult.errMsg}`);
        }
        const openrouterChoice = openrouterResult.data.choices?.[0];
        if (!openrouterChoice) {
          throw new Error(`OpenRouter returned no choices. Response: ${JSON.stringify(openrouterResult.data).substring(0, 200)}`);
        }
        return openrouterChoice.message?.content || openrouterChoice.text || "";
      }
      case "custom": {
        const capabilityKey = keys.customEndpoint;
        const cachedSupport = customMaxCompletionSupport.get(capabilityKey);

        const createBody = (includeMaxCompletionTokens: boolean) => {
          const body: any = {
            model: model || "default",
            messages: [
              { role: "system", content: finalSystemPrompt },
              { role: "user", content: prompt }
            ],
          };
          if (includeMaxCompletionTokens) {
            body.max_completion_tokens = providerMaxTokens;
          } else {
            body.max_tokens = providerMaxTokens;
          }
          // Custom endpoints vary in JSON mode support, rely on prompt + regex parsing
          return body;
        };

        const sendRequest = async (includeMaxCompletionTokens: boolean) => {
          const res = await fetch(keys.customEndpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${keys.customKey}`,
            },
            body: JSON.stringify(createBody(includeMaxCompletionTokens)),
          });

          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            const errMsg = errData.error?.message || errData.message || res.statusText;
            return { ok: false as const, errMsg };
          }

          const data = await res.json();
          return { ok: true as const, data };
        };

        const shouldTryMaxCompletion = cachedSupport !== false;
        let usedFallbackWithoutMaxCompletion = false;
        let result = await sendRequest(shouldTryMaxCompletion);

        if (!result.ok && shouldTryMaxCompletion && isUnsupportedMaxCompletionError(result.errMsg)) {
          customMaxCompletionSupport.set(capabilityKey, false);
          usedFallbackWithoutMaxCompletion = true;
          result = await sendRequest(false);
        }

        if (!result.ok) {
          throw new Error(`Custom API error: ${result.errMsg}`);
        }

        if (shouldTryMaxCompletion && !usedFallbackWithoutMaxCompletion) {
          customMaxCompletionSupport.set(capabilityKey, true);
        }

        return result.data.choices[0].message.content;
      }
      default:
        throw new Error("Unknown provider");
    }
  } catch (error) {
    console.error(`Error calling ${provider} API:`, error);
    throw error;
  }
}

export async function generateStyleGuide(
  provider: AIProvider,
  keys: ApiKeys,
  cards: CharacterCard[],
  model?: string
): Promise<string> {
  const cardsData = cards.map((c, i) => `
--- Character ${i + 1}: ${c.name} ---
Description: ${c.description}
Personality: ${c.personality}
Scenario: ${c.scenario}
First Message: ${c.first_mes}
Example Messages: ${c.mes_example}
`).join("\n");

  const prompt = `Here are the character cards to analyze:\n\n${cardsData}\n\nPlease generate the comprehensive style guide based on these cards.`;

  return callAIProvider(provider, keys, prompt, SYSTEM_PROMPT, false, 16000, model);
}

export async function generateSlotContent(
  provider: AIProvider,
  keys: ApiKeys,
  slotName: string,
  slotDescription: string,
  currentValue: string,
  characterName: string,
  characterConcept: string,
  otherSlots: { name: string; value: string }[],
  styleGuide: string,
  model?: string,
  templateExample?: string,
  vibePrompt?: string
): Promise<string> {
  const contextStr = otherSlots
    .filter(s => s.value.trim() !== "")
    .map(s => `${s.name}: ${s.value}`)
    .join("\n");

  let prompt = `You are an expert character creator for roleplay. Generate or refine the content for a specific character detail field.

CHARACTER CONTEXT:
Name: ${characterName || "Unknown"}
Concept/Archetype: ${characterConcept || "Unknown"}
${contextStr ? `\nOTHER KNOWN DETAILS:\n${contextStr}\n` : ""}

STYLE GUIDE (follow this guide's writing voice, prose style, phrasing conventions, and tone):
${styleGuide || "Use a descriptive, engaging tone."}

TASK:
${currentValue.trim() !== "" 
  ? `Refine, expand upon, or complete the following existing content for the field "${slotName}":\n\nEXISTING CONTENT:\n${currentValue}\n\nMake sure the final output incorporates the existing ideas but improves them according to the Style Guide.` 
  : `Generate ONLY the content for the field "${slotName}".`}
${slotDescription ? `\nField Description/Hint: ${slotDescription}` : ""}
${vibePrompt ? `\nSPECIFIC INSTRUCTIONS / VIBE FOR THIS FIELD:\n"${vibePrompt}"\n` : ""}
${templateExample ? `\nEXAMPLE OF FILLED TEMPLATE (Use this as a strict reference for formatting, tone, length, and level of detail for this field):\n${templateExample}` : ""}

Keep the response concise, directly applicable to the field, and written in the tone dictated by the Style Guide. Do not include the field name in your response. Return ONLY the raw generated text.`;

  const responseText = await callAIProvider(
    provider,
    keys,
    prompt,
    "You are an expert character creator. Output only the requested field content.",
    false,
    1500,
    model
  );
  
  return responseText.trim();
}

export async function generateCharacterCard(
  provider: AIProvider,
  keys: ApiKeys,
  styleGuide: string,
  slots: { name: string; value: string }[],
  template?: string,
  model?: string,
  firstMessageIdea?: string,
  templateExample?: string
): Promise<CharacterCard> {
  const detailsStr = slots.map(s => `${s.name}: ${s.value}`).join("\n");
  
  let prompt = `You are an expert character creator for roleplay.\n`;
  if (template) {
    prompt += `Using the following Style Guide for tone, prose, and writing voice, create a character card that STRICTLY adheres to the formatting and structural rules of the provided TEMPLATE.\n\nTEMPLATE:\n${template}\n`;
    if (templateExample) {
      prompt += `\nEXAMPLE OF FILLED TEMPLATE (Use this as a strict reference for formatting, tone, length, and level of detail):\n${templateExample}\n`;
    }
    prompt += `\nSTYLE GUIDE (dictates writing voice, prose style, and tone — follow its conventions for phrasing, detail level, and stylistic techniques):\n${styleGuide}\n`;
  } else {
    prompt += `Create a character card using the ElysianSuns bracketed-section format. The card MUST use bracketed section headers with bullet points (* ) for each field.
    
REQUIRED FORMAT:
[Basic Information:
* Name:
* Age:
* Gender/Pronouns:
* Occupation:
* Appearance: ]
[Background:
* ]
[Core Personality:
* Archetype:
* Traits:
* Goal:
* Behavioral Patterns:
* Likes:
* Dislikes: ]
[Boundaries:
* ]
[Emotional Responses:
* Positive Reactions:
* Negative Reactions:
* Neutral Responses: ]
[Specific Scenarios and Responses:
* ]
[Dialogue: (These are merely examples of how {{char}} might speak and should not be used verbatim.)
* Speech Style:
* Greeting:
* Angry Response:
* Teasing:
* Intimate: ]
[Relationships:
* ]
[Sexual Behavior:
* Sexual Orientation:
* Genitalia:
* Kinks:
* During intercourse:
* Unique Sexual Quirks: ]

STYLE GUIDE (dictates writing voice, prose style, and tone — follow its conventions for phrasing, detail level, and stylistic techniques):
${styleGuide}
`;
  }

  if (firstMessageIdea) {
    prompt += `\nFIRST MESSAGE / SCENARIO IDEA:\nThe user has provided the following idea for the character's first message and scenario. Use this as the core premise for the 'first_mes' and 'scenario' fields, writing it in the tone and prose dictated by the Style Guide:\n"${firstMessageIdea}"\n`;
  }

  prompt += `
CHARACTER DETAILS:
${detailsStr}

OUTPUT FORMAT:
You MUST output ONLY valid JSON matching this structure. Do not include any other text, explanations, or markdown formatting outside the JSON object.
IMPORTANT: Ensure all string values are properly escaped for JSON. Use \\n for newlines and \\" for quotes within strings. Do NOT use unescaped newlines or control characters inside string values.
{
  "name": "string",
  "description": "string",
  "personality": "string",
  "scenario": "string",
  "first_mes": "string",
  "mes_example": "string"
}`;

  const parseResponse = (text: string): CharacterCard => {
    try {
      return extractJSON(text) as CharacterCard;
    } catch (e: any) {
      console.error("Failed to parse AI response as JSON:", text);
      console.error("Parse error:", e);
      throw new Error(`AI did not return valid JSON: ${e.message}`);
    }
  };

  const responseText = await callAIProvider(
    provider,
    keys,
    prompt,
    "You are an expert character creator. Output only valid JSON.",
    true,
    16384,
    model
  );
  return parseResponse(responseText);
}

function extractSlotsViaRegex(text: string): { name: string; description: string }[] {
  const slots: { name: string; description: string }[] = [];
  const lines = text.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
      let cleanLine = trimmed.replace(/^[\-\*]\s*/, '').replace(/\*\*/g, '').replace(/\*/g, '');
      if (!cleanLine) continue;

      let name = cleanLine;
      let description = "";

      const colonIndex = cleanLine.indexOf(':');
      if (colonIndex !== -1) {
        name = cleanLine.substring(0, colonIndex).trim();
        description = cleanLine.substring(colonIndex + 1).trim();
      } else {
        const dashIndex = cleanLine.indexOf('-');
        if (dashIndex !== -1) {
          name = cleanLine.substring(0, dashIndex).trim();
          description = cleanLine.substring(dashIndex + 1).trim();
        }
      }

      name = name.replace(/\]$/, '').trim();
      description = description.replace(/\]$/, '').trim();

      if (name && name.length < 50 && name.toLowerCase() !== 'name' && name.toLowerCase() !== 'core concept/archetype') {
        if (!slots.find(s => s.name === name)) {
          slots.push({ name, description: description || `Fill in the ${name.toLowerCase()}` });
        }
      }
    }
  }
  return slots;
}

export async function extractSlotsFromTemplate(
  provider: AIProvider,
  keys: ApiKeys,
  templateContent: string,
  model?: string,
  templateExample?: string
): Promise<{ name: string; description: string }[]> {
  // Fast regex-based extraction from template content
  const templateSlots = extractSlotsViaRegex(templateContent);

  // If we have an example, also extract from it and merge
  if (templateExample) {
    const exampleSlots = extractSlotsViaRegex(templateExample);

    // Enrich template slots with example descriptions (example content shows what goes in each field)
    for (const slot of templateSlots) {
      const exampleMatch = exampleSlots.find(
        e => e.name.toLowerCase() === slot.name.toLowerCase()
      );
      if (exampleMatch && exampleMatch.description && (!slot.description || slot.description.startsWith('Fill in'))) {
        slot.description = `e.g., "${exampleMatch.description}"`;
      }
    }
  }

  if (templateSlots.length > 0) {
    return templateSlots;
  }

  // Fallback to AI if regex found nothing
  let prompt = `Analyze the following Character Card Template and extract EVERY SINGLE individual field, property, or slot that a user should fill out to create a character card using this template.
Return ONLY a JSON array of objects, where each object has a "name" (the exact name of the field/property from the template, e.g., "Skintone", "Age", "Short term goal") and a "description" (a brief explanation of what should go in this field).
Do not group fields together. If the template has a section called "Appearance" with sub-fields like "Height", "Weight", and "Eye Color", you MUST extract "Height", "Weight", and "Eye Color" as separate fields.
Do not include fields that are generated by the AI (like First Message, Example Messages, etc.).
Do NOT include "Name" or "Core Concept/Archetype" as these are already provided by default.

TEMPLATE:
${templateContent}`;

  if (templateExample) {
    prompt += `

EXAMPLE OF A COMPLETED CARD (use this to understand which fields are important, what kind of content goes in each field, and what sections matter):
${templateExample}`;
  }

  const parseResponse = (text: string) => {
    try {
      const parsed = extractJSON(text);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === 'object') {
        const possibleArray = Object.values(parsed).find(val => Array.isArray(val));
        if (possibleArray) return possibleArray;
      }
      return [];
    } catch (e: any) {
      console.error("Failed to parse AI response as JSON:", text);
      console.error("Parse error:", e);
      return [
        { name: "Background", description: "The character's history and lore." },
        { name: "Scenario", description: "The current situation or dynamic." }
      ];
    }
  };

  try {
    const responseText = await callAIProvider(
      provider,
      keys,
      prompt,
      "You are an expert character card analyst. Extract the required input fields from the provided template as a JSON array.",
      true,
      8192,
      model
    );
    return parseResponse(responseText);
  } catch (error) {
    console.error("Failed to extract slots from template:", error);
    return [
      { name: "Background", description: "The character's history and lore." },
      { name: "Scenario", description: "The current situation or dynamic." }
    ];
  }
}

export function extractSlotsFromGuide(): { name: string; description: string }[] {
  // Use the ElysianSuns template structure as the canonical field set for style guide mode.
  // The style guide informs HOW to write (tone, prose, voice), not WHAT fields to extract.
  return [
    { name: "Age", description: "Character's age or age range" },
    { name: "Gender/Pronouns", description: "Character's gender identity and pronouns" },
    { name: "Occupation", description: "Character's job, role, or source of income" },
    { name: "Appearance", description: "Physical description: height, build, hair, eyes, skin, distinguishing features, fashion, scent" },
    { name: "Background", description: "Origin story, key life events, and formative experiences that shaped who they are" },
    { name: "Archetype", description: "e.g., \"Chaotic Daddy Dom\", \"The Burnt-Out Star\", \"Pragmatic, ruthless manager\"" },
    { name: "Traits", description: "Core personality traits with brief descriptions of how each manifests in behavior" },
    { name: "Goal", description: "What the character wants most — their driving motivation" },
    { name: "Behavioral Patterns", description: "Recurring habits, quirks, tells, and instinctive reactions" },
    { name: "Likes", description: "Things the character enjoys, values, or is drawn to" },
    { name: "Dislikes", description: "Things the character avoids, hates, or reacts negatively to" },
    { name: "Boundaries", description: "Hard limits, moral lines, and non-negotiable rules the character follows" },
    { name: "Positive Reactions", description: "How the character behaves when happy, comfortable, or affectionate" },
    { name: "Negative Reactions", description: "How the character behaves when angry, hurt, or threatened" },
    { name: "Neutral Responses", description: "Default behavior in everyday, low-stakes interactions" },
    { name: "Specific Scenarios and Responses", description: "2-4 concrete example situations showing the character in action" },
    { name: "Speech Style", description: "How the character talks: tone, vocabulary, verbal quirks, and example dialogue lines" },
    { name: "Greeting", description: "Example of how they say hello" },
    { name: "Angry Response", description: "Example of how they speak when angry" },
    { name: "Teasing", description: "Example of how they tease" },
    { name: "Intimate", description: "Example of how they speak intimately" },
    { name: "Relationships", description: "Key connections: {{user}}, family, friends, rivals, enemies — with brief descriptions of each dynamic" },
    { name: "Sexual Orientation", description: "Character's sexual orientation" },
    { name: "Genitalia", description: "Physical intimate details" },
    { name: "Kinks", description: "Sexual preferences, dynamics, and turn-ons" },
    { name: "During intercourse", description: "Behavior, demeanor, and tendencies during sex" },
    { name: "Unique Sexual Quirks", description: "Distinctive intimate habits or post-sex behavior (e.g., aftercare style)" },
  ];
}

export interface UniverseNode {
  id: string;
  name: string;
  group: string;
  description?: string;
}

export interface UniverseLink {
  source: string;
  target: string;
  type: "relationship" | "pipeline";
  label?: string;
}

export interface UniverseData {
  nodes: UniverseNode[];
  links: UniverseLink[];
}

import { SCRIPT_GUIDE } from "./scriptPrompt";

export async function generateScript(
  provider: AIProvider,
  keys: ApiKeys,
  promptText: string,
  model?: string
): Promise<string> {
  const prompt = `You are an expert Character AI scripter, specializing in JanitorAI scripts.
Your task is to generate a JavaScript script based on the user's request.

${SCRIPT_GUIDE}

USER REQUEST:
${promptText}

OUTPUT INSTRUCTIONS:
- Output ONLY valid ES5 JavaScript code.
- Do not include markdown code blocks (\`\`\`) in the final output, just the raw code.
- Add brief comments explaining what the code does.
- Ensure the code is safe and won't crash the bot.`;

  let result = await callAIProvider(
    provider,
    keys,
    prompt,
    "You are an expert Character AI scripter. Output only the requested JavaScript code.",
    false,
    8192,
    model
  );
  
  // Clean up markdown if present
  if (result.startsWith("\`\`\`javascript")) {
    result = result.replace(/^\`\`\`javascript\n/, "");
    result = result.replace(/\n\`\`\`$/, "");
  } else if (result.startsWith("\`\`\`js")) {
    result = result.replace(/^\`\`\`js\n/, "");
    result = result.replace(/\n\`\`\`$/, "");
  } else if (result.startsWith("\`\`\`")) {
    result = result.replace(/^\`\`\`\n/, "");
    result = result.replace(/\n\`\`\`$/, "");
  }
  
  return result.trim();
}

export async function extractUniverse(
  provider: AIProvider,
  keys: ApiKeys,
  styleGuide: string | undefined,
  model?: string,
  savedCards?: { name: string; concept: string; description: string }[]
): Promise<UniverseData> {
  let cardsContext = "";
  if (savedCards && savedCards.length > 0) {
    cardsContext = `\n\nHere are the saved character cards in the library. You MUST include them in the universe map and infer their relationships with each other, as well as with any objects, locations, or factions mentioned in their descriptions${styleGuide ? ' and the style guide' : ''}:\n`;
    savedCards.forEach(card => {
      cardsContext += `- Name: ${card.name}\n  Concept: ${card.concept}\n  Description: ${card.description}\n`;
    });
  }

  const prompt = `Analyze the following ${styleGuide ? 'Style Guide and character cards' : 'character cards'} to build a comprehensive, highly interconnected relationship map.
Look for characters, important objects, artifacts, locations, factions, and their relationships. 
CRITICAL: You must create an ACTUAL relationship map. Do not just list entities. You must infer and create logical links between the characters, objects, and locations based on their descriptions and concepts.
Also look for "pipeline" progressions (e.g., Character A was an NPC in Character B's story, then got their own card).${cardsContext}

Return ONLY a valid JSON object with two arrays: "nodes" and "links". Do not include any markdown formatting or other text.
IMPORTANT: Ensure all string values are properly escaped for JSON. Use \\n for newlines and \\" for quotes within strings.
- "nodes" should be an array of objects: { "id": "unique_id", "name": "Entity Name", "group": "character" | "object" | "location" | "faction" | "archetype", "description": "Short description" }
- "links" should be an array of objects: { "source": "source_node_id", "target": "target_node_id", "type": "relationship" or "pipeline", "label": "Short description of link (e.g., 'Wields', 'Located In', 'Rivals', 'Allies With', 'Created')" }

For "pipeline" links, the source is the original character/card where they appeared as an NPC, and the target is the character who was promoted.
For "relationship" links, it's a connection between any two entities (e.g., a character and an object, two characters, a character and a faction). Make sure to include many relationship links to make the map interconnected.

STYLE GUIDE:
${styleGuide || "No style guide provided. Rely entirely on the character cards above to build the relationship map."}`;

  const parseResponse = (text: string): UniverseData => {
    try {
      return extractJSON(text) as UniverseData;
    } catch (e: any) {
      console.error("Failed to parse AI response as JSON:", text);
      console.error("Parse error:", e);
      return { nodes: [], links: [] };
    }
  };

  try {
    const responseText = await callAIProvider(
      provider,
      keys,
      prompt,
      "You are an expert relationship map generator. Output only valid JSON.",
      true,
      8192,
      model
    );
    return parseResponse(responseText);
  } catch (error) {
    console.error("Error extracting universe:", error);
    return { nodes: [], links: [] };
  }
}

export async function vibeForgeCard(
  provider: AIProvider,
  keys: ApiKeys,
  vibePrompt: string,
  slots: { name: string; description: string; value: string }[],
  model?: string,
  templateExample?: string,
  styleGuide?: string
): Promise<{ name: string; concept: string; firstMessageIdea: string; slots: Record<string, string> }> {
  const slotsPrompt = slots.map(s => `- ${s.name}: ${s.description}`).join("\n");

  let prompt = `You are an expert character creator. I am building a character based on this "vibe" or description:
"${vibePrompt}"

Please generate a fitting Name, a Core Concept/Archetype, a First Message Idea, and appropriate content for the following character fields.
Return ONLY a valid JSON object with the following structure. Do not include any markdown formatting or other text.
IMPORTANT: Ensure all string values are properly escaped for JSON. Use \\n for newlines and \\" for quotes within strings. Do NOT use unescaped newlines or control characters inside string values.
{
  "name": "Generated Name",
  "concept": "Generated Core Concept",
  "firstMessageIdea": "Generated First Message Idea",
  "slots": {
    "Field Name 1": "Generated Content 1",
    "Field Name 2": "Generated Content 2"
  }
}

Fields to generate:
${slotsPrompt}
`;

  if (styleGuide) {
    prompt += `\n\nFollow this style guide for tone and formatting:\n${styleGuide}`;
  }
  if (templateExample) {
    prompt += `\n\nFollow this template structure:\n${templateExample}`;
  }

  const response = await callAIProvider(
    provider,
    keys,
    prompt,
    "You are an expert character creator. Output only valid JSON.",
    true,
    16384,
    model
  );
  
  try {
    return extractJSON(response) as { name: string; concept: string; firstMessageIdea: string; slots: Record<string, string> };
  } catch (e: any) {
    console.error("Failed to parse vibe forge JSON:", response);
    console.error("Parse error:", e);
    throw new Error(`Failed to parse generated character details: ${e.message}`);
  }
}

export async function autoFillSlots(
  provider: AIProvider,
  keys: ApiKeys,
  name: string,
  concept: string,
  slots: { name: string; description: string; value: string }[],
  model?: string,
  templateExample?: string,
  styleGuide?: string,
  vibePrompt?: string
): Promise<Record<string, string>> {
  const emptySlots = slots.filter(s => !s.value.trim());
  if (emptySlots.length === 0) return {};

  const filledSlots = slots.filter(s => s.value.trim());
  const filledContext = filledSlots.map(s => `${s.name}: ${s.value}`).join("\n");
  const slotsPrompt = emptySlots.map(s => `- ${s.name}: ${s.description}`).join("\n");

  let prompt = `You are an expert character creator. I am building a character named "${name}" with the core concept/archetype of "${concept}".

Please generate appropriate content for the following character fields.
Return ONLY a valid JSON object where the keys are the exact field names and the values are the generated content. Do not include any markdown formatting or other text.
IMPORTANT: Ensure all string values are properly escaped for JSON. Use \\n for newlines and \\" for quotes within strings. Do NOT use unescaped newlines or control characters inside string values.
${vibePrompt ? `\nADDITIONAL INSTRUCTIONS / VIBE FOR THESE TRAITS:\n"${vibePrompt}"\n` : ""}
${filledContext ? `\nALREADY FILLED DETAILS (use these for context and consistency):\n${filledContext}\n` : ""}
FIELDS TO FILL:
${slotsPrompt}`;

  if (styleGuide) {
    prompt += `\n\nSTYLE GUIDE (follow this guide's tone, prose style, and writing conventions when generating content):\n${styleGuide}`;
  }

  if (templateExample) {
    prompt += `\n\nEXAMPLE OF FILLED TEMPLATE (Use this as a strict reference for formatting, tone, length, and level of detail for these fields):\n${templateExample}`;
  }

  const responseText = await callAIProvider(
    provider,
    keys,
    prompt,
    "You are an expert character creator. Output only valid JSON.",
    true,
    8192,
    model
  );

  try {
    return extractJSON(responseText) as Record<string, string>;
  } catch (e: any) {
    console.error("Failed to parse auto-fill response:", responseText);
    console.error("Parse error:", e);
    return {};
  }
}

export async function suggestArchetype(
  provider: AIProvider,
  keys: ApiKeys,
  traits: string,
  model?: string
): Promise<string> {
  const prompt = `Based on the following character traits and details, suggest a short, punchy archetype name (e.g., "The Cold CEO", "The Grumpy Bodyguard", "The Golden Retriever Boyfriend"). Return ONLY the archetype name as a plain string, with no quotes or extra text.

CHARACTER TRAITS:
${traits}`;

  try {
    const responseText = await callAIProvider(
      provider,
      keys,
      prompt,
      "You are an expert character creator.",
      false,
      100,
      model
    );
    return responseText.trim() || "The Mysterious Stranger";
  } catch (error) {
    console.error("Error suggesting archetype:", error);
    return "The Mysterious Stranger";
  }
}

export async function mergeStyleGuides(
  provider: AIProvider,
  keys: ApiKeys,
  guides: string[],
  model?: string
): Promise<string> {
  const guidesData = guides.map((g, i) => `--- Guide ${i + 1} ---\n${g}`).join("\n\n");
  const prompt = `Here are multiple style guides:\n\n${guidesData}\n\nPlease merge them into a single, cohesive, comprehensive style guide that combines the insights, patterns, and formatting rules from all of them. Maintain the same 14-section structure as requested before. Ensure the final output is well-organized and eliminates redundancies while preserving unique details from each guide.`;

  return callAIProvider(provider, keys, prompt, SYSTEM_PROMPT, false, 16000, model);
}

export async function generateImagePrompt(
  provider: AIProvider,
  keys: ApiKeys,
  characterDetails: string,
  model?: string
): Promise<string> {
  const prompt = `Based on the following character details, generate a highly detailed, descriptive prompt suitable for an AI image generator like Midjourney (Niji journey) or Stable Diffusion.
Focus heavily on physical appearance, clothing, colors, lighting, pose, and background/setting.
Do not include any conversational text. Return ONLY the raw prompt string.

CHARACTER DETAILS:
${characterDetails}`;

  return callAIProvider(provider, keys, prompt, "You are an expert AI image prompt engineer.", false, 1000, model);
}

export async function suggestThemeSong(
  provider: AIProvider,
  keys: ApiKeys,
  card: any,
  model?: string
): Promise<{ title: string; artist: string; reason: string }> {
  const prompt = `Based on the following character card, suggest a fitting theme song for this character.
Return ONLY a valid JSON object with the following structure, and no markdown formatting or other text.
IMPORTANT: Ensure all string values are properly escaped for JSON. Use \\n for newlines and \\" for quotes within strings.
{
  "title": "Song Title",
  "artist": "Artist Name",
  "reason": "A short 1-2 sentence explanation of why this song fits the character's personality, background, or vibe."
}

Character Card:
${JSON.stringify(card, null, 2)}`;

  const response = await callAIProvider(provider, keys, prompt, "You are a music supervisor and character analyst.", true, 500, model);
  
  try {
    const parsed = extractJSON(response) as any;
    return {
      title: parsed.title || "Unknown Title",
      artist: parsed.artist || "Unknown Artist",
      reason: parsed.reason || "No reason provided."
    };
  } catch (e) {
    console.error("Failed to parse theme song JSON:", response);
    throw new Error("Failed to generate a valid theme song suggestion.");
  }
}

export async function generateCharacterImage(
  keys: ApiKeys,
  prompt: string,
  model: string = "gemini-3.1-flash-image-preview",
  aspectRatio: string = "3:4",
  imageSize: string = "1K",
  style: string = "",
  referenceImagesBase64: string[] = []
): Promise<string> {
  try {
    const ai = new GoogleGenAI({ apiKey: keys.gemini || process.env.GEMINI_API_KEY || "dummy" });
    
    let finalPrompt = prompt;
    if (style && style !== "None") {
      finalPrompt = `${prompt}, ${style} style, highly detailed, masterpiece`;
    }

    const config: any = {
      imageConfig: {
        aspectRatio: aspectRatio,
      }
    };

    if (model === "gemini-3.1-flash-image-preview") {
      config.imageConfig.imageSize = imageSize;
    }

    const parts: any[] = [{ text: finalPrompt }];
    
    for (const refImage of referenceImagesBase64) {
      const mimeType = refImage.match(/data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+).*,.*/)?.[1] || "image/jpeg";
      const base64Data = refImage.split(",")[1];
      if (base64Data) {
        parts.push({
          inlineData: {
            data: base64Data,
            mimeType: mimeType,
          }
        });
      }
    }

    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: parts,
      },
      config
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        const base64EncodeString: string = part.inlineData.data;
        return `data:image/png;base64,${base64EncodeString}`;
      }
    }
    throw new Error("No image data returned from the model.");
  } catch (err) {
    console.error("Image generation failed:", err);
    throw err;
  }
}
