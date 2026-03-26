import React from 'react';
import { Label } from './ui/label';
import { AIProvider, AIModel } from '../lib/api';

interface ModelSelectorProps {
  sectionId: string;
  globalProvider: AIProvider;
  globalModels: Record<string, string>;
  sectionConfigs: Record<string, { provider: AIProvider; model: string }>;
  setSectionConfigs: React.Dispatch<React.SetStateAction<Record<string, { provider: AIProvider; model: string }>>>;
  availableModels: Record<string, AIModel[]>;
  isFetchingModels: Record<string, boolean>;
}

export function ModelSelector({
  sectionId,
  globalProvider,
  globalModels,
  sectionConfigs,
  setSectionConfigs,
  availableModels,
  isFetchingModels
}: ModelSelectorProps) {
  const config = sectionConfigs[sectionId];
  const currentProvider = config?.provider || globalProvider;
  const currentModel = config?.model || globalModels[currentProvider] || "";

  const handleProviderChange = (p: AIProvider) => {
    setSectionConfigs(prev => ({
      ...prev,
      [sectionId]: {
        provider: p,
        model: globalModels[p] || (availableModels[p]?.[0]?.id || "")
      }
    }));
  };

  const handleModelChange = (m: string) => {
    setSectionConfigs(prev => ({
      ...prev,
      [sectionId]: {
        provider: currentProvider,
        model: m
      }
    }));
  };

  return (
    <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 items-center">
      <div className="flex items-center gap-2">
        <Label className="text-slate-700 font-medium text-xs uppercase tracking-wider whitespace-nowrap">Provider</Label>
        <select
          value={currentProvider}
          onChange={(e) => handleProviderChange(e.target.value as AIProvider)}
          className="h-9 rounded-md border-[#e5e4e2] focus-visible:ring-[#8B3A3A] px-2 border bg-white text-sm transition-all"
        >
          <option value="gemini">Google Gemini</option>
          <option value="anthropic">Anthropic Claude</option>
          <option value="openai">OpenAI</option>
          <option value="openrouter">OpenRouter</option>
          <option value="custom">Custom Endpoint</option>
        </select>
      </div>
      <div className="flex items-center gap-2">
        <Label className="text-slate-700 font-medium text-xs uppercase tracking-wider whitespace-nowrap">Model</Label>
        <select
          value={currentModel}
          onChange={(e) => handleModelChange(e.target.value)}
          disabled={isFetchingModels[currentProvider] || !availableModels[currentProvider] || availableModels[currentProvider].length === 0}
          className="h-9 rounded-md border-[#e5e4e2] focus-visible:ring-[#8B3A3A] px-2 border bg-white text-sm transition-all disabled:opacity-50 max-w-[200px] truncate"
        >
          {isFetchingModels[currentProvider] ? (
            <option value="">Loading models...</option>
          ) : availableModels[currentProvider]?.length > 0 ? (
            <>
              <option value="">Select a model...</option>
              {availableModels[currentProvider].map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </>
          ) : (
            <option value="">No models available</option>
          )}
        </select>
      </div>
    </div>
  );
}
