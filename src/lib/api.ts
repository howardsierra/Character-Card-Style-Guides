import { GoogleGenAI } from "@google/genai";
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
          { id: "gemini-2.5-flash-preview", name: "Gemini 2.5 Flash Preview" }
        ];
        if (!key) return defaultModels;
        try {
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
          if (!res.ok) throw new Error("Failed to fetch Gemini models");
          const data = await res.json();
          return data.models
            .filter((m: any) => m.supportedGenerationMethods.includes("generateContent"))
            .map((m: any) => ({
              id: m.name.replace("models/", ""),
              name: m.displayName || m.name.replace("models/", "")
            }));
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
        const baseUrl = keys.customEndpoint.replace(/\/chat\/completions\/?$/, "");
        const res = await fetch(`${baseUrl}/models`, {
          headers: { "Authorization": `Bearer ${keys.customKey}` }
        });
        if (!res.ok) throw new Error("Failed to fetch Custom models");
        const data = await res.json();
        return data.data.map((m: any) => ({ id: m.id, name: m.id }));
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
        { id: "gemini-2.5-flash-preview", name: "Gemini 2.5 Flash Preview" }
      ];
    }
    return [];
  }
}

const SYSTEM_PROMPT = `You are an expert literary analyst and character designer. Your task is to analyze a collection of character cards (from the same creator) and generate a comprehensive writing style guide that captures their unique authorial voice, formatting, and structural DNA.

The output MUST be formatted as a Markdown document that closely matches the structure and sections of the "Elysiansyna Style Guide" example.

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
  maxTokens: number = 4000,
  model?: string
): Promise<string> {
  try {
    switch (provider) {
      case "gemini": {
        const ai = new GoogleGenAI({ apiKey: keys.gemini || process.env.GEMINI_API_KEY });
        const config: any = {
          systemInstruction: systemPrompt,
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
            max_tokens: maxTokens,
            system: systemPrompt,
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
        const body: any = {
          model: model || "gpt-4-turbo-preview",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt }
          ],
        };
        if (jsonMode) {
          body.response_format = { type: "json_object" };
        }
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${keys.openai}`,
          },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const errMsg = errData.error?.message || errData.message || res.statusText;
          throw new Error(`OpenAI API error: ${errMsg}`);
        }
        const data = await res.json();
        return data.choices[0].message.content;
      }
      case "openrouter": {
        const body: any = {
          model: model || "anthropic/claude-3-opus",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt }
          ],
        };
        if (jsonMode) {
          body.response_format = { type: "json_object" };
        }
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
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const errMsg = errData.error?.message || errData.message || res.statusText;
          throw new Error(`OpenRouter API error: ${errMsg}`);
        }
        const data = await res.json();
        return data.choices[0].message.content;
      }
      case "custom": {
        const body: any = {
          model: model || "default",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt }
          ],
        };
        const res = await fetch(keys.customEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${keys.customKey}`,
          },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const errMsg = errData.error?.message || errData.message || res.statusText;
          throw new Error(`Custom API error: ${errMsg}`);
        }
        const data = await res.json();
        return data.choices[0].message.content;
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

  return callAIProvider(provider, keys, prompt, SYSTEM_PROMPT, false, 4000, model);
}

export async function generateCharacterCard(
  provider: AIProvider,
  keys: ApiKeys,
  styleGuide: string,
  slots: { name: string; value: string }[],
  template?: string,
  model?: string
): Promise<CharacterCard> {
  const detailsStr = slots.map(s => `${s.name}: ${s.value}`).join("\n");
  
  let prompt = `You are an expert character creator for roleplay.\n`;
  if (template) {
    prompt += `Using the following Style Guide for tone and prose, create a character card that STRICTLY adheres to the formatting and structural rules of the provided TEMPLATE.\n\nTEMPLATE:\n${template}\n\nSTYLE GUIDE:\n${styleGuide}\n`;
  } else {
    prompt += `Using the following Style Guide, create a character card that STRICTLY adheres to its formatting, tone, and structural rules.\n\nSTYLE GUIDE:\n${styleGuide}\n`;
  }

  prompt += `
CHARACTER DETAILS:
${detailsStr}

OUTPUT FORMAT:
You MUST output ONLY valid JSON matching this structure. Do not include any other text, explanations, or markdown formatting outside the JSON object.
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
      const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      const jsonStr = match ? match[1] : text;
      return JSON.parse(jsonStr.trim());
    } catch (e) {
      console.error("Failed to parse AI response as JSON:", text);
      throw new Error("AI did not return valid JSON.");
    }
  };

  const responseText = await callAIProvider(
    provider,
    keys,
    prompt,
    "You are an expert character creator. Output only valid JSON.",
    true,
    4000,
    model
  );
  return parseResponse(responseText);
}

