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

export async function generateStyleGuide(
  provider: AIProvider,
  keys: ApiKeys,
  cards: CharacterCard[]
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

  try {
    switch (provider) {
      case "gemini": {
        const ai = new GoogleGenAI({ apiKey: keys.gemini || process.env.GEMINI_API_KEY });
        const response = await ai.models.generateContent({
          model: "gemini-3.1-pro-preview",
          contents: prompt,
          config: {
            systemInstruction: SYSTEM_PROMPT,
          },
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
            model: "claude-3-opus-20240229",
            max_tokens: 4000,
            system: SYSTEM_PROMPT,
            messages: [{ role: "user", content: prompt }],
          }),
        });
        if (!res.ok) throw new Error(`Anthropic API error: ${res.statusText}`);
        const data = await res.json();
        return data.content[0].text;
      }
      case "openai": {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${keys.openai}`,
          },
          body: JSON.stringify({
            model: "gpt-4-turbo-preview",
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: prompt }
            ],
          }),
        });
        if (!res.ok) throw new Error(`OpenAI API error: ${res.statusText}`);
        const data = await res.json();
        return data.choices[0].message.content;
      }
      case "openrouter": {
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${keys.openrouter}`,
            "HTTP-Referer": window.location.href,
            "X-Title": "SillyTavern Style Guide Generator",
          },
          body: JSON.stringify({
            model: "anthropic/claude-3-opus",
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: prompt }
            ],
          }),
        });
        if (!res.ok) throw new Error(`OpenRouter API error: ${res.statusText}`);
        const data = await res.json();
        return data.choices[0].message.content;
      }
      case "custom": {
        const res = await fetch(keys.customEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${keys.customKey}`,
          },
          body: JSON.stringify({
            model: "default",
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: prompt }
            ],
          }),
        });
        if (!res.ok) throw new Error(`Custom API error: ${res.statusText}`);
        const data = await res.json();
        return data.choices[0].message.content;
      }
      default:
        throw new Error("Unknown provider");
    }
  } catch (error) {
    console.error("Error generating style guide:", error);
    throw error;
  }
}

export async function generateCharacterCard(
  provider: AIProvider,
  keys: ApiKeys,
  styleGuide: string,
  slots: { name: string; value: string }[]
): Promise<CharacterCard> {
  const detailsStr = slots.map(s => `${s.name}: ${s.value}`).join("\n");
  const prompt = `You are an expert character creator for roleplay.
Using the following Style Guide, create a character card that STRICTLY adheres to its formatting, tone, and structural rules.

STYLE GUIDE:
${styleGuide}

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

  try {
    switch (provider) {
      case "gemini": {
        const ai = new GoogleGenAI({ apiKey: keys.gemini || process.env.GEMINI_API_KEY });
        const response = await ai.models.generateContent({
          model: "gemini-3.1-pro-preview",
          contents: prompt,
          config: {
            systemInstruction: "You are an expert character creator. Output only valid JSON.",
            responseMimeType: "application/json",
          },
        });
        return parseResponse(response.text || "{}");
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
            model: "claude-3-opus-20240229",
            max_tokens: 4000,
            system: "You are an expert character creator. Output only valid JSON.",
            messages: [{ role: "user", content: prompt }],
          }),
        });
        if (!res.ok) throw new Error(`Anthropic API error: ${res.statusText}`);
        const data = await res.json();
        return parseResponse(data.content[0].text);
      }
      case "openai": {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${keys.openai}`,
          },
          body: JSON.stringify({
            model: "gpt-4-turbo-preview",
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: "You are an expert character creator. Output only valid JSON." },
              { role: "user", content: prompt }
            ],
          }),
        });
        if (!res.ok) throw new Error(`OpenAI API error: ${res.statusText}`);
        const data = await res.json();
        return parseResponse(data.choices[0].message.content);
      }
      case "openrouter": {
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${keys.openrouter}`,
            "HTTP-Referer": window.location.href,
            "X-Title": "SillyTavern Style Guide Generator",
          },
          body: JSON.stringify({
            model: "anthropic/claude-3-opus",
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: "You are an expert character creator. Output only valid JSON." },
              { role: "user", content: prompt }
            ],
          }),
        });
        if (!res.ok) throw new Error(`OpenRouter API error: ${res.statusText}`);
        const data = await res.json();
        return parseResponse(data.choices[0].message.content);
      }
      case "custom": {
        const res = await fetch(keys.customEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${keys.customKey}`,
          },
          body: JSON.stringify({
            model: "default",
            messages: [
              { role: "system", content: "You are an expert character creator. Output only valid JSON." },
              { role: "user", content: prompt }
            ],
          }),
        });
        if (!res.ok) throw new Error(`Custom API error: ${res.statusText}`);
        const data = await res.json();
        return parseResponse(data.choices[0].message.content);
      }
      default:
        throw new Error("Unknown provider");
    }
  } catch (error) {
    console.error("Error generating character card:", error);
    throw error;
  }
}

export async function extractSlotsFromGuide(
  provider: AIProvider,
  keys: ApiKeys,
  styleGuide: string
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
    switch (provider) {
      case "gemini": {
        const ai = new GoogleGenAI({ apiKey: keys.gemini || process.env.GEMINI_API_KEY });
        const response = await ai.models.generateContent({
          model: "gemini-3.1-pro-preview",
          contents: prompt,
          config: {
            systemInstruction: "You are an expert character creator. Output only valid JSON.",
            responseMimeType: "application/json",
          },
        });
        return parseResponse(response.text || "[]");
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
            model: "claude-3-opus-20240229",
            max_tokens: 4000,
            system: "You are an expert character creator. Output only valid JSON.",
            messages: [{ role: "user", content: prompt }],
          }),
        });
        if (!res.ok) throw new Error(`Anthropic API error: ${res.statusText}`);
        const data = await res.json();
        return parseResponse(data.content[0].text);
      }
      case "openai": {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${keys.openai}`,
          },
          body: JSON.stringify({
            model: "gpt-4-turbo-preview",
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: "You are an expert character creator. Output only valid JSON." },
              { role: "user", content: prompt }
            ],
          }),
        });
        if (!res.ok) throw new Error(`OpenAI API error: ${res.statusText}`);
        const data = await res.json();
        return parseResponse(data.choices[0].message.content);
      }
      case "openrouter": {
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${keys.openrouter}`,
            "HTTP-Referer": window.location.href,
            "X-Title": "SillyTavern Style Guide Generator",
          },
          body: JSON.stringify({
            model: "anthropic/claude-3-opus",
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: "You are an expert character creator. Output only valid JSON." },
              { role: "user", content: prompt }
            ],
          }),
        });
        if (!res.ok) throw new Error(`OpenRouter API error: ${res.statusText}`);
        const data = await res.json();
        return parseResponse(data.choices[0].message.content);
      }
      case "custom": {
        const res = await fetch(keys.customEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${keys.customKey}`,
          },
          body: JSON.stringify({
            model: "default",
            messages: [
              { role: "system", content: "You are an expert character creator. Output only valid JSON." },
              { role: "user", content: prompt }
            ],
          }),
        });
        if (!res.ok) throw new Error(`Custom API error: ${res.statusText}`);
        const data = await res.json();
        return parseResponse(data.choices[0].message.content);
      }
      default:
        throw new Error("Unknown provider");
    }
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

