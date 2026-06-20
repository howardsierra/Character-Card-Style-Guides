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
  allowedProviders?: AIProvider[];
  filterModels?: (model: AIModel) => boolean;
}

const ALL_PROVIDERS: { id: AIProvider; name: string }[] = [
  { id: "gemini", name: "Google Gemini" },
  { id: "anthropic", name: "Anthropic Claude" },
  { id: "openai", name: "OpenAI" },
  { id: "openrouter", name: "OpenRouter" },
  { id: "custom", name: "Custom Endpoint" }
];

export function ModelSelector({
  sectionId,
  globalProvider,
  globalModels,
  sectionConfigs,
  setSectionConfigs,
  availableModels,
  isFetchingModels,
  allowedProviders,
  filterModels
}: ModelSelectorProps) {
  const config = sectionConfigs[sectionId];
  
  // Ensure the current provider is allowed
  let currentProvider = config?.provider || globalProvider;
  if (allowedProviders && !allowedProviders.includes(currentProvider)) {
    currentProvider = allowedProviders[0];
  }

  let modelsToShow = availableModels[currentProvider] || [];
  if (filterModels) {
    modelsToShow = modelsToShow.filter(filterModels);
  }

  let currentModel = config?.model || globalModels[currentProvider] || "";
  if (modelsToShow.length > 0 && !modelsToShow.some(m => m.id === currentModel)) {
    currentModel = modelsToShow[0].id;
  }

  const handleProviderChange = (p: AIProvider) => {
    const newModelsToShow = availableModels[p] ? (filterModels ? availableModels[p].filter(filterModels) : availableModels[p]) : [];
    setSectionConfigs(prev => ({
      ...prev,
      [sectionId]: {
        provider: p,
        model: globalModels[p] || (newModelsToShow[0]?.id || "")
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

  const providersToShow = allowedProviders 
    ? ALL_PROVIDERS.filter(p => allowedProviders.includes(p.id))
    : ALL_PROVIDERS;

  return (
    <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 items-start sm:items-center w-full sm:w-auto">
      <div className="flex items-center gap-2 w-full sm:w-auto">
        <Label className="text-slate-700 font-medium text-xs uppercase tracking-wider whitespace-nowrap min-w-[60px]">Provider</Label>
        <select
          value={currentProvider}
          onChange={(e) => handleProviderChange(e.target.value as AIProvider)}
          className="h-9 rounded-md border-[#e5e4e2] focus-visible:ring-[#8B3A3A] px-2 border bg-white text-sm transition-all w-full sm:w-auto"
        >
          {providersToShow.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2 w-full sm:w-auto">
        <Label className="text-slate-700 font-medium text-xs uppercase tracking-wider whitespace-nowrap min-w-[60px]">Model</Label>
        <select
          value={currentModel}
          onChange={(e) => handleModelChange(e.target.value)}
          disabled={isFetchingModels[currentProvider] || modelsToShow.length === 0}
          className="h-9 rounded-md border-[#e5e4e2] focus-visible:ring-[#8B3A3A] px-2 border bg-white text-sm transition-all disabled:opacity-50 w-full sm:max-w-[200px] truncate"
        >
          {isFetchingModels[currentProvider] ? (
            <option value="">Loading models...</option>
          ) : modelsToShow.length > 0 ? (
            <>
              <option value="">Select a model...</option>
              {modelsToShow.map(m => (
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