export async function extractSlotsFromTemplate(
  provider: AIProvider,
  keys: ApiKeys,
  templateContent: string,
  model?: string
): Promise<{ name: string; description: string }[]> {
  const prompt = `Analyze the following Character Card Template and extract the required and optional sections/slots that a user should fill out to create a character card using this template.
Return ONLY a JSON array of objects, where each object has a "name" (the name of the slot/field) and a "description" (a brief explanation of what should go in this field based on the template).
Do not include fields that are generated by the AI (like First Message, Example Messages, etc.).
Do NOT include "Name" or "Core Concept/Archetype" as these are already provided by default. Only include the remaining detail fields (e.g., Background, Scenario, Appearance, Personality Traits, etc.).

TEMPLATE:
${templateContent}`;

  const parseResponse = (text: string) => {
    try {
      const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      const jsonStr = match ? match[1] : text;
      return JSON.parse(jsonStr.trim());
    } catch (e) {
      console.error("Failed to parse AI response as JSON:", text);
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

export async function extractSlotsFromGuide(
  provider: AIProvider,
  keys: ApiKeys,
  styleGuide: string,
  model?: string
): Promise<{ name: string; description: string }[]> {
  const prompt = `Analyze the following Style Guide and extract the required and optional sections/slots that a user should fill out to create a character card using this guide.
Return ONLY a JSON array of objects, where each object has a "name" (the name of the slot/field) and a "description" (a brief explanation of what should go in this field based on the guide).
Do not include fields that are generated by the AI (like First Message, Example Messages, etc.).
Do NOT include "Name" or "Core Concept/Archetype" as these are already provided by default. Only include the remaining detail fields (e.g., Background, Scenario, Appearance, Personality Traits, etc.).

STYLE GUIDE:
${styleGuide}`;

  const parseResponse = (text: string) => {
    try {
      const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      const jsonStr = match ? match[1] : text;
      return JSON.parse(jsonStr.trim());
    } catch (e) {
      console.error("Failed to parse AI response as JSON:", text);
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
      "You are an expert character creator. Output only valid JSON.",
      true,
      4000,
      model
    );
    return parseResponse(responseText);
  } catch (error) {
    console.error("Error extracting slots:", error);
    return [
      { name: "Name", description: "The character's name." },
      { name: "Core Concept", description: "The archetype or main idea." },
      { name: "Background", description: "The character's history and lore." },
      { name: "Scenario", description: "The current situation or dynamic." }
    ];
  }
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

export async function extractUniverse(
  provider: AIProvider,
  keys: ApiKeys,
  styleGuide: string,
  model?: string
): Promise<UniverseData> {
  const prompt = `Analyze the following Style Guide, specifically looking for sections like "Relationship & Supporting Cast Writing" or "The NPC-to-Protagonist Pipeline" or "Shared Universes".
Extract all mentioned characters and their relationships, as well as the "pipeline" progression (e.g., Character A was an NPC in Character B's story, then got their own card).

Return ONLY a valid JSON object with two arrays: "nodes" and "links".
- "nodes" should be an array of objects: { "id": "unique_id", "name": "Character Name", "group": "Universe/Group Name", "description": "Short description" }
- "links" should be an array of objects: { "source": "source_node_id", "target": "target_node_id", "type": "relationship" or "pipeline", "label": "Short description of link" }

For "pipeline" links, the source is the original character/card where they appeared as an NPC, and the target is the character who was promoted.
For "relationship" links, it's just a connection between two characters in the same universe.

STYLE GUIDE:
${styleGuide}`;

  const parseResponse = (text: string): UniverseData => {
    try {
      const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      const jsonStr = match ? match[1] : text;
      return JSON.parse(jsonStr.trim());
    } catch (e) {
      console.error("Failed to parse AI response as JSON:", text);
      return { nodes: [], links: [] };
    }
  };

  try {
    if (provider === "gemini") {
      const ai = new GoogleGenAI({ apiKey: keys.gemini || "dummy" });
      const response = await ai.models.generateContent({
        model: model || "gemini-3.1-flash-preview",
        contents: prompt,
        config: { responseMimeType: "application/json" }
      });
      return parseResponse(response.text || "");
    } else if (provider === "anthropic") {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": keys.anthropic,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify({
          model: model || "claude-3-5-sonnet-20240620",
          max_tokens: 4000,
          messages: [{ role: "user", content: prompt }]
        })
      });
      const data = await response.json();
      return parseResponse(data.content[0].text);
    } else if (provider === "openai") {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${keys.openai}`
        },
        body: JSON.stringify({
          model: model || "gpt-4o",
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" }
        })
      });
      const data = await response.json();
      return parseResponse(data.choices[0].message.content);
    } else if (provider === "openrouter") {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${keys.openrouter}`
        },
        body: JSON.stringify({
          model: model || "anthropic/claude-3.5-sonnet",
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" }
        })
      });
      const data = await response.json();
      return parseResponse(data.choices[0].message.content);
    } else if (provider === "custom") {
      const response = await fetch(keys.customEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${keys.customKey}`
        },
        body: JSON.stringify({
          model: model || "",
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" }
        })
      });
      const data = await response.json();
      return parseResponse(data.choices[0].message.content);
    }
    return { nodes: [], links: [] };
  } catch (error) {
    console.error("Error extracting universe:", error);
    return { nodes: [], links: [] };
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

  return callAIProvider(provider, keys, prompt, SYSTEM_PROMPT, false, 4000, model);
}