export async function suggestArchetype(
  provider: AIProvider,
  keys: ApiKeys,
  traits: string
): Promise<string> {
  const prompt = `Based on the following character traits and details, suggest a short, punchy archetype name (e.g., "The Cold CEO", "The Grumpy Bodyguard", "The Golden Retriever Boyfriend"). Return ONLY the archetype name as a plain string, with no quotes or extra text.

CHARACTER TRAITS:
${traits}`;

  try {
    switch (provider) {
      case "gemini": {
        const ai = new GoogleGenAI({ apiKey: keys.gemini || process.env.GEMINI_API_KEY });
        const response = await ai.models.generateContent({
          model: "gemini-3.1-pro-preview",
          contents: prompt,
        });
        return response.text?.trim() || "The Mysterious Stranger";
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
            model: "claude-3-opus-20240229",
            max_tokens: 100,
            messages: [{ role: "user", content: prompt }],
          }),
        });
        if (!res.ok) throw new Error(`Anthropic API error: ${res.statusText}`);
        const data = await res.json();
        return data.content[0].text.trim();
      }
      case "openai": {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${keys.openai}`,
          },
          body: JSON.stringify({
            model: "gpt-4-turbo-preview",
            messages: [{ role: "user", content: prompt }],
          }),
        });
        if (!res.ok) throw new Error(`OpenAI API error: ${res.statusText}`);
        const data = await res.json();
        return data.choices[0].message.content.trim();
      }
      case "openrouter": {
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${keys.openrouter}`,
            "HTTP-Referer": window.location.href,
            "X-Title": "SillyTavern Style Guide Generator",
          },
          body: JSON.stringify({
            model: "anthropic/claude-3-opus",
            messages: [{ role: "user", content: prompt }],
          }),
        });
        if (!res.ok) throw new Error(`OpenRouter API error: ${res.statusText}`);
        const data = await res.json();
        return data.choices[0].message.content.trim();
      }
      case "custom": {
        const res = await fetch(keys.customEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${keys.customKey}`,
          },
          body: JSON.stringify({
            model: "default",
            messages: [{ role: "user", content: prompt }],
          }),
        });
        if (!res.ok) throw new Error(`Custom API error: ${res.statusText}`);
        const data = await res.json();
        return data.choices[0].message.content.trim();
      }
      default:
        return "The Mysterious Stranger";
    }
  } catch (error) {
    console.error("Error suggesting archetype:", error);
    return "The Mysterious Stranger";
  }
}

export async function mergeStyleGuides(
  provider: AIProvider,
  keys: ApiKeys,
  guides: string[]
): Promise<string> {
  const guidesData = guides.map((g, i) => `--- Guide ${i + 1} ---\n${g}`).join("\n\n");
  const prompt = `Here are multiple style guides:\n\n${guidesData}\n\nPlease merge them into a single, cohesive, comprehensive style guide that combines the insights, patterns, and formatting rules from all of them. Maintain the same 14-section structure as requested before. Ensure the final output is well-organized and eliminates redundancies while preserving unique details from each guide.`;

  try {
    switch (provider) {
      case "gemini": {
        const ai = new GoogleGenAI({ apiKey: keys.gemini || process.env.GEMINI_API_KEY });
        const response = await ai.models.generateContent({
          model: "gemini-3.1-pro-preview",
          contents: prompt,
          config: {
            systemInstruction: SYSTEM_PROMPT,
          },
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
            model: "claude-3-opus-20240229",
            max_tokens: 4000,
            system: SYSTEM_PROMPT,
            messages: [{ role: "user", content: prompt }],
          }),
        });
        if (!res.ok) throw new Error(`Anthropic API error: ${res.statusText}`);
        const data = await res.json();
        return data.content[0].text;
      }
      case "openai": {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${keys.openai}`,
          },
          body: JSON.stringify({
            model: "gpt-4-turbo-preview",
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: prompt }
            ],
          }),
        });
        if (!res.ok) throw new Error(`OpenAI API error: ${res.statusText}`);
        const data = await res.json();
        return data.choices[0].message.content;
      }
      case "openrouter": {
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${keys.openrouter}`,
            "HTTP-Referer": window.location.href,
            "X-Title": "SillyTavern Style Guide Generator",
          },
          body: JSON.stringify({
            model: "anthropic/claude-3-opus",
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: prompt }
            ],
          }),
        });
        if (!res.ok) throw new Error(`OpenRouter API error: ${res.statusText}`);
        const data = await res.json();
        return data.choices[0].message.content;
      }
      case "custom": {
        const res = await fetch(keys.customEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${keys.customKey}`,
          },
          body: JSON.stringify({
            model: "default",
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: prompt }
            ],
          }),
        });
        if (!res.ok) throw new Error(`Custom API error: ${res.statusText}`);
        const data = await res.json();
        return data.choices[0].message.content;
      }
      default:
        throw new Error("Unknown provider");
    }
  } catch (error) {
    console.error("Error merging style guides:", error);
    throw error;
  }
}
