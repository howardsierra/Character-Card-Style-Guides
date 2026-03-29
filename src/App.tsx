import { useState, useEffect, useRef } from "react";
import { Upload, Settings, FileText, Download, Merge, Trash2, Plus, Check, Loader2, BookOpen, Wand2, Info, Pencil, History, Save, X, Network, FileJson, Image as ImageIcon, Undo2, Redo2, Moon, Sun } from "lucide-react";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import { Textarea } from "./components/ui/textarea";
import { ScrollArea } from "./components/ui/scroll-area";
import { Checkbox } from "./components/ui/checkbox";
import { cn } from "./lib/utils";
import { CharacterCard, parseFile, parsePdfToText, parseDocxToText } from "./lib/parser";
import { AIProvider, ApiKeys, AIModel, fetchModels, generateStyleGuide, mergeStyleGuides, generateCharacterCard, extractSlotsFromGuide, suggestArchetype, extractUniverse, UniverseData } from "./lib/api";
import { DEFAULT_GUIDE_CONTENT } from "./lib/defaultGuide";
import { CardTemplate, DEFAULT_TEMPLATES } from "./lib/templates";
import ReactMarkdown from "react-markdown";
import { motion, AnimatePresence } from "motion/react";
import { toPng } from "html-to-image";
import html2pdf from "html2pdf.js";
import UniverseMap from "./components/UniverseMap";
import { ModelSelector } from "./components/ModelSelector";
import { useHistory } from "./hooks/useHistory";

type ViewState = "upload" | "generate" | "saved" | "create" | "universe" | "image" | "settings";
const APP_AUTOSAVE_KEY = "st_app_autosave_v1";

interface GuideVersion {
  id: string;
  content: string;
  date: string;
}

interface SavedGuide {
  id: string;
  title: string;
  content: string;
  date: string;
  versions?: GuideVersion[];
}

interface SavedCard {
  id: string;
  name: string;
  concept: string;
  card: CharacterCard;
  date: string;
}

function InfoTooltip({ text }: { text: string }) {
  return (
    <div className="group relative inline-flex items-center ml-1.5 align-middle">
      <Info className="w-4 h-4 text-slate-400 hover:text-[#8B3A3A] transition-colors cursor-help" />
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-slate-800 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 shadow-xl pointer-events-none font-normal leading-relaxed text-left">
        {text}
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
      </div>
    </div>
  );
}

function NavButton({ view, icon: Icon, label, currentView, setView }: any) {
  const isActive = currentView === view;
  return (
    <button
      onClick={() => setView(view)}
      className={cn(
        "flex-none md:w-full flex items-center gap-2 md:gap-3 px-3 py-2 md:px-4 md:py-3 rounded-xl text-sm font-medium transition-all duration-300",
        isActive 
          ? "bg-white text-[#8B3A3A] shadow-sm border border-[#e5e4e2]" 
          : "text-slate-600 hover:bg-white/50 hover:text-slate-900"
      )}
    >
      <Icon className={cn("w-4 h-4 md:w-5 md:h-5", isActive ? "text-[#8B3A3A]" : "text-slate-400")} />
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}

export default function App() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("theme");
      if (saved === "dark" || saved === "light") return saved;
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return "light";
  });

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  const [view, setView] = useState<ViewState>("upload");
  const [cards, setCards] = useState<CharacterCard[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  
  const [provider, setProvider] = useState<AIProvider>("gemini");
  const [apiKeys, setApiKeys] = useState<ApiKeys>({
    gemini: "",
    anthropic: "",
    openrouter: "",
    openai: "",
    customEndpoint: "",
    customKey: "",
  });

  const [apiModels, setApiModels] = useState<Record<string, string>>({});
  const [sectionConfigs, setSectionConfigs] = useState<Record<string, { provider: AIProvider; model: string }>>({});
  const [availableModels, setAvailableModels] = useState<Record<string, AIModel[]>>({});
  const [isFetchingModels, setIsFetchingModels] = useState<Record<string, boolean>>({});

  const [isGenerating, setIsGenerating] = useState(false);
  const [currentGuide, setCurrentGuide] = useState<string | null>(null);
  const [currentGuideId, setCurrentGuideId] = useState<string | null>(null);
  const [isEditingGuide, setIsEditingGuide] = useState(false);
  const [editedGuideContent, setEditedGuideContent] = useState("");
  const [showVersions, setShowVersions] = useState(false);
  const [guides, setGuides] = useState<SavedGuide[]>([]);
  const [selectedGuides, setSelectedGuides] = useState<Set<string>>(new Set());

  // Universe Map State
  const [universeData, setUniverseData] = useState<UniverseData | null>(null);
  const [isExtractingUniverse, setIsExtractingUniverse] = useState(false);
  const [universeSelectedGuide, setUniverseSelectedGuide] = useState<string>("");
  const [universeSelectedCards, setUniverseSelectedCards] = useState<Set<string>>(new Set());

  const getProviderAndModel = (sectionId: string) => {
    const config = sectionConfigs[sectionId];
    const currentProvider = config?.provider || provider;
    const currentModel = config?.model || apiModels[currentProvider] || "";
    return { currentProvider, currentModel };
  };

  // Card Forge State
  const [forgeState, setForgeState, forgeHistory] = useHistory({
    name: "",
    concept: "",
    slots: [] as { name: string, description: string, value: string }[],
    firstMessageIdea: ""
  });
  const forgeName = forgeState.name;
  const forgeConcept = forgeState.concept;
  const forgeSlots = forgeState.slots;
  const forgeFirstMessageIdea = forgeState.firstMessageIdea || "";
  
  const setForgeName = (name: string) => setForgeState(prev => ({ ...prev, name }));
  const setForgeConcept = (concept: string) => setForgeState(prev => ({ ...prev, concept }));
  const setForgeFirstMessageIdea = (firstMessageIdea: string) => setForgeState(prev => ({ ...prev, firstMessageIdea }));
  const setForgeSlots = (slots: { name: string, description: string, value: string }[] | ((prev: { name: string, description: string, value: string }[]) => { name: string, description: string, value: string }[])) => {
    setForgeState(prev => ({
      ...prev,
      slots: typeof slots === 'function' ? slots(prev.slots) : slots
    }));
  };

  const [forgeSelectedGuide, setForgeSelectedGuide] = useState<string>("");
  const [forgeSelectedTemplate, setForgeSelectedTemplate] = useState<string>("");
  const [customTemplates, setCustomTemplates] = useState<CardTemplate[]>([]);
  const [isForging, setIsForging] = useState(false);
  const [isExtractingSlots, setIsExtractingSlots] = useState(false);
  const [isSuggestingArchetype, setIsSuggestingArchetype] = useState(false);
  const [generatingSlotIndex, setGeneratingSlotIndex] = useState<number | null>(null);
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [showSavedCards, setShowSavedCards] = useState(false);
  
  const [imagePrompt, setImagePrompt] = useState("");
  const [isGeneratingImagePrompt, setIsGeneratingImagePrompt] = useState(false);
  const [characterImage, setCharacterImage] = useState("");
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);

  // Image Studio State
  const [studioImagePrompt, setStudioImagePrompt] = useState("");
  const [isGeneratingStudioPrompt, setIsGeneratingStudioPrompt] = useState(false);
  const [studioCharacterImage, setStudioCharacterImage] = useState("");
  const [isGeneratingStudioImage, setIsGeneratingStudioImage] = useState(false);
  const [studioSelectedCard, setStudioSelectedCard] = useState<string>("");
  const [imageAspectRatio, setImageAspectRatio] = useState("3:4");
  const [imageSize, setImageSize] = useState("1K");
  const [imageStyle, setImageStyle] = useState("None");

  const [forgedCardState, setForgedCardState, forgedCardHistory] = useHistory<CharacterCard | null>(null);
  const forgedCard = forgedCardState;
  const setForgedCard = setForgedCardState;
  const [savedCards, setSavedCards] = useState<SavedCard[]>([]);
  const [hasHydratedAutosave, setHasHydratedAutosave] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const guideRef = useRef<HTMLDivElement>(null);

  // Load saved data
  useEffect(() => {
    const savedKeys = localStorage.getItem("st_style_keys");
    if (savedKeys) setApiKeys(JSON.parse(savedKeys));

    const savedModels = localStorage.getItem("st_style_models");
    if (savedModels) setApiModels(JSON.parse(savedModels));

    const savedSectionConfigs = localStorage.getItem("st_section_configs");
    if (savedSectionConfigs) setSectionConfigs(JSON.parse(savedSectionConfigs));

    const savedProvider = localStorage.getItem("st_style_provider");
    if (savedProvider) setProvider(savedProvider as AIProvider);

    const savedDraft = localStorage.getItem("st_forge_draft");
    if (savedDraft) {
      try {
        const draft = JSON.parse(savedDraft);
        if (draft.forgeName) setForgeName(draft.forgeName);
        if (draft.forgeConcept) setForgeConcept(draft.forgeConcept);
        if (draft.forgeSlots) setForgeSlots(draft.forgeSlots);
        if (draft.forgeSelectedGuide) setForgeSelectedGuide(draft.forgeSelectedGuide);
        if (draft.forgeSelectedTemplate) setForgeSelectedTemplate(draft.forgeSelectedTemplate);
        if (draft.forgeFirstMessageIdea) setForgeFirstMessageIdea(draft.forgeFirstMessageIdea);
      } catch (e) {
        console.error("Failed to load draft", e);
      }
    }

    const savedGuides = localStorage.getItem("st_style_guides");
    if (savedGuides) {
      setGuides(JSON.parse(savedGuides));
    } else {
      setGuides([{
        id: "default-elysiansyna",
        title: "Elysiansyna Complete Style Guide v6.0",
        content: DEFAULT_GUIDE_CONTENT,
        date: new Date().toISOString(),
        versions: []
      }]);
    }

    const savedTemplates = localStorage.getItem("st_custom_templates");
    if (savedTemplates) {
      setCustomTemplates(JSON.parse(savedTemplates));
    }

    const savedCardsData = localStorage.getItem("st_saved_cards");
    if (savedCardsData) {
      setSavedCards(JSON.parse(savedCardsData));
    }

    const savedAppState = localStorage.getItem(APP_AUTOSAVE_KEY);
    if (savedAppState) {
      try {
        const parsed = JSON.parse(savedAppState);
        if (parsed.view) setView(parsed.view);
        if (Array.isArray(parsed.cards)) setCards(parsed.cards);
        if (typeof parsed.currentGuide === "string" || parsed.currentGuide === null) setCurrentGuide(parsed.currentGuide);
        if (typeof parsed.currentGuideId === "string" || parsed.currentGuideId === null) setCurrentGuideId(parsed.currentGuideId);
        if (typeof parsed.isEditingGuide === "boolean") setIsEditingGuide(parsed.isEditingGuide);
        if (typeof parsed.editedGuideContent === "string") setEditedGuideContent(parsed.editedGuideContent);
        if (typeof parsed.showVersions === "boolean") setShowVersions(parsed.showVersions);
        if (Array.isArray(parsed.selectedGuides)) setSelectedGuides(new Set(parsed.selectedGuides));

        if (parsed.universeData) setUniverseData(parsed.universeData);
        if (typeof parsed.universeSelectedGuide === "string") setUniverseSelectedGuide(parsed.universeSelectedGuide);
        if (Array.isArray(parsed.universeSelectedCards)) setUniverseSelectedCards(new Set(parsed.universeSelectedCards));

        if (typeof parsed.showSavedCards === "boolean") setShowSavedCards(parsed.showSavedCards);
        if (typeof parsed.imagePrompt === "string") setImagePrompt(parsed.imagePrompt);
        if (typeof parsed.characterImage === "string") setCharacterImage(parsed.characterImage);
        if (typeof parsed.studioImagePrompt === "string") setStudioImagePrompt(parsed.studioImagePrompt);
        if (typeof parsed.studioCharacterImage === "string") setStudioCharacterImage(parsed.studioCharacterImage);
        if (typeof parsed.studioSelectedCard === "string") setStudioSelectedCard(parsed.studioSelectedCard);
        if (typeof parsed.imageAspectRatio === "string") setImageAspectRatio(parsed.imageAspectRatio);
        if (typeof parsed.imageSize === "string") setImageSize(parsed.imageSize);
        if (typeof parsed.imageStyle === "string") setImageStyle(parsed.imageStyle);
        if (parsed.forgedCard !== undefined) setForgedCard(parsed.forgedCard);
      } catch (e) {
        console.error("Failed to load app autosave", e);
      }
    }

    setHasHydratedAutosave(true);
  }, []);

  // Save keys
  useEffect(() => {
    localStorage.setItem("st_style_keys", JSON.stringify(apiKeys));
  }, [apiKeys]);

  useEffect(() => {
    localStorage.setItem("st_style_models", JSON.stringify(apiModels));
  }, [apiModels]);

  useEffect(() => {
    localStorage.setItem("st_section_configs", JSON.stringify(sectionConfigs));
  }, [sectionConfigs]);

  useEffect(() => {
    localStorage.setItem("st_style_provider", provider);
  }, [provider]);

  useEffect(() => {
    localStorage.setItem("st_style_guides", JSON.stringify(guides));
  }, [guides]);

  // Save drafts
  useEffect(() => {
    const draft = {
      forgeName,
      forgeConcept,
      forgeSlots,
      forgeSelectedGuide,
      forgeSelectedTemplate,
      forgeFirstMessageIdea
    };
    localStorage.setItem("st_forge_draft", JSON.stringify(draft));
  }, [forgeName, forgeConcept, forgeSlots, forgeSelectedGuide, forgeSelectedTemplate, forgeFirstMessageIdea]);

  useEffect(() => {
    if (!hasHydratedAutosave) return;
    const appState = {
      view,
      cards,
      currentGuide,
      currentGuideId,
      isEditingGuide,
      editedGuideContent,
      showVersions,
      selectedGuides: Array.from(selectedGuides),
      universeData,
      universeSelectedGuide,
      universeSelectedCards: Array.from(universeSelectedCards),
      showSavedCards,
      imagePrompt,
      characterImage,
      studioImagePrompt,
      studioCharacterImage,
      studioSelectedCard,
      imageAspectRatio,
      imageSize,
      imageStyle,
      forgedCard
    };

    const writeAutosave = (payload: typeof appState) => {
      localStorage.setItem(APP_AUTOSAVE_KEY, JSON.stringify(payload));
    };

    try {
      writeAutosave(appState);
    } catch (error) {
      console.warn("Autosave exceeded storage quota. Retrying with trimmed image fields.", error);

      const trimmedState = {
        ...appState,
        characterImage: "",
        studioCharacterImage: "",
        cards: appState.cards.map(card => ({ ...card, image: undefined })),
        forgedCard: appState.forgedCard ? { ...appState.forgedCard, image: undefined } : appState.forgedCard
      };

      try {
        writeAutosave(trimmedState);
      } catch (trimmedError) {
        console.error("Autosave failed even after trimming large fields.", trimmedError);
      }
    }
  }, [
    hasHydratedAutosave,
    view,
    cards,
    currentGuide,
    currentGuideId,
    isEditingGuide,
    editedGuideContent,
    showVersions,
    selectedGuides,
    universeData,
    universeSelectedGuide,
    universeSelectedCards,
    showSavedCards,
    imagePrompt,
    characterImage,
    studioImagePrompt,
    studioCharacterImage,
    studioSelectedCard,
    imageAspectRatio,
    imageSize,
    imageStyle,
    forgedCard
  ]);

  const prevKeysRef = useRef<ApiKeys>(apiKeys);
  const prevProviderRef = useRef<AIProvider>(provider);

  // Fetch models when key or provider changes
  useEffect(() => {
    const fetchProviderModels = async (p: AIProvider) => {
      const key = p === "custom" ? apiKeys.customKey : apiKeys[p as keyof ApiKeys];
      if (!key && p !== "gemini" && p !== "openai" && p !== "anthropic" && p !== "openrouter") return;
      
      setIsFetchingModels(prev => ({ ...prev, [p]: true }));
      try {
        const models = await fetchModels(p, apiKeys);
        setAvailableModels(prev => ({ ...prev, [p]: models }));
        
        setApiModels(prev => {
          if (models.length > 0 && !models.find(m => m.id === prev[p])) {
            return { ...prev, [p]: models[0].id };
          }
          return prev;
        });
      } catch (error) {
        console.error(`Failed to fetch models for ${p}`, error);
      } finally {
        setIsFetchingModels(prev => ({ ...prev, [p]: false }));
      }
    };

    const prevKeys = prevKeysRef.current;
    const prevProvider = prevProviderRef.current;

    // On mount or provider change, fetch for the current provider
    if (provider !== prevProvider) {
      fetchProviderModels(provider);
    }

    // Fetch for any provider whose key changed
    if (apiKeys.gemini !== prevKeys.gemini) fetchProviderModels("gemini");
    if (apiKeys.anthropic !== prevKeys.anthropic) fetchProviderModels("anthropic");
    if (apiKeys.openai !== prevKeys.openai) fetchProviderModels("openai");
    if (apiKeys.openrouter !== prevKeys.openrouter) fetchProviderModels("openrouter");
    if (apiKeys.customEndpoint !== prevKeys.customEndpoint || apiKeys.customKey !== prevKeys.customKey) {
      fetchProviderModels("custom");
    }

    // Initial fetch for all providers on mount
    if (prevKeys === apiKeys && prevProvider === provider) {
      (["gemini", "anthropic", "openai", "openrouter", "custom"] as AIProvider[]).forEach(p => {
        fetchProviderModels(p);
      });
    }

    prevKeysRef.current = apiKeys;
    prevProviderRef.current = provider;
  }, [provider, apiKeys]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    setIsParsing(true);
    
    const newCards: CharacterCard[] = [];
    const newGuides: SavedGuide[] = [];
    
    for (let i = 0; i < e.target.files.length; i++) {
      try {
        const file = e.target.files[i];
        
        // Check if it's a Style Guide JSON
        if (file.type === "application/json" || file.name.endsWith(".json")) {
          const text = await file.text();
          const parsed = JSON.parse(text);
          if (parsed.title && parsed.content) {
            newGuides.push(parsed as SavedGuide);
            continue;
          }
        }
        
        // Check if it's a PDF Style Guide
        if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
          const text = await parsePdfToText(file);
          if (text) {
            newGuides.push({
              id: Date.now().toString() + i,
              title: file.name.replace(/\.pdf$/i, ''),
              content: text,
              date: new Date().toISOString(),
              versions: []
            });
            continue;
          }
        }

        // Check if it's a DOCX Style Guide
        if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || file.name.endsWith(".docx")) {
          const text = await parseDocxToText(file);
          if (text) {
            newGuides.push({
              id: Date.now().toString() + i,
              title: file.name.replace(/\.docx$/i, ''),
              content: text,
              date: new Date().toISOString(),
              versions: []
            });
            continue;
          }
        }
        
        const card = await parseFile(file);
        if (card && card.name) {
          newCards.push(card);
        }
      } catch (err) {
        console.error("Failed to parse file", e.target.files[i].name, err);
      }
    }
    
    if (newCards.length > 0) {
      setCards((prev) => [...prev, ...newCards]);
      alert(`Imported ${newCards.length} character card(s) to Corpus Ingestion!`);
    }
    
    if (newGuides.length > 0) {
      setGuides((prev) => [...newGuides, ...prev]);
      alert(`Imported ${newGuides.length} style guide(s) to the Library!`);
      setView("saved");
    }

    if (newCards.length === 0 && newGuides.length === 0) {
      alert("No valid character cards or style guides found in the uploaded files.");
    }
    
    setIsParsing(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeCard = (index: number) => {
    setCards((prev) => prev.filter((_, i) => i !== index));
  };

  const handleImageUpload = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setCards((prev) => {
        const newCards = [...prev];
        newCards[index] = { ...newCards[index], image: dataUrl };
        return newCards;
      });
    };
    reader.readAsDataURL(file);
  };

  const handleTemplateUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const newTemplate: CardTemplate = {
        id: `custom-${Date.now()}`,
        name: file.name.replace(/\.[^/.]+$/, ""),
        content: content
      };
      setCustomTemplates(prev => [...prev, newTemplate]);
      setForgeSelectedTemplate(newTemplate.id);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const exportCardJson = (card: CharacterCard) => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(card, null, 2));
    const downloadAnchorNode = document.createElement("a");
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `${card.name || "character"}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const [exportingCard, setExportingCard] = useState<CharacterCard | null>(null);

  useEffect(() => {
    if (exportingCard) {
      setTimeout(async () => {
        const element = document.getElementById("export-card-container");
        if (element) {
          try {
            const dataUrl = await toPng(element, { cacheBust: true, backgroundColor: '#ffffff', pixelRatio: 2 });
            const link = document.createElement("a");
            link.download = `${exportingCard.name || "character"}.png`;
            link.href = dataUrl;
            link.click();
          } catch (err) {
            console.error("Failed to export PNG", err);
          } finally {
            setExportingCard(null);
          }
        }
      }, 100);
    }
  }, [exportingCard]);

  const handleGenerate = async () => {
    if (cards.length === 0) return;
    setIsGenerating(true);
    try {
      const { currentProvider, currentModel } = getProviderAndModel("ingestion");
      const result = await generateStyleGuide(currentProvider, apiKeys, cards, currentModel);
      setCurrentGuide(result);
      setCurrentGuideId(null);
      setIsEditingGuide(false);
      setShowVersions(false);
      setView("generate");
    } catch (err) {
      console.error(err);
      alert("Failed to generate guide. Check console for details.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleMerge = async () => {
    if (selectedGuides.size < 2) return;
    setIsGenerating(true);
    try {
      const guidesToMerge = guides
        .filter((g) => selectedGuides.has(g.id))
        .map((g) => g.content);
      const { currentProvider, currentModel } = getProviderAndModel("library");
      const result = await mergeStyleGuides(currentProvider, apiKeys, guidesToMerge, currentModel);
      setCurrentGuide(result);
      setCurrentGuideId(null);
      setIsEditingGuide(false);
      setShowVersions(false);
      setView("generate");
      setSelectedGuides(new Set());
    } catch (err) {
      console.error(err);
      alert("Failed to merge guides. Check console for details.");
    } finally {
      setIsGenerating(false);
    }
  };

  const saveCurrentGuide = () => {
    if (!currentGuide) return;
    
    const title = prompt("Enter a name for this style guide:", `Style Guide - ${new Date().toLocaleDateString()}`);
    if (!title) return; // Cancelled

    const newGuide: SavedGuide = {
      id: Date.now().toString(),
      title: title,
      content: currentGuide,
      date: new Date().toISOString(),
      versions: []
    };
    setGuides((prev) => [newGuide, ...prev]);
    setCurrentGuideId(newGuide.id);
    alert("Guide saved!");
  };

  const updateCurrentGuide = () => {
    if (!currentGuideId || !editedGuideContent) return;
    setGuides((prev) => prev.map(g => {
      if (g.id === currentGuideId) {
        const newVersion: GuideVersion = {
          id: Date.now().toString(),
          content: g.content,
          date: g.date
        };
        return {
          ...g,
          content: editedGuideContent,
          date: new Date().toISOString(),
          versions: [newVersion, ...(g.versions || [])]
        };
      }
      return g;
    }));
    setCurrentGuide(editedGuideContent);
    setIsEditingGuide(false);
    alert("Guide updated!");
  };

  const revertToVersion = (version: GuideVersion) => {
    if (!currentGuideId) return;
    setGuides((prev) => prev.map(g => {
      if (g.id === currentGuideId) {
        const newVersion: GuideVersion = {
          id: Date.now().toString(),
          content: g.content,
          date: g.date
        };
        return {
          ...g,
          content: version.content,
          date: new Date().toISOString(),
          versions: [newVersion, ...(g.versions || [])]
        };
      }
      return g;
    }));
    setCurrentGuide(version.content);
    setShowVersions(false);
    alert("Reverted to previous version!");
  };

  const exportPDF = () => {
    if (!guideRef.current) return;
    const opt = {
      margin: 15,
      filename: 'style-guide.pdf',
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm' as const, format: 'a4' as const, orientation: 'portrait' as const }
    };
    html2pdf().set(opt).from(guideRef.current).save();
  };

  const exportJSON = () => {
    if (!currentGuide) return;
    const guideData = {
      id: currentGuideId || Date.now().toString(),
      title: guides.find(g => g.id === currentGuideId)?.title || `Style Guide - ${new Date().toLocaleDateString()}`,
      content: currentGuide,
      date: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(guideData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${guideData.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const toggleGuideSelection = (id: string) => {
    const newSet = new Set(selectedGuides);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedGuides(newSet);
  };

  const deleteGuide = (id: string) => {
    setGuides((prev) => prev.filter((g) => g.id !== id));
    const newSet = new Set(selectedGuides);
    newSet.delete(id);
    setSelectedGuides(newSet);
  };

  useEffect(() => {
    localStorage.setItem("st_custom_templates", JSON.stringify(customTemplates));
  }, [customTemplates]);

  useEffect(() => {
    localStorage.setItem("st_saved_cards", JSON.stringify(savedCards));
  }, [savedCards]);

  const lastExtractedRef = useRef<{ guide: string, template: string }>({ guide: "", template: "" });

  useEffect(() => {
    if (!forgeSelectedGuide && !forgeSelectedTemplate) {
      setForgeSlots([]);
      lastExtractedRef.current = { guide: "", template: "" };
      return;
    }
    
    // Check if we actually need to extract
    if (forgeSelectedTemplate) {
      if (lastExtractedRef.current.template === forgeSelectedTemplate) {
        lastExtractedRef.current.guide = forgeSelectedGuide;
        return;
      }
    } else if (forgeSelectedGuide) {
      if (lastExtractedRef.current.guide === forgeSelectedGuide && !lastExtractedRef.current.template) {
        return;
      }
    }

    setIsExtractingSlots(true);
    lastExtractedRef.current = { guide: forgeSelectedGuide, template: forgeSelectedTemplate };

    if (forgeSelectedTemplate) {
      const template = [...DEFAULT_TEMPLATES, ...customTemplates].find(t => t.id === forgeSelectedTemplate);
      if (template) {
        import("./lib/api").then(({ extractSlotsFromTemplate }) => {
          const { currentProvider, currentModel } = getProviderAndModel("forge_generate");
          extractSlotsFromTemplate(currentProvider, apiKeys, template.content, currentModel, template.example).then(slots => {
            setForgeSlots(prev => {
              return slots.map(s => {
                const existing = prev.find(p => p.name === s.name);
                return { ...s, value: existing ? existing.value : "" };
              });
            });
            setIsExtractingSlots(false);
          });
        });
        return;
      }
    }

    if (forgeSelectedGuide) {
      const guide = guides.find(g => g.id === forgeSelectedGuide);
      if (guide) {
        import("./lib/api").then(({ extractSlotsFromGuide }) => {
          const slots = extractSlotsFromGuide();
          setForgeSlots(prev => {
            return slots.map(s => {
              const existing = prev.find(p => p.name === s.name);
              return { ...s, value: existing ? existing.value : "" };
            });
          });
          setIsExtractingSlots(false);
        });
      } else {
        setIsExtractingSlots(false);
      }
    } else {
      setIsExtractingSlots(false);
    }
  }, [forgeSelectedGuide, forgeSelectedTemplate, provider, apiKeys, guides, customTemplates]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (view !== "create") return;
      
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (e.shiftKey) {
          e.preventDefault();
          forgeHistory.redo();
        } else {
          e.preventDefault();
          forgeHistory.undo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        forgeHistory.redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [view, forgeHistory]);

  const handleExtractUniverse = async () => {
    if (!universeSelectedGuide && universeSelectedCards.size === 0) return;
    
    const guide = guides.find(g => g.id === universeSelectedGuide);
    const guideContent = guide ? guide.content : undefined;

    setIsExtractingUniverse(true);
    try {
      const selectedSavedCards = savedCards.filter(c => universeSelectedCards.has(c.id));
      const cardsData = selectedSavedCards.map(c => ({ name: c.name, concept: c.concept, description: c.card.description }));
      const { currentProvider, currentModel } = getProviderAndModel("universe");
      const data = await extractUniverse(currentProvider, apiKeys, guideContent, currentModel, cardsData);
      setUniverseData(data);
    } catch (err) {
      console.error(err);
      alert("Failed to extract universe data.");
    } finally {
      setIsExtractingUniverse(false);
    }
  };

  const handleForgeCard = async () => {
    if (!forgeName || !forgeConcept || !forgeSelectedGuide) return;
    
    const guide = guides.find(g => g.id === forgeSelectedGuide);
    if (!guide) return;

    setIsForging(true);
    try {
      const allSlots = [
        { name: "Name", value: forgeName },
        { name: "Core Concept/Archetype", value: forgeConcept },
        ...forgeSlots
      ];

      const templateObj = [...DEFAULT_TEMPLATES, ...customTemplates].find(t => t.id === forgeSelectedTemplate);
      const template = templateObj?.content;
      const templateExample = templateObj?.example;
      
      const { currentProvider, currentModel } = getProviderAndModel("forge_generate");
      const result = await generateCharacterCard(
        currentProvider,
        apiKeys,
        guide.content,
        allSlots,
        template,
        currentModel,
        forgeFirstMessageIdea,
        templateExample
      );
      setForgedCard(result);
    } catch (err) {
      console.error(err);
      alert("Failed to forge card. Check console for details.");
    } finally {
      setIsForging(false);
    }
  };

  const handleGenerateImagePrompt = async () => {
    if (!forgedCard) return;
    setIsGeneratingImagePrompt(true);
    try {
      const { generateImagePrompt } = await import("./lib/api");
      const { currentProvider, currentModel } = getProviderAndModel("forge_generate");
      const details = JSON.stringify(forgedCard, null, 2);
      const prompt = await generateImagePrompt(currentProvider, apiKeys, details, currentModel);
      setImagePrompt(prompt);
    } catch (err) {
      console.error(err);
      alert("Failed to generate image prompt.");
    } finally {
      setIsGeneratingImagePrompt(false);
    }
  };

  const handleGenerateImage = async () => {
    if (!imagePrompt) return;
    setIsGeneratingImage(true);
    try {
      const { generateCharacterImage } = await import("./lib/api");
      const { currentProvider, currentModel } = getProviderAndModel("forge_image");
      
      if (currentProvider !== "gemini") {
        alert("Image generation is currently only supported with Gemini models.");
        setIsGeneratingImage(false);
        return;
      }

      // Default to gemini-3.1-flash-image-preview if no model is selected or if a text model is selected
      let modelToUse = currentModel;
      if (!modelToUse || !modelToUse.includes("image")) {
        modelToUse = "gemini-3.1-flash-image-preview";
      }

      const imageBase64 = await generateCharacterImage(apiKeys, imagePrompt, modelToUse, imageAspectRatio, imageSize, imageStyle);
      setCharacterImage(imageBase64);
    } catch (err) {
      console.error(err);
      alert("Failed to generate image. Please check your Gemini API key.");
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleGenerateStudioImagePrompt = async () => {
    if (!studioSelectedCard) {
      alert("Please select a character card first.");
      return;
    }
    const card = savedCards.find(c => c.id === studioSelectedCard);
    if (!card) return;

    setIsGeneratingStudioPrompt(true);
    try {
      const { generateImagePrompt } = await import("./lib/api");
      const { currentProvider, currentModel } = getProviderAndModel("forge_generate");
      const details = JSON.stringify(card.card, null, 2);
      const prompt = await generateImagePrompt(currentProvider, apiKeys, details, currentModel);
      setStudioImagePrompt(prompt);
    } catch (err) {
      console.error(err);
      alert("Failed to generate image prompt.");
    } finally {
      setIsGeneratingStudioPrompt(false);
    }
  };

  const handleGenerateStudioImage = async () => {
    if (!studioImagePrompt) return;
    setIsGeneratingStudioImage(true);
    try {
      const { generateCharacterImage } = await import("./lib/api");
      const { currentProvider, currentModel } = getProviderAndModel("forge_image");
      
      if (currentProvider !== "gemini") {
        alert("Image generation is currently only supported with Gemini models.");
        setIsGeneratingStudioImage(false);
        return;
      }

      let modelToUse = currentModel;
      if (!modelToUse || !modelToUse.includes("image")) {
        modelToUse = "gemini-3.1-flash-image-preview";
      }

      const imageBase64 = await generateCharacterImage(apiKeys, studioImagePrompt, modelToUse, imageAspectRatio, imageSize, imageStyle);
      setStudioCharacterImage(imageBase64);
    } catch (err) {
      console.error(err);
      alert("Failed to generate image. Please check your Gemini API key.");
    } finally {
      setIsGeneratingStudioImage(false);
    }
  };

  const handleSaveStudioImage = () => {
    if (!studioSelectedCard || !studioCharacterImage) return;
    setSavedCards(prev => prev.map(c => {
      if (c.id === studioSelectedCard) {
        return {
          ...c,
          card: {
            ...c.card,
            image: studioCharacterImage
          }
        };
      }
      return c;
    }));
    alert("Image saved to character card!");
  };

  const handleSuggestArchetype = async () => {
    setIsSuggestingArchetype(true);
    try {
      let traits = forgeSlots.map(s => `${s.name}: ${s.value}`).join("\n");
      if (forgeName) {
        traits = `Name: ${forgeName}\n${traits}`;
      }
      const { currentProvider, currentModel } = getProviderAndModel("forge_suggest");
      const suggestion = await suggestArchetype(currentProvider, apiKeys, traits, currentModel);
      setForgeConcept(suggestion);
    } catch (err) {
      console.error(err);
      // Fallback or error handling
    } finally {
      setIsSuggestingArchetype(false);
    }
  };

  useEffect(() => {
    if (forgeSlots.length === 0 || forgeConcept.trim() !== "" || isSuggestingArchetype) return;
    
    const allSlotsFilled = forgeSlots.every(slot => slot.value.trim() !== "");
    if (allSlotsFilled) {
      handleSuggestArchetype();
    }
  }, [forgeSlots, forgeConcept, isSuggestingArchetype]);

  const handleGenerateSlot = async (index: number) => {
    if (!forgeSelectedGuide) {
      alert("Please select a style guide first to generate slot content.");
      return;
    }
    const guide = guides.find(g => g.id === forgeSelectedGuide);
    if (!guide) return;

    setGeneratingSlotIndex(index);
    try {
      const { generateSlotContent } = await import("./lib/api");
      const { currentProvider, currentModel } = getProviderAndModel("forge_generate");
      
      const slot = forgeSlots[index];
      const otherSlots = forgeSlots.filter((_, i) => i !== index);
      
      const template = [...DEFAULT_TEMPLATES, ...customTemplates].find(t => t.id === forgeSelectedTemplate);
      const templateExample = template?.example;

      const generatedText = await generateSlotContent(
        currentProvider,
        apiKeys,
        slot.name,
        slot.description,
        slot.value,
        forgeName,
        forgeConcept,
        otherSlots,
        guide.content,
        currentModel,
        templateExample
      );
      
      setForgeSlots(prev => {
        const newSlots = [...prev];
        newSlots[index] = { ...newSlots[index], value: generatedText };
        return newSlots;
      });
    } catch (err: any) {
      console.error(err);
      alert(`Failed to generate slot content: ${err?.message || "Unknown error"}`);
    } finally {
      setGeneratingSlotIndex(null);
    }
  };

  const handleAutoFill = async () => {
    if (!forgeName || !forgeConcept) {
      alert("Please provide a Name and Core Concept first.");
      return;
    }
    setIsAutoFilling(true);
    try {
      const { autoFillSlots } = await import("./lib/api");
      const { currentProvider, currentModel } = getProviderAndModel("forge_autofill");
      const template = [...DEFAULT_TEMPLATES, ...customTemplates].find(t => t.id === forgeSelectedTemplate);
      const templateExample = template?.example;

      const guide = guides.find(g => g.id === forgeSelectedGuide);
      const filledData = await autoFillSlots(currentProvider, apiKeys, forgeName, forgeConcept, forgeSlots, currentModel, templateExample, guide?.content);
      setForgeSlots(prev => prev.map(slot => {
        if (filledData[slot.name]) {
          return { ...slot, value: filledData[slot.name] };
        }
        return slot;
      }));
    } catch (err) {
      console.error(err);
      alert("Failed to auto-fill slots.");
    } finally {
      setIsAutoFilling(false);
    }
  };

  const downloadForgedCard = () => {
    if (!forgedCard) return;
    
    const cardData = {
      spec: "chara_card_v2",
      spec_version: "2.0",
      data: {
        ...forgedCard,
        extensions: {}
      }
    };

    if (characterImage) {
      // Add image to the card data if available
      cardData.data.image = characterImage;
    }
    
    const blob = new Blob([JSON.stringify(cardData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${forgedCard.name || "character"}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const saveForgedCard = () => {
    if (!forgedCard) return;
    
    const cardToSave = { ...forgedCard };
    if (characterImage) {
      cardToSave.image = characterImage;
    }

    const newSavedCard: SavedCard = {
      id: Date.now().toString(),
      name: forgeName || forgedCard.name,
      concept: forgeConcept,
      card: cardToSave,
      date: new Date().toISOString(),
    };
    setSavedCards(prev => [...prev, newSavedCard]);
    alert("Card saved to library!");
  };

  const handleAddUniverseLink = (sourceId: string, targetId: string, type: "relationship" | "pipeline", label: string) => {
    if (!universeData) return;
    setUniverseData({
      ...universeData,
      links: [...universeData.links, { source: sourceId, target: targetId, type, label }]
    });
  };

  return (
    <div className="flex flex-col md:flex-row h-screen w-full bg-[#f9f8f6] text-slate-900 overflow-hidden font-sans">
      {/* Sidebar / Topbar */}
      <div className="w-full md:w-72 bg-[#f9f8f6] border-b md:border-b-0 md:border-r border-[#e5e4e2] flex flex-col z-10 shrink-0">
        <div className="p-4 md:p-8 flex justify-between items-center md:block">
          <div className="flex justify-between items-start w-full">
            <div>
              <h1 className="text-2xl md:text-3xl font-serif font-bold text-[#8B3A3A] tracking-tight">
                StyleForge
              </h1>
              <p className="hidden md:block text-xs font-medium tracking-widest uppercase text-slate-500 mt-2">
                Authorial Voice Engine
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              className="rounded-full md:mt-0"
            >
              {theme === "light" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
            </Button>
          </div>
        </div>
        
        <nav className="flex-row md:flex-col overflow-x-auto md:overflow-x-visible flex-none md:flex-1 px-2 md:px-4 pb-2 md:pb-0 space-x-2 md:space-x-0 md:space-y-1 flex no-scrollbar">
          <NavButton view="upload" icon={Upload} label="Corpus Ingestion" currentView={view} setView={setView} />
          <NavButton view="generate" icon={FileText} label="Current Guide" currentView={view} setView={setView} />
          <NavButton view="saved" icon={BookOpen} label="Library" currentView={view} setView={setView} />
          <NavButton view="create" icon={Wand2} label="Card Forge" currentView={view} setView={setView} />
          <NavButton view="image" icon={ImageIcon} label="Portrait Studio" currentView={view} setView={setView} />
          <NavButton view="universe" icon={Network} label="Universe Map" currentView={view} setView={setView} />
          <NavButton view="settings" icon={Settings} label="Configuration" currentView={view} setView={setView} />
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        <ScrollArea className="flex-1 px-4 py-6 md:px-12 md:py-10">
          <div className="max-w-5xl mx-auto">
            <AnimatePresence mode="wait">
              
              {/* UPLOAD VIEW */}
              {view === "upload" && (
                <motion.div
                  key="upload"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-6 md:space-y-8"
                >
                  <div className="space-y-2">
                    <h2 className="text-3xl md:text-5xl font-serif font-light tracking-tight text-slate-900">Corpus Ingestion</h2>
                    <p className="text-slate-500 text-base md:text-lg font-light">
                      Upload character cards to establish the authorial baseline. A minimum of 15 cards is recommended for accurate style extraction.
                    </p>
                  </div>

                  <div 
                    className="border-dashed border-[1.5px] border-[#d1d0ce] bg-white/50 rounded-3xl p-8 md:p-16 flex flex-col items-center justify-center text-center transition-all hover:bg-white hover:border-[#8B3A3A]/30 cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <div className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-[#f0efe9] flex items-center justify-center mb-4 md:mb-6">
                      <Upload className="w-5 h-5 md:w-6 md:h-6 text-[#8B3A3A]" />
                    </div>
                    <h3 className="text-xl md:text-2xl font-serif font-medium text-slate-900">Select Character Cards</h3>
                    <p className="text-slate-500 mt-2 mb-6 md:mb-8 max-w-md text-sm md:text-base">
                      Drag and drop PNG, JSON, PDF, or DOCX files here, or click to browse your computer.
                    </p>
                    <input
                      type="file"
                      multiple
                      accept=".png,.json,.pdf,.docx"
                      className="hidden"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                    />
                    <Button 
                      className="bg-[#8B3A3A] hover:bg-[#7a3333] text-white rounded-full px-6 py-5 md:px-8 md:py-6 text-sm md:text-base shadow-lg shadow-[#8B3A3A]/20 transition-all hover:scale-105" 
                      disabled={isParsing}
                      onClick={(e) => {
                        e.stopPropagation();
                        fileInputRef.current?.click();
                      }}
                    >
                      {isParsing ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Plus className="w-5 h-5 mr-2" />}
                      Browse Files
                    </Button>
                  </div>
                  
                  {cards.length > 0 && (
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-6"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-end justify-between border-b border-[#e5e4e2] pb-4 gap-4">
                        <div>
                          <h3 className="text-2xl font-serif font-medium">Analyzed Subjects</h3>
                          <p className="text-sm text-slate-500 mt-1">{cards.length} cards loaded</p>
                        </div>
                        <div className="flex items-center gap-4">
                          <ModelSelector
                            sectionId="ingestion"
                            globalProvider={provider}
                            globalModels={apiModels}
                            sectionConfigs={sectionConfigs}
                            setSectionConfigs={setSectionConfigs}
                            availableModels={availableModels}
                            isFetchingModels={isFetchingModels}
                          />
                          <Button 
                            onClick={handleGenerate} 
                            disabled={isGenerating || cards.length === 0} 
                            className="bg-slate-900 hover:bg-slate-800 text-white rounded-full px-6"
                          >
                            {isGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
                            Synthesize Guide
                          </Button>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {cards.map((card, i) => (
                          <div key={i} className="group relative bg-white border border-[#e5e4e2] rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between min-h-[120px]">
                            <div className="flex gap-4">
                              <div 
                                className="relative w-16 h-16 rounded-xl overflow-hidden bg-slate-100 flex-shrink-0 border border-[#e5e4e2] flex items-center justify-center group/image cursor-pointer" 
                                onClick={(e) => { e.stopPropagation(); document.getElementById(`image-upload-${i}`)?.click(); }}
                                title="Upload Character Image"
                              >
                                {card.image ? (
                                  <img src={card.image} alt={card.name} className="w-full h-full object-cover" />
                                ) : (
                                  <ImageIcon className="w-6 h-6 text-slate-400" />
                                )}
                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/image:opacity-100 transition-opacity">
                                  <Upload className="w-4 h-4 text-white" />
                                </div>
                                <input 
                                  type="file" 
                                  id={`image-upload-${i}`} 
                                  className="hidden" 
                                  accept="image/*"
                                  onChange={(e) => handleImageUpload(i, e)}
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="font-serif font-medium text-lg truncate pr-8">{card.name || "Unknown"}</h4>
                                <p className="text-xs text-slate-500 mt-1 truncate">
                                  {card.creator ? `By ${card.creator}` : "Unknown Creator"}
                                </p>
                              </div>
                            </div>
                            
                            <div className="mt-4 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={(e) => { e.stopPropagation(); exportCardJson(card); }}
                                className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-md text-slate-600 transition-colors"
                                title="Export JSON"
                              >
                                <FileJson className="w-4 h-4" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setExportingCard(card); }}
                                className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-md text-slate-600 transition-colors"
                                title="Export PNG"
                              >
                                {exportingCard === card ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                              </button>
                            </div>

                            <button
                              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 transition-all"
                              onClick={(e) => { e.stopPropagation(); removeCard(i); }}
                              title="Delete Card"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              )}

              {/* GENERATE VIEW */}
              {view === "generate" && (
                <motion.div
                  key="generate"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-6 md:space-y-8"
                >
                  <div className="flex flex-col md:flex-row md:items-end justify-between border-b border-[#e5e4e2] pb-6 gap-4 md:gap-0">
                    <div className="space-y-2">
                      <h2 className="text-3xl md:text-5xl font-serif font-light tracking-tight text-slate-900">
                        {currentGuideId ? guides.find(g => g.id === currentGuideId)?.title || "Style Guide" : "Style Guide"}
                      </h2>
                      <p className="text-slate-500 text-base md:text-lg font-light">
                        {currentGuideId ? "Saved authorial profile." : "The synthesized authorial profile."}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 md:gap-3">
                      {currentGuideId ? (
                        isEditingGuide ? (
                          <>
                            <Button variant="outline" onClick={() => setIsEditingGuide(false)} className="rounded-full border-[#e5e4e2] hover:bg-white text-xs md:text-sm px-3 md:px-4">
                              <X className="w-3 h-3 md:w-4 md:h-4 mr-1 md:mr-2" />
                              Cancel
                            </Button>
                            <Button onClick={updateCurrentGuide} className="rounded-full bg-[#8B3A3A] hover:bg-[#7a3333] text-white shadow-md shadow-[#8B3A3A]/20 text-xs md:text-sm px-3 md:px-4">
                              <Save className="w-3 h-3 md:w-4 md:h-4 mr-1 md:mr-2" />
                              Save Changes
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button variant="outline" onClick={() => setShowVersions(!showVersions)} className="rounded-full border-[#e5e4e2] hover:bg-white text-xs md:text-sm px-3 md:px-4">
                              <History className="w-3 h-3 md:w-4 md:h-4 mr-1 md:mr-2" />
                              History
                            </Button>
                            <Button variant="outline" onClick={() => { setEditedGuideContent(currentGuide || ""); setIsEditingGuide(true); }} className="rounded-full border-[#e5e4e2] hover:bg-white text-xs md:text-sm px-3 md:px-4">
                              <Pencil className="w-3 h-3 md:w-4 md:h-4 mr-1 md:mr-2" />
                              Edit Guide
                            </Button>
                            <Button onClick={exportJSON} className="rounded-full border-[#e5e4e2] hover:bg-white text-xs md:text-sm px-3 md:px-4" variant="outline">
                              <Download className="w-3 h-3 md:w-4 md:h-4 mr-1 md:mr-2" />
                              JSON
                            </Button>
                            <Button onClick={exportPDF} className="rounded-full bg-[#8B3A3A] hover:bg-[#7a3333] text-white shadow-md shadow-[#8B3A3A]/20 text-xs md:text-sm px-3 md:px-4">
                              <Download className="w-3 h-3 md:w-4 md:h-4 mr-1 md:mr-2" />
                              PDF
                            </Button>
                          </>
                        )
                      ) : (
                        <>
                          <Button variant="outline" onClick={saveCurrentGuide} disabled={!currentGuide} className="rounded-full border-[#e5e4e2] hover:bg-white text-xs md:text-sm px-3 md:px-4">
                            <Check className="w-3 h-3 md:w-4 md:h-4 mr-1 md:mr-2" />
                            Save to Library
                          </Button>
                          <Button onClick={exportJSON} disabled={!currentGuide} className="rounded-full border-[#e5e4e2] hover:bg-white text-xs md:text-sm px-3 md:px-4" variant="outline">
                            <Download className="w-3 h-3 md:w-4 md:h-4 mr-1 md:mr-2" />
                            JSON
                          </Button>
                          <Button onClick={exportPDF} disabled={!currentGuide} className="rounded-full bg-[#8B3A3A] hover:bg-[#7a3333] text-white shadow-md shadow-[#8B3A3A]/20 text-xs md:text-sm px-3 md:px-4">
                            <Download className="w-3 h-3 md:w-4 md:h-4 mr-1 md:mr-2" />
                            PDF
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {showVersions && currentGuideId && (
                    <div className="bg-white border border-[#e5e4e2] rounded-xl p-4 md:p-6 shadow-sm">
                      <h3 className="text-lg md:text-xl font-serif font-medium text-slate-900 mb-4">Version History</h3>
                      <div className="space-y-3 md:space-y-4 max-h-64 overflow-y-auto pr-2">
                        {guides.find(g => g.id === currentGuideId)?.versions?.length ? (
                          guides.find(g => g.id === currentGuideId)?.versions?.map((v, i, arr) => (
                            <div key={v.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 md:p-4 border border-[#e5e4e2] rounded-lg bg-slate-50 gap-3 sm:gap-0">
                              <div>
                                <p className="font-medium text-slate-900 text-sm md:text-base">Version {arr.length - i}</p>
                                <p className="text-xs md:text-sm text-slate-500">{new Date(v.date).toLocaleString()}</p>
                              </div>
                              <Button variant="outline" size="sm" onClick={() => revertToVersion(v)} className="rounded-full text-[#8B3A3A] border-[#e5e4e2] hover:bg-white w-full sm:w-auto">
                                <History className="w-4 h-4 mr-2" />
                                Revert
                              </Button>
                            </div>
                          ))
                        ) : (
                          <p className="text-slate-500 text-sm">No previous versions available.</p>
                        )}
                      </div>
                    </div>
                  )}

                  {isGenerating ? (
                    <div className="bg-white border border-[#e5e4e2] rounded-2xl md:rounded-3xl p-12 md:p-24 flex flex-col items-center justify-center text-center shadow-sm">
                      <Loader2 className="w-8 h-8 md:w-12 md:h-12 text-[#8B3A3A] animate-spin mb-4 md:mb-6" />
                      <h3 className="text-xl md:text-2xl font-serif font-medium text-slate-900">Synthesizing Authorial Voice...</h3>
                      <p className="text-slate-500 mt-2 max-w-md text-sm md:text-base">
                        Analyzing prose patterns, dialogue registers, and thematic DNA across {cards.length} cards.
                      </p>
                    </div>
                  ) : currentGuide ? (
                    <div className="bg-white border border-[#e5e4e2] rounded-xl shadow-sm overflow-hidden">
                      {isEditingGuide ? (
                        <div className="p-4 md:p-8">
                          <Textarea 
                            value={editedGuideContent}
                            onChange={(e) => setEditedGuideContent(e.target.value)}
                            className="min-h-[500px] md:min-h-[800px] font-mono text-xs md:text-sm p-4 md:p-6 rounded-xl border-[#e5e4e2] focus-visible:ring-[#8B3A3A]"
                          />
                        </div>
                      ) : (
                        <div className="p-6 md:p-16 min-h-[500px] md:min-h-[800px]" ref={guideRef}>
                          <div className="prose prose-slate max-w-none prose-headings:font-serif prose-headings:font-medium prose-h1:text-center prose-h1:text-3xl md:prose-h1:text-5xl prose-h1:text-[#8B3A3A] prose-h1:mb-2 prose-h2:text-[#8B3A3A] prose-h2:border-b prose-h2:border-[#e5e4e2] prose-h2:pb-2 md:prose-h2:pb-3 prose-h2:mt-8 md:prose-h2:mt-12 prose-h2:text-2xl md:prose-h2:text-3xl prose-h3:text-xl md:prose-h3:text-2xl prose-h3:mt-6 md:prose-h3:mt-8 prose-p:leading-relaxed prose-p:text-slate-700 prose-li:text-slate-700 prose-strong:text-slate-900 prose-strong:font-semibold">
                            <ReactMarkdown>{currentGuide}</ReactMarkdown>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-white border border-[#e5e4e2] rounded-2xl md:rounded-3xl p-12 md:p-24 flex flex-col items-center justify-center text-center shadow-sm">
                      <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-[#f0efe9] flex items-center justify-center mb-4 md:mb-6">
                        <FileText className="w-6 h-6 md:w-8 md:h-8 text-slate-400" />
                      </div>
                      <h3 className="text-xl md:text-2xl font-serif font-medium text-slate-900">No Guide Synthesized</h3>
                      <p className="text-slate-500 mt-2 max-w-md text-sm md:text-base">
                        Upload character cards and initiate synthesis to generate a style guide.
                      </p>
                      <Button className="mt-6 md:mt-8 rounded-full bg-slate-900 text-white px-6 md:px-8" onClick={() => setView("upload")}>
                        Return to Upload
                      </Button>
                    </div>
                  )}
                </motion.div>
              )}

              {/* SAVED GUIDES VIEW */}
              {view === "saved" && (
                <motion.div
                  key="saved"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-6 md:space-y-8"
                >
                  <div className="flex flex-col md:flex-row md:items-end justify-between border-b border-[#e5e4e2] pb-6 gap-4 md:gap-0">
                    <div className="space-y-2">
                      <h2 className="text-3xl md:text-5xl font-serif font-light tracking-tight text-slate-900">Library</h2>
                      <p className="text-slate-500 text-base md:text-lg font-light">
                        Archived style guides and synthesis history.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 md:gap-3">
                      <ModelSelector
                        sectionId="library"
                        globalProvider={provider}
                        globalModels={apiModels}
                        sectionConfigs={sectionConfigs}
                        setSectionConfigs={setSectionConfigs}
                        availableModels={availableModels}
                        isFetchingModels={isFetchingModels}
                      />
                      <Button 
                        onClick={() => fileInputRef.current?.click()} 
                        variant="outline"
                        className="rounded-full border-[#e5e4e2] hover:bg-white px-4 md:px-6 text-sm md:text-base flex-1 md:flex-none"
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        Import Guide
                      </Button>
                      <Button 
                        onClick={handleMerge} 
                        disabled={selectedGuides.size < 2 || isGenerating}
                        className="rounded-full bg-slate-900 text-white px-4 md:px-6 text-sm md:text-base flex-1 md:flex-none"
                      >
                        {isGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Merge className="w-4 h-4 mr-2" />}
                        Merge Selected ({selectedGuides.size})
                      </Button>
                    </div>
                  </div>

                  {guides.length === 0 ? (
                    <div className="bg-white border border-[#e5e4e2] rounded-2xl md:rounded-3xl p-12 md:p-24 flex flex-col items-center justify-center text-center shadow-sm">
                      <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-[#f0efe9] flex items-center justify-center mb-4 md:mb-6">
                        <BookOpen className="w-6 h-6 md:w-8 md:h-8 text-slate-400" />
                      </div>
                      <h3 className="text-xl md:text-2xl font-serif font-medium text-slate-900">Library Empty</h3>
                      <p className="text-slate-500 mt-2 text-sm md:text-base">
                        Saved guides will appear here for future reference or merging.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                      {guides.map((guide) => (
                        <div 
                          key={guide.id} 
                          className={cn(
                            "bg-white border rounded-xl md:rounded-2xl p-4 md:p-6 transition-all shadow-sm hover:shadow-md cursor-pointer",
                            selectedGuides.has(guide.id) ? "border-[#8B3A3A] ring-1 ring-[#8B3A3A]" : "border-[#e5e4e2]"
                          )}
                          onClick={() => toggleGuideSelection(guide.id)}
                        >
                          <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-4">
                              <div className={cn(
                                "w-5 h-5 rounded-full border flex items-center justify-center transition-colors",
                                selectedGuides.has(guide.id) ? "bg-[#8B3A3A] border-[#8B3A3A]" : "border-slate-300"
                              )}>
                                {selectedGuides.has(guide.id) && <Check className="w-3 h-3 text-white" />}
                              </div>
                              <div>
                                <h3 className="font-serif font-medium text-xl text-slate-900">{guide.title}</h3>
                                <p className="text-xs text-slate-500 font-medium tracking-wide uppercase mt-1">
                                  {new Date(guide.date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                                </p>
                              </div>
                            </div>
                            <button 
                              onClick={(e) => { e.stopPropagation(); deleteGuide(guide.id); }}
                              className="w-8 h-8 rounded-full hover:bg-red-50 text-slate-400 hover:text-red-600 flex items-center justify-center transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                          <p className="text-sm text-slate-600 line-clamp-3 leading-relaxed mb-6">
                            {guide.content.substring(0, 200)}...
                          </p>
                          <div className="flex justify-end">
                            <Button 
                              variant="outline" 
                              className="rounded-full border-[#e5e4e2] hover:bg-[#f9f8f6]"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCurrentGuide(guide.content);
                                setCurrentGuideId(guide.id);
                                setIsEditingGuide(false);
                                setShowVersions(false);
                                setView("generate");
                              }}
                            >
                              Read Guide
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}

              {/* CARD FORGE VIEW */}
              {view === "create" && (
                <motion.div
                  key="create"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-6 md:space-y-8"
                >
                  <div className="flex flex-col md:flex-row md:items-end justify-between border-b border-[#e5e4e2] pb-6 gap-4 md:gap-0">
                    <div className="space-y-2">
                      <h2 className="text-3xl md:text-5xl font-serif font-light tracking-tight text-slate-900">Card Forge</h2>
                      <p className="text-slate-500 text-base md:text-lg font-light">
                        Generate a new character card using a saved style guide.
                      </p>
                    </div>
                    <Button 
                      onClick={() => setShowSavedCards(!showSavedCards)}
                      variant="outline"
                      className="rounded-full border-[#e5e4e2] hover:bg-white px-4 md:px-6 text-sm md:text-base flex-1 md:flex-none"
                    >
                      <BookOpen className="w-4 h-4 mr-2" />
                      {showSavedCards ? "Back to Forge" : "Saved Cards"}
                    </Button>
                  </div>

                  {showSavedCards ? (
                    <div className="space-y-6">
                      {savedCards.length === 0 ? (
                        <div className="text-center py-16 bg-white rounded-3xl border border-[#e5e4e2] shadow-sm">
                          <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                          <h3 className="text-xl font-serif text-slate-900 mb-2">No Saved Cards</h3>
                          <p className="text-slate-500">Cards you forge and save will appear here.</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {savedCards.map(saved => (
                            <div key={saved.id} className="bg-white border border-[#e5e4e2] rounded-2xl p-6 shadow-sm hover:shadow-md transition-all relative group">
                              <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button
                                  variant="outline"
                                  size="icon"
                                  onClick={() => {
                                    setForgeName(saved.name);
                                    setForgeConcept(saved.concept);
                                    setForgedCard(saved.card);
                                    setShowSavedCards(false);
                                  }}
                                  className="h-8 w-8 rounded-full border-[#e5e4e2] hover:bg-slate-50 hover:text-[#8B3A3A] text-slate-700"
                                  title="Load Card"
                                >
                                  <FileText className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  onClick={() => {
                                    if (confirm("Are you sure you want to delete this saved card?")) {
                                      setSavedCards(prev => prev.filter(c => c.id !== saved.id));
                                    }
                                  }}
                                  className="h-8 w-8 rounded-full border-[#e5e4e2] hover:bg-red-50 hover:text-red-600 text-slate-700"
                                  title="Delete Card"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                              <h3 className="font-serif text-xl font-medium text-slate-900 mb-1">{saved.name}</h3>
                              <p className="text-sm text-slate-500 mb-4">{saved.concept}</p>
                              <div className="text-xs text-slate-400">
                                Saved on {new Date(saved.date).toLocaleDateString()}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
                    {/* Input Form */}
                    <div className="bg-white border border-[#e5e4e2] rounded-2xl md:rounded-3xl p-6 md:p-8 shadow-md hover:shadow-lg transition-shadow duration-300 space-y-5 md:space-y-7 relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#8B3A3A]/20 via-[#8B3A3A] to-[#8B3A3A]/20"></div>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-serif font-medium text-2xl md:text-3xl text-slate-900 tracking-tight">Character Details</h3>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={forgeHistory.undo}
                            disabled={!forgeHistory.canUndo}
                            className="h-8 px-2 text-slate-600 border-[#e5e4e2] hover:bg-slate-50 hover:text-[#8B3A3A] transition-colors"
                            title="Undo (Ctrl+Z)"
                          >
                            <Undo2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={forgeHistory.redo}
                            disabled={!forgeHistory.canRedo}
                            className="h-8 px-2 text-slate-600 border-[#e5e4e2] hover:bg-slate-50 hover:text-[#8B3A3A] transition-colors"
                            title="Redo (Ctrl+Y)"
                          >
                            <Redo2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="guideSelect" className="text-slate-700 font-medium flex items-center tracking-wide text-sm uppercase">
                          Style Guide Base <span className="text-red-500 ml-1">*</span>
                          <InfoTooltip text="The foundational style guide that dictates the prose, tone, and formatting of the generated character card." />
                        </Label>
                        <select
                          id="guideSelect"
                          value={forgeSelectedGuide}
                          onChange={(e) => setForgeSelectedGuide(e.target.value)}
                          className="flex h-11 w-full rounded-xl border border-[#e5e4e2] bg-[#f9f8f6] hover:bg-white focus:bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8B3A3A]/50 focus-visible:border-[#8B3A3A] transition-all"
                        >
                          <option value="" disabled>Select a saved guide...</option>
                          {guides.map((g) => (
                            <option key={g.id} value={g.id}>{g.title}</option>
                          ))}
                        </select>
                        {guides.length === 0 && (
                          <p className="text-xs text-amber-600 mt-1">You need to save a style guide in the Library first.</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="templateSelect" className="text-slate-700 font-medium flex items-center tracking-wide text-sm uppercase">
                          Card Template <span className="text-slate-400 font-normal ml-2 text-xs normal-case tracking-normal">(Optional)</span>
                          <InfoTooltip text="Optional structural template to format the character card's fields. If omitted, the style guide will dictate the format." />
                        </Label>
                        <div className="flex gap-2">
                          <select
                            id="templateSelect"
                            value={forgeSelectedTemplate}
                            onChange={(e) => setForgeSelectedTemplate(e.target.value)}
                            className="flex h-11 w-full rounded-xl border border-[#e5e4e2] bg-[#f9f8f6] hover:bg-white focus:bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8B3A3A]/50 focus-visible:border-[#8B3A3A] transition-all"
                          >
                            <option value="">None (Use Style Guide)</option>
                            <optgroup label="Default Templates">
                              {DEFAULT_TEMPLATES.map((t) => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                              ))}
                            </optgroup>
                            {customTemplates.length > 0 && (
                              <optgroup label="Custom Templates">
                                {customTemplates.map((t) => (
                                  <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                              </optgroup>
                            )}
                          </select>
                          <Button
                            variant="outline"
                            className="h-11 px-3 border-[#e5e4e2] text-slate-600 hover:bg-slate-50 hover:text-[#8B3A3A] transition-colors"
                            onClick={() => document.getElementById('template-upload')?.click()}
                            title="Upload Custom Template"
                          >
                            <Upload className="w-4 h-4" />
                          </Button>
                          <input
                            type="file"
                            id="template-upload"
                            className="hidden"
                            accept=".txt,.md,.json"
                            onChange={handleTemplateUpload}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="charName" className="text-slate-700 font-medium flex items-center tracking-wide text-sm uppercase">
                          Character Name <span className="text-red-500 ml-1">*</span>
                          <InfoTooltip text="The full name or nickname of the character. Example: 'Silas Thorne' or 'Captain Elara'." />
                        </Label>
                        <Input
                          id="charName"
                          placeholder="e.g. Silas Thorne"
                          value={forgeName}
                          onChange={(e) => setForgeName(e.target.value)}
                          className="h-11 rounded-xl border-[#e5e4e2] bg-[#f9f8f6] hover:bg-white focus:bg-white focus-visible:ring-2 focus-visible:ring-[#8B3A3A]/50 focus-visible:border-[#8B3A3A] transition-all"
                        />
                      </div>

                      <div className="space-y-2 relative">
                        <Label htmlFor="charConcept" className="text-slate-700 font-medium flex items-center tracking-wide text-sm uppercase">
                          Core Concept / Archetype <span className="text-red-500 ml-1">*</span>
                          <InfoTooltip text="The fundamental trope or personality type. Example: 'The Grumpy Bodyguard' or 'A cynical detective with a heart of gold'." />
                        </Label>
                        <div className="flex flex-col gap-2">
                          <div className="flex gap-2">
                            <Input
                              id="charConcept"
                              placeholder="e.g. The Cold Grumpy Alpha / Brooding Bodyguard"
                              value={forgeConcept}
                              onChange={(e) => setForgeConcept(e.target.value)}
                              className="h-11 rounded-xl border-[#e5e4e2] bg-[#f9f8f6] hover:bg-white focus:bg-white focus-visible:ring-2 focus-visible:ring-[#8B3A3A]/50 focus-visible:border-[#8B3A3A] transition-all flex-1"
                              autoComplete="off"
                            />
                            <Button
                              variant="outline"
                              onClick={handleSuggestArchetype}
                              disabled={isSuggestingArchetype || forgeSlots.length === 0}
                              className="h-11 text-[#8B3A3A] border-[#e5e4e2] hover:bg-[#8B3A3A]/10 px-4"
                            >
                              {isSuggestingArchetype ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wand2 className="w-4 h-4 mr-2" />}
                              Auto-Suggest Archetype
                            </Button>
                          </div>
                          <div className="flex justify-end">
                            <ModelSelector
                              sectionId="forge_suggest"
                              globalProvider={provider}
                              globalModels={apiModels}
                              sectionConfigs={sectionConfigs}
                              setSectionConfigs={setSectionConfigs}
                              availableModels={availableModels}
                              isFetchingModels={isFetchingModels}
                            />
                          </div>
                        </div>
                      </div>

                      {forgeSlots.length > 0 && (
                        <div className="flex flex-col gap-2 pt-4 pb-2 border-b border-[#e5e4e2] mb-4">
                          <div className="flex items-center justify-between">
                            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Character Details</h3>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={handleAutoFill}
                              disabled={isAutoFilling || isExtractingSlots || !forgeName || !forgeConcept}
                              className="h-8 text-xs text-[#8B3A3A] border-[#8B3A3A]/30 hover:bg-[#8B3A3A]/10"
                            >
                              {isAutoFilling ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : <Wand2 className="w-3 h-3 mr-2" />}
                              Auto-Fill Empty Fields
                            </Button>
                          </div>
                          <div className="flex justify-end">
                            <ModelSelector
                              sectionId="forge_autofill"
                              globalProvider={provider}
                              globalModels={apiModels}
                              sectionConfigs={sectionConfigs}
                              setSectionConfigs={setSectionConfigs}
                              availableModels={availableModels}
                              isFetchingModels={isFetchingModels}
                            />
                          </div>
                        </div>
                      )}

                      {isExtractingSlots ? (
                        <div className="flex items-center justify-center py-12 text-slate-500 bg-[#f9f8f6] rounded-xl border border-dashed border-[#e5e4e2]">
                          <Loader2 className="w-6 h-6 animate-spin mr-2 text-[#8B3A3A]" />
                          <span className="font-medium">Extracting character details...</span>
                        </div>
                      ) : (
                        forgeSlots.map((slot, index) => (
                          <div key={index} className="space-y-2">
                            <div className="flex items-center justify-between">
                              <Label htmlFor={`slot-${index}`} className="text-slate-700 font-medium flex items-center tracking-wide text-sm uppercase">
                                {slot.name}
                                <InfoTooltip text={slot.description} />
                              </Label>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleGenerateSlot(index)}
                                disabled={generatingSlotIndex === index || !forgeSelectedGuide}
                                className="h-6 text-xs text-[#8B3A3A] hover:bg-[#8B3A3A]/10 px-2"
                                title={!forgeSelectedGuide ? "Select a style guide first" : "Auto-generate content for this field"}
                              >
                                {generatingSlotIndex === index ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Wand2 className="w-3 h-3 mr-1" />}
                                Auto
                              </Button>
                            </div>
                            <Textarea 
                              id={`slot-${index}`}
                              placeholder={`Enter ${slot.name.toLowerCase()}...`} 
                              value={slot.value}
                              onChange={(e) => {
                                const newSlots = [...forgeSlots];
                                newSlots[index] = { ...newSlots[index], value: e.target.value };
                                setForgeSlots(newSlots);
                              }}
                              className="rounded-xl border-[#e5e4e2] bg-[#f9f8f6] hover:bg-white focus:bg-white focus-visible:ring-2 focus-visible:ring-[#8B3A3A]/50 focus-visible:border-[#8B3A3A] transition-all min-h-[100px] resize-y"
                            />
                          </div>
                        ))
                      )}

                      {(!isExtractingSlots && forgeSlots.length > 0) && (
                        <div className="space-y-2 mt-4 pt-4 border-t border-[#e5e4e2]">
                          <Label htmlFor="first-message-idea" className="text-slate-700 font-medium flex items-center tracking-wide text-sm uppercase">
                            First Message / Scenario Idea
                            <InfoTooltip text="Provide a general idea or scenario for the character's first message. The AI will use this to generate the 'first_mes' and 'scenario' fields." />
                          </Label>
                          <Textarea 
                            id="first-message-idea"
                            placeholder="e.g., The character meets the user in a dark alleyway..." 
                            value={forgeFirstMessageIdea}
                            onChange={(e) => setForgeFirstMessageIdea(e.target.value)}
                            className="rounded-xl border-[#e5e4e2] bg-[#f9f8f6] hover:bg-white focus:bg-white focus-visible:ring-2 focus-visible:ring-[#8B3A3A]/50 focus-visible:border-[#8B3A3A] transition-all min-h-[100px] resize-y"
                          />
                        </div>
                      )}

                      <div className="flex flex-col gap-2 mt-4">
                        <div className="flex justify-end">
                          <ModelSelector
                            sectionId="forge_generate"
                            globalProvider={provider}
                            globalModels={apiModels}
                            sectionConfigs={sectionConfigs}
                            setSectionConfigs={setSectionConfigs}
                            availableModels={availableModels}
                            isFetchingModels={isFetchingModels}
                          />
                        </div>
                        <Button 
                          onClick={handleForgeCard} 
                          disabled={isForging || !forgeName || !forgeConcept || !forgeSelectedGuide} 
                          className="w-full rounded-xl bg-[#8B3A3A] hover:bg-[#7a3333] text-white py-6 text-lg shadow-md shadow-[#8B3A3A]/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                        >
                          {isForging ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Wand2 className="w-5 h-5 mr-2" />}
                          Forge Character
                        </Button>
                      </div>
                    </div>

                    {/* Output Preview */}
                    <div className="bg-white border border-[#e5e4e2] rounded-2xl md:rounded-3xl p-6 md:p-8 shadow-md hover:shadow-lg transition-shadow duration-300 flex flex-col h-full relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-slate-200 via-slate-300 to-slate-200"></div>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 md:mb-6 gap-4 sm:gap-0">
                        <h3 className="font-serif font-medium text-2xl md:text-3xl text-slate-900 tracking-tight">Forged Output</h3>
                        {forgedCard && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="flex items-center gap-1 mr-2">
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={forgedCardHistory.undo}
                                disabled={!forgedCardHistory.canUndo}
                                className="h-9 w-9 rounded-full border-[#e5e4e2] hover:bg-slate-50 hover:text-[#8B3A3A] text-slate-700 transition-colors"
                                title="Undo Generated Card"
                              >
                                <Undo2 className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={forgedCardHistory.redo}
                                disabled={!forgedCardHistory.canRedo}
                                className="h-9 w-9 rounded-full border-[#e5e4e2] hover:bg-slate-50 hover:text-[#8B3A3A] text-slate-700 transition-colors"
                                title="Redo Generated Card"
                              >
                                <Redo2 className="w-4 h-4" />
                              </Button>
                            </div>
                            <Button 
                              onClick={saveForgedCard}
                              variant="outline"
                              className="rounded-full border-[#e5e4e2] hover:bg-slate-50 hover:text-[#8B3A3A] text-slate-700 transition-colors"
                            >
                              <Save className="w-4 h-4 mr-2" />
                              Save to Library
                            </Button>
                            <Button 
                              onClick={downloadForgedCard}
                              variant="outline"
                              className="rounded-full border-[#e5e4e2] hover:bg-slate-50 hover:text-[#8B3A3A] text-slate-700 transition-colors"
                            >
                              <Download className="w-4 h-4 mr-2" />
                              Download JSON
                            </Button>
                          </div>
                        )}
                      </div>

                      {isForging ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center py-8 md:py-12">
                          <Loader2 className="w-8 h-8 md:w-12 md:h-12 text-[#8B3A3A] animate-spin mb-4 md:mb-6" />
                          <h4 className="text-lg md:text-xl font-serif font-medium text-slate-900">Forging Character...</h4>
                          <p className="text-slate-500 mt-2 max-w-xs text-sm md:text-base">
                            Applying style guide rules to generate description, personality, and first message.
                          </p>
                        </div>
                      ) : forgedCard ? (
                        <ScrollArea className="flex-1 -mx-4 px-4">
                          <div className="space-y-6 pb-4">
                            
                            {/* Image Generation Section */}
                            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
                              <div className="flex items-center justify-between">
                                <h4 className="text-sm font-bold tracking-widest text-slate-700 uppercase flex items-center gap-2">
                                  <ImageIcon className="w-4 h-4 text-[#8B3A3A]" />
                                  Character Portrait
                                </h4>
                                <ModelSelector
                                  sectionId="forge_image"
                                  globalProvider={provider}
                                  globalModels={apiModels}
                                  sectionConfigs={sectionConfigs}
                                  setSectionConfigs={setSectionConfigs}
                                  availableModels={availableModels}
                                  isFetchingModels={isFetchingModels}
                                  allowedProviders={["gemini"]}
                                  filterModels={(m) => m.id.includes("image") || m.id.includes("nano") || m.id.includes("banana")}
                                />
                              </div>
                              
                              <div className="flex flex-col md:flex-row gap-4">
                                <div className="flex-1 space-y-3">
                                  <Label className="text-xs font-bold tracking-widest text-slate-400 uppercase">Image Prompt</Label>
                                  <Textarea 
                                    value={imagePrompt}
                                    onChange={(e) => setImagePrompt(e.target.value)}
                                    placeholder="Click 'Generate Prompt' or write your own Midjourney/Niji prompt here..."
                                    className="bg-white p-3 rounded-xl text-xs text-slate-700 font-mono border border-slate-200 min-h-[100px] focus-visible:ring-[#8B3A3A]/50"
                                  />
                                  <div className="flex gap-2">
                                    <Button 
                                      onClick={handleGenerateImagePrompt} 
                                      disabled={isGeneratingImagePrompt}
                                      variant="outline"
                                      className="flex-1 rounded-xl text-xs h-9 border-slate-200 hover:bg-slate-100 hover:text-[#8B3A3A]"
                                    >
                                      {isGeneratingImagePrompt ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : <Wand2 className="w-3 h-3 mr-2" />}
                                      Generate Prompt
                                    </Button>
                                    <Button 
                                      onClick={handleGenerateImage} 
                                      disabled={isGeneratingImage || !imagePrompt}
                                      className="flex-1 rounded-xl text-xs h-9 bg-[#8B3A3A] hover:bg-[#7a3333] text-white"
                                    >
                                      {isGeneratingImage ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : <ImageIcon className="w-3 h-3 mr-2" />}
                                      Generate Image
                                    </Button>
                                  </div>
                                  <div className="grid grid-cols-3 gap-2 mt-2">
                                    <div className="space-y-1">
                                      <Label className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">Aspect Ratio</Label>
                                      <select
                                        value={imageAspectRatio}
                                        onChange={(e) => setImageAspectRatio(e.target.value)}
                                        className="flex h-8 w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#8B3A3A]/50"
                                      >
                                        <option value="1:1">1:1</option>
                                        <option value="3:4">3:4</option>
                                        <option value="4:3">4:3</option>
                                        <option value="9:16">9:16</option>
                                        <option value="16:9">16:9</option>
                                      </select>
                                    </div>
                                    <div className="space-y-1">
                                      <Label className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">Size</Label>
                                      <select
                                        value={imageSize}
                                        onChange={(e) => setImageSize(e.target.value)}
                                        className="flex h-8 w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#8B3A3A]/50"
                                      >
                                        <option value="512px">512px</option>
                                        <option value="1K">1K</option>
                                        <option value="2K">2K</option>
                                        <option value="4K">4K</option>
                                      </select>
                                    </div>
                                    <div className="space-y-1">
                                      <Label className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">Style</Label>
                                      <select
                                        value={imageStyle}
                                        onChange={(e) => setImageStyle(e.target.value)}
                                        className="flex h-8 w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#8B3A3A]/50"
                                      >
                                        <option value="None">None</option>
                                        <option value="Photorealistic">Photoreal</option>
                                        <option value="Anime / Manga">Anime</option>
                                        <option value="Digital Art">Digital</option>
                                        <option value="Oil Painting">Oil</option>
                                        <option value="Dark Fantasy">Fantasy</option>
                                        <option value="Cyberpunk">Cyberpunk</option>
                                        <option value="Watercolor">Watercolor</option>
                                        <option value="Comic Book">Comic</option>
                                      </select>
                                    </div>
                                  </div>
                                </div>
                                
                                <div className="w-full md:w-40 shrink-0 flex flex-col items-center justify-center">
                                  <div className="w-32 h-40 md:w-full md:h-48 bg-white border border-slate-200 rounded-xl overflow-hidden flex items-center justify-center relative shadow-sm group">
                                    {isGeneratingImage ? (
                                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm z-10">
                                        <Loader2 className="w-6 h-6 text-[#8B3A3A] animate-spin mb-2" />
                                        <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Generating</span>
                                      </div>
                                    ) : characterImage ? (
                                      <>
                                        <img src={characterImage} alt="Character Portrait" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                          <Button
                                            onClick={() => {
                                              const a = document.createElement("a");
                                              a.href = characterImage;
                                              a.download = `portrait_${forgedCard.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() || Date.now()}.png`;
                                              document.body.appendChild(a);
                                              a.click();
                                              document.body.removeChild(a);
                                            }}
                                            variant="secondary"
                                            size="sm"
                                            className="rounded-full text-xs"
                                          >
                                            <Download className="w-3 h-3 mr-1" />
                                            Download
                                          </Button>
                                        </div>
                                      </>
                                    ) : (
                                      <ImageIcon className="w-8 h-8 text-slate-300" />
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div>
                              <h4 className="text-xs font-bold tracking-widest text-slate-400 uppercase mb-2">Name</h4>
                              <Input 
                                value={forgedCard.name}
                                onChange={(e) => setForgedCard({ ...forgedCard, name: e.target.value })}
                                className="text-slate-900 font-medium text-lg h-10 bg-[#f9f8f6] border-[#e5e4e2]/50 focus-visible:ring-[#8B3A3A]/50"
                              />
                            </div>
                            
                            <div>
                              <h4 className="text-xs font-bold tracking-widest text-slate-400 uppercase mb-2">Description</h4>
                              <Textarea 
                                value={forgedCard.description}
                                onChange={(e) => setForgedCard({ ...forgedCard, description: e.target.value })}
                                className="bg-[#f9f8f6] p-5 rounded-2xl text-sm text-slate-700 font-mono border border-[#e5e4e2]/50 shadow-inner min-h-[150px] focus-visible:ring-[#8B3A3A]/50"
                              />
                            </div>

                            <div>
                              <h4 className="text-xs font-bold tracking-widest text-slate-400 uppercase mb-2">Personality</h4>
                              <Textarea 
                                value={forgedCard.personality}
                                onChange={(e) => setForgedCard({ ...forgedCard, personality: e.target.value })}
                                className="bg-[#f9f8f6] p-5 rounded-2xl text-sm text-slate-700 font-mono border border-[#e5e4e2]/50 shadow-inner min-h-[100px] focus-visible:ring-[#8B3A3A]/50"
                              />
                            </div>

                            <div>
                              <h4 className="text-xs font-bold tracking-widest text-slate-400 uppercase mb-2">First Message</h4>
                              <Textarea 
                                value={forgedCard.first_mes}
                                onChange={(e) => setForgedCard({ ...forgedCard, first_mes: e.target.value })}
                                className="bg-[#f9f8f6] p-5 rounded-2xl text-sm text-slate-700 font-mono border border-[#e5e4e2]/50 shadow-inner min-h-[150px] focus-visible:ring-[#8B3A3A]/50"
                              />
                            </div>

                            <div>
                              <h4 className="text-xs font-bold tracking-widest text-slate-400 uppercase mb-2">Scenario</h4>
                              <Textarea 
                                value={forgedCard.scenario || ""}
                                onChange={(e) => setForgedCard({ ...forgedCard, scenario: e.target.value })}
                                className="bg-[#f9f8f6] p-5 rounded-2xl text-sm text-slate-700 font-mono border border-[#e5e4e2]/50 shadow-inner min-h-[100px] focus-visible:ring-[#8B3A3A]/50"
                              />
                            </div>

                            <div>
                              <h4 className="text-xs font-bold tracking-widest text-slate-400 uppercase mb-2">Example Messages</h4>
                              <Textarea 
                                value={forgedCard.mes_example || ""}
                                onChange={(e) => setForgedCard({ ...forgedCard, mes_example: e.target.value })}
                                className="bg-[#f9f8f6] p-5 rounded-2xl text-sm text-slate-700 font-mono border border-[#e5e4e2]/50 shadow-inner min-h-[150px] focus-visible:ring-[#8B3A3A]/50"
                              />
                            </div>
                          </div>
                        </ScrollArea>
                      ) : (
                        <ScrollArea className="flex-1 -mx-4 px-4">
                          <div className="space-y-6 pb-4">
                            <div className="bg-white border border-[#e5e4e2] rounded-2xl p-6 relative overflow-hidden shadow-sm">
                              <div className="absolute top-0 right-0 bg-slate-100 text-slate-500 text-[10px] font-bold px-3 py-1 rounded-bl-lg uppercase tracking-widest border-b border-l border-[#e5e4e2]">Live Preview</div>
                              
                              <div className="flex items-center gap-4 mb-6 mt-2">
                                <div className="w-16 h-16 rounded-full bg-slate-100 border border-[#e5e4e2] flex items-center justify-center overflow-hidden shrink-0">
                                  <ImageIcon className="w-8 h-8 text-slate-300" />
                                </div>
                                <div className="overflow-hidden">
                                  <h2 className="text-2xl font-serif font-medium text-slate-900 truncate">{forgeName || "Character Name"}</h2>
                                  <p className="text-sm text-[#8B3A3A] font-medium truncate">{forgeConcept || "Core Concept / Archetype"}</p>
                                </div>
                              </div>

                              {forgeSlots.length > 0 ? (
                                <div className="space-y-4">
                                  {forgeSlots.map((slot, idx) => (
                                    <div key={idx}>
                                      <h4 className="text-[10px] font-bold tracking-widest text-slate-400 uppercase mb-1">{slot.name}</h4>
                                      <div className="text-sm text-slate-700 bg-[#f9f8f6] p-3 rounded-xl border border-[#e5e4e2]/50 min-h-[40px] whitespace-pre-wrap font-mono">
                                        {slot.value || <span className="text-slate-400 italic">Empty</span>}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-center py-12">
                                  <Wand2 className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                                  <p className="text-sm text-slate-500">
                                    Select a style guide and template to begin building your character.
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        </ScrollArea>
                      )}
                    </div>
                  </div>
                  )}
                </motion.div>
              )}

              {/* IMAGE STUDIO VIEW */}
              {view === "image" && (
                <motion.div
                  key="image"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-6 md:space-y-8"
                >
                  <div className="flex flex-col md:flex-row md:items-end justify-between border-b border-[#e5e4e2] pb-6 gap-4 md:gap-0">
                    <div className="space-y-2">
                      <h2 className="text-3xl md:text-5xl font-serif font-light tracking-tight text-slate-900">Portrait Studio</h2>
                      <p className="text-slate-500 text-base md:text-lg font-light">
                        Generate images for your characters using AI.
                      </p>
                    </div>
                    <ModelSelector
                      sectionId="forge_image"
                      globalProvider={provider}
                      globalModels={apiModels}
                      sectionConfigs={sectionConfigs}
                      setSectionConfigs={setSectionConfigs}
                      availableModels={availableModels}
                      isFetchingModels={isFetchingModels}
                      allowedProviders={["gemini"]}
                      filterModels={(m) => m.id.includes("image") || m.id.includes("nano") || m.id.includes("banana")}
                    />
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 h-full">
                    {/* Controls */}
                    <div className="bg-white border border-[#e5e4e2] rounded-2xl md:rounded-3xl p-6 md:p-8 shadow-sm flex flex-col h-full">
                      <h3 className="font-serif font-medium text-xl md:text-2xl text-slate-900 mb-6">Image Settings</h3>
                      
                      <div className="space-y-6 flex-1">
                        <div className="space-y-3">
                          <Label htmlFor="studioCardSelect" className="text-slate-700 font-medium flex items-center tracking-wide text-sm uppercase">
                            <BookOpen className="w-4 h-4 mr-2 text-[#8B3A3A]" />
                            Select Character (Optional)
                          </Label>
                          <select
                            id="studioCardSelect"
                            value={studioSelectedCard}
                            onChange={(e) => {
                              setStudioSelectedCard(e.target.value);
                              const card = savedCards.find(c => c.id === e.target.value);
                              if (card && card.card.image) {
                                setStudioCharacterImage(card.card.image);
                              } else {
                                setStudioCharacterImage("");
                              }
                            }}
                            className="w-full h-12 rounded-xl border border-[#e5e4e2] bg-[#f9f8f6] px-4 text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8B3A3A] transition-all shadow-inner"
                          >
                            <option value="">No character selected</option>
                            {savedCards.map(card => (
                              <option key={card.id} value={card.id}>{card.name} - {card.concept}</option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <Label className="text-slate-700 font-medium flex items-center tracking-wide text-sm uppercase">
                              <FileText className="w-4 h-4 mr-2 text-[#8B3A3A]" />
                              Image Prompt
                            </Label>
                            {studioSelectedCard && (
                              <Button 
                                onClick={handleGenerateStudioImagePrompt} 
                                disabled={isGeneratingStudioPrompt}
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs border-[#e5e4e2] hover:bg-slate-50 hover:text-[#8B3A3A]"
                              >
                                {isGeneratingStudioPrompt ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : <Wand2 className="w-3 h-3 mr-2" />}
                                Auto-Generate Prompt
                              </Button>
                            )}
                          </div>
                          <Textarea 
                            value={studioImagePrompt}
                            onChange={(e) => setStudioImagePrompt(e.target.value)}
                            placeholder="Describe the character's appearance, clothing, setting, and style..."
                            className="bg-[#f9f8f6] p-4 rounded-xl text-sm text-slate-700 font-mono border border-[#e5e4e2] min-h-[200px] focus-visible:ring-[#8B3A3A]/50 shadow-inner"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                        <div className="space-y-2">
                          <Label className="text-xs font-bold tracking-widest text-slate-400 uppercase">Aspect Ratio</Label>
                          <select
                            value={imageAspectRatio}
                            onChange={(e) => setImageAspectRatio(e.target.value)}
                            className="flex h-10 w-full rounded-xl border border-[#e5e4e2] bg-[#f9f8f6] hover:bg-white focus:bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8B3A3A]/50 focus-visible:border-[#8B3A3A] transition-all"
                          >
                            <option value="1:1">1:1 (Square)</option>
                            <option value="3:4">3:4 (Portrait)</option>
                            <option value="4:3">4:3 (Landscape)</option>
                            <option value="9:16">9:16 (Vertical)</option>
                            <option value="16:9">16:9 (Widescreen)</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-bold tracking-widest text-slate-400 uppercase">Image Size</Label>
                          <select
                            value={imageSize}
                            onChange={(e) => setImageSize(e.target.value)}
                            className="flex h-10 w-full rounded-xl border border-[#e5e4e2] bg-[#f9f8f6] hover:bg-white focus:bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8B3A3A]/50 focus-visible:border-[#8B3A3A] transition-all"
                          >
                            <option value="512px">512px</option>
                            <option value="1K">1K</option>
                            <option value="2K">2K</option>
                            <option value="4K">4K</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-bold tracking-widest text-slate-400 uppercase">Art Style</Label>
                          <select
                            value={imageStyle}
                            onChange={(e) => setImageStyle(e.target.value)}
                            className="flex h-10 w-full rounded-xl border border-[#e5e4e2] bg-[#f9f8f6] hover:bg-white focus:bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8B3A3A]/50 focus-visible:border-[#8B3A3A] transition-all"
                          >
                            <option value="None">None (Prompt Only)</option>
                            <option value="Photorealistic">Photorealistic</option>
                            <option value="Anime / Manga">Anime / Manga</option>
                            <option value="Digital Art">Digital Art</option>
                            <option value="Oil Painting">Oil Painting</option>
                            <option value="Dark Fantasy">Dark Fantasy</option>
                            <option value="Cyberpunk">Cyberpunk</option>
                            <option value="Watercolor">Watercolor</option>
                            <option value="Comic Book">Comic Book</option>
                          </select>
                        </div>
                      </div>

                      <div className="mt-8 pt-6 border-t border-[#e5e4e2]">
                        <Button 
                          onClick={handleGenerateStudioImage}
                          disabled={isGeneratingStudioImage || !studioImagePrompt.trim()}
                          className="w-full h-14 text-lg font-medium rounded-xl bg-[#8B3A3A] hover:bg-[#7a3333] text-white shadow-md hover:shadow-lg transition-all"
                        >
                          {isGeneratingStudioImage ? (
                            <>
                              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                              Generating Image...
                            </>
                          ) : (
                            <>
                              <ImageIcon className="w-5 h-5 mr-2" />
                              Generate Portrait
                            </>
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* Image Preview */}
                    <div className="bg-white border border-[#e5e4e2] rounded-2xl md:rounded-3xl p-6 md:p-8 shadow-md hover:shadow-lg transition-shadow duration-300 flex flex-col h-full relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-slate-200 via-slate-300 to-slate-200"></div>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 md:mb-6 gap-4 sm:gap-0">
                        <h3 className="font-serif font-medium text-2xl md:text-3xl text-slate-900 tracking-tight">Generated Portrait</h3>
                        <div className="flex items-center gap-2">
                          {studioCharacterImage && (
                            <Button 
                              onClick={() => {
                                const a = document.createElement("a");
                                a.href = studioCharacterImage;
                                a.download = `portrait_${Date.now()}.png`;
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                              }}
                              variant="outline"
                              className="rounded-full border-[#e5e4e2] hover:bg-slate-50 hover:text-[#8B3A3A] text-slate-700 transition-colors"
                            >
                              <Download className="w-4 h-4 mr-2" />
                              Download
                            </Button>
                          )}
                          {studioCharacterImage && studioSelectedCard && (
                            <Button 
                              onClick={handleSaveStudioImage}
                              variant="outline"
                              className="rounded-full border-[#e5e4e2] hover:bg-slate-50 hover:text-[#8B3A3A] text-slate-700 transition-colors"
                            >
                              <Save className="w-4 h-4 mr-2" />
                              Save to Character
                            </Button>
                          )}
                        </div>
                      </div>

                      <div className="flex-1 flex items-center justify-center bg-[#f9f8f6] border border-[#e5e4e2] rounded-2xl overflow-hidden relative min-h-[400px]">
                        {isGeneratingStudioImage ? (
                          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/50 backdrop-blur-sm z-10">
                            <Loader2 className="w-12 h-12 text-[#8B3A3A] animate-spin mb-4" />
                            <h4 className="text-xl font-serif font-medium text-slate-900">Painting...</h4>
                            <p className="text-slate-500 mt-2 text-sm">This may take a few moments.</p>
                          </div>
                        ) : studioCharacterImage ? (
                          <img src={studioCharacterImage} alt="Generated Portrait" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="text-center p-8">
                            <ImageIcon className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                            <p className="text-slate-500 font-medium">No image generated yet.</p>
                            <p className="text-slate-400 text-sm mt-2">Enter a prompt and click Generate to see the result here.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* UNIVERSE MAP VIEW */}
              {view === "universe" && (
                <motion.div
                  key="universe"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-6 md:space-y-8 h-full flex flex-col"
                >
                  <div className="border-b border-[#e5e4e2] pb-6 shrink-0 flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div>
                      <h2 className="text-3xl md:text-5xl font-serif font-light tracking-tight text-slate-900">Universe Map</h2>
                      <p className="text-slate-500 text-base md:text-lg font-light mt-2">
                        Visualize character relationships and the NPC-to-Protagonist pipeline.
                      </p>
                    </div>
                    <ModelSelector
                      sectionId="universe"
                      globalProvider={provider}
                      globalModels={apiModels}
                      sectionConfigs={sectionConfigs}
                      setSectionConfigs={setSectionConfigs}
                      availableModels={availableModels}
                      isFetchingModels={isFetchingModels}
                    />
                  </div>

                  <div className="bg-white border border-[#e5e4e2] rounded-2xl md:rounded-3xl p-6 md:p-8 shadow-sm space-y-4 md:space-y-6 shrink-0">
                    <div className="flex flex-col md:flex-row gap-4 items-end">
                      <div className="space-y-2 flex-1 w-full">
                        <Label htmlFor="universeGuideSelect" className="text-slate-700 font-medium flex items-center">
                          Select Style Guide to Analyze (Optional)
                        </Label>
                        <select
                          id="universeGuideSelect"
                          value={universeSelectedGuide}
                          onChange={(e) => setUniverseSelectedGuide(e.target.value)}
                          className="flex h-10 w-full rounded-xl border border-[#e5e4e2] bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8B3A3A]"
                        >
                          <option value="">No guide selected (Use cards only)</option>
                          {guides.map((g) => (
                            <option key={g.id} value={g.id}>{g.title}</option>
                          ))}
                        </select>
                      </div>
                      <Button 
                        onClick={handleExtractUniverse} 
                        disabled={isExtractingUniverse || (!universeSelectedGuide && universeSelectedCards.size === 0)} 
                        className="w-full md:w-auto rounded-xl bg-[#8B3A3A] hover:bg-[#7a3333] text-white h-10 px-6 shadow-md shadow-[#8B3A3A]/20 transition-all"
                      >
                        {isExtractingUniverse ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Network className="w-4 h-4 mr-2" />}
                        Extract Universe
                      </Button>
                    </div>

                    {savedCards.length > 0 && (
                      <div className="space-y-3 pt-4 border-t border-[#e5e4e2]">
                        <Label className="text-slate-700 font-medium flex items-center">
                          Include Saved Cards in Lore Building
                        </Label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                          {savedCards.map(card => (
                            <div key={card.id} className="flex items-center space-x-2 bg-[#f9f8f6] p-3 rounded-xl border border-[#e5e4e2]">
                              <Checkbox 
                                id={`universe-card-${card.id}`}
                                checked={universeSelectedCards.has(card.id)}
                                onCheckedChange={(checked) => {
                                  setUniverseSelectedCards(prev => {
                                    const next = new Set(prev);
                                    if (checked) next.add(card.id);
                                    else next.delete(card.id);
                                    return next;
                                  });
                                }}
                              />
                              <label
                                htmlFor={`universe-card-${card.id}`}
                                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer truncate"
                              >
                                {card.name}
                              </label>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-h-[500px] bg-white border border-[#e5e4e2] rounded-2xl md:rounded-3xl shadow-sm overflow-hidden relative">
                    {isExtractingUniverse ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-center bg-white/80 backdrop-blur-sm z-20">
                        <Loader2 className="w-8 h-8 md:w-12 md:h-12 text-[#8B3A3A] animate-spin mb-4 md:mb-6" />
                        <h4 className="text-lg md:text-xl font-serif font-medium text-slate-900">Analyzing Relationships...</h4>
                        <p className="text-slate-500 mt-2 max-w-xs text-sm md:text-base">
                          Extracting characters, shared universes, and pipeline progressions.
                        </p>
                      </div>
                    ) : universeData && universeData.nodes.length > 0 ? (
                      <UniverseMap data={universeData} onAddLink={handleAddUniverseLink} />
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6">
                        <div className="w-16 h-16 rounded-full bg-[#f0efe9] flex items-center justify-center mb-4">
                          <Network className="w-6 h-6 text-slate-400" />
                        </div>
                        <h4 className="text-lg font-serif font-medium text-slate-900">No Universe Data</h4>
                        <p className="text-slate-500 mt-2 max-w-xs text-sm">
                          Select a style guide or character cards, then click Extract Universe to visualize relationships.
                        </p>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {/* SETTINGS VIEW */}
              {view === "settings" && (
                <motion.div
                  key="settings"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-6 md:space-y-8 max-w-3xl"
                >
                  <div className="border-b border-[#e5e4e2] pb-6">
                    <h2 className="text-3xl md:text-5xl font-serif font-light tracking-tight text-slate-900">Configuration</h2>
                    <p className="text-slate-500 text-base md:text-lg font-light mt-2">
                      Manage AI providers and API keys. Data is stored locally in your browser.
                    </p>
                  </div>

                  <div className="bg-white border border-[#e5e4e2] rounded-2xl md:rounded-3xl p-6 md:p-8 shadow-sm space-y-6 md:space-y-8">
                    <div>
                      <h3 className="font-serif font-medium text-xl md:text-2xl text-slate-900 mb-4">Active Synthesis Engine</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        {(["gemini", "anthropic", "openrouter", "openai", "custom"] as AIProvider[]).map((p) => (
                          <div
                            key={p}
                            className={cn(
                              "flex items-center justify-center rounded-xl border-2 p-4 cursor-pointer transition-all",
                              provider === p 
                                ? "border-[#8B3A3A] bg-[#8B3A3A]/5 text-[#8B3A3A]" 
                                : "border-[#e5e4e2] bg-transparent hover:bg-[#f9f8f6] text-slate-600"
                            )}
                            onClick={() => setProvider(p)}
                          >
                            <span className="font-medium capitalize tracking-wide">{p}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="pt-6 md:pt-8 border-t border-[#e5e4e2]">
                      <h3 className="font-serif font-medium text-xl md:text-2xl text-slate-900 mb-4 md:mb-6">API Credentials</h3>
                      <div className="space-y-4 md:space-y-6">
                        <div className="space-y-2">
                          <Label htmlFor="gemini" className="text-slate-700 font-medium">Gemini API Key</Label>
                          <Input
                            id="gemini"
                            type="password"
                            placeholder="AIzaSy..."
                            value={apiKeys.gemini}
                            onChange={(e) => setApiKeys({ ...apiKeys, gemini: e.target.value })}
                            className="rounded-xl border-[#e5e4e2] focus-visible:ring-[#8B3A3A]"
                          />
                          <p className="text-xs text-slate-500">Leave blank to use the default AI Studio key.</p>
                          {availableModels["gemini"]?.length > 0 && (
                            <div className="mt-2">
                              <Label htmlFor="gemini-model" className="text-slate-700 font-medium text-sm">Model</Label>
                              <select
                                id="gemini-model"
                                value={apiModels["gemini"] || ""}
                                onChange={(e) => setApiModels({ ...apiModels, gemini: e.target.value })}
                                className="w-full mt-1 rounded-xl border-[#e5e4e2] focus-visible:ring-[#8B3A3A] p-2 border bg-white text-sm"
                              >
                                {availableModels["gemini"].map(m => (
                                  <option key={m.id} value={m.id}>{m.name}</option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor="anthropic" className="text-slate-700 font-medium">Anthropic API Key</Label>
                          <Input
                            id="anthropic"
                            type="password"
                            placeholder="sk-ant-..."
                            value={apiKeys.anthropic}
                            onChange={(e) => setApiKeys({ ...apiKeys, anthropic: e.target.value })}
                            className="rounded-xl border-[#e5e4e2] focus-visible:ring-[#8B3A3A]"
                          />
                          {availableModels["anthropic"]?.length > 0 && (
                            <div className="mt-2">
                              <Label htmlFor="anthropic-model" className="text-slate-700 font-medium text-sm">Model</Label>
                              <select
                                id="anthropic-model"
                                value={apiModels["anthropic"] || ""}
                                onChange={(e) => setApiModels({ ...apiModels, anthropic: e.target.value })}
                                className="w-full mt-1 rounded-xl border-[#e5e4e2] focus-visible:ring-[#8B3A3A] p-2 border bg-white text-sm"
                              >
                                {availableModels["anthropic"].map(m => (
                                  <option key={m.id} value={m.id}>{m.name}</option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="openai" className="text-slate-700 font-medium">OpenAI API Key</Label>
                          <Input
                            id="openai"
                            type="password"
                            placeholder="sk-proj-..."
                            value={apiKeys.openai}
                            onChange={(e) => setApiKeys({ ...apiKeys, openai: e.target.value })}
                            className="rounded-xl border-[#e5e4e2] focus-visible:ring-[#8B3A3A]"
                          />
                          {availableModels["openai"]?.length > 0 && (
                            <div className="mt-2">
                              <Label htmlFor="openai-model" className="text-slate-700 font-medium text-sm">Model</Label>
                              <select
                                id="openai-model"
                                value={apiModels["openai"] || ""}
                                onChange={(e) => setApiModels({ ...apiModels, openai: e.target.value })}
                                className="w-full mt-1 rounded-xl border-[#e5e4e2] focus-visible:ring-[#8B3A3A] p-2 border bg-white text-sm"
                              >
                                {availableModels["openai"].map(m => (
                                  <option key={m.id} value={m.id}>{m.name}</option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="openrouter" className="text-slate-700 font-medium">OpenRouter API Key</Label>
                          <Input
                            id="openrouter"
                            type="password"
                            placeholder="sk-or-v1-..."
                            value={apiKeys.openrouter}
                            onChange={(e) => setApiKeys({ ...apiKeys, openrouter: e.target.value })}
                            className="rounded-xl border-[#e5e4e2] focus-visible:ring-[#8B3A3A]"
                          />
                          {availableModels["openrouter"]?.length > 0 && (
                            <div className="mt-2">
                              <Label htmlFor="openrouter-model" className="text-slate-700 font-medium text-sm">Model</Label>
                              <select
                                id="openrouter-model"
                                value={apiModels["openrouter"] || ""}
                                onChange={(e) => setApiModels({ ...apiModels, openrouter: e.target.value })}
                                className="w-full mt-1 rounded-xl border-[#e5e4e2] focus-visible:ring-[#8B3A3A] p-2 border bg-white text-sm"
                              >
                                {availableModels["openrouter"].map(m => (
                                  <option key={m.id} value={m.id}>{m.name}</option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>

                        <div className="pt-6 mt-6 border-t border-[#e5e4e2] space-y-6">
                          <h4 className="font-medium text-slate-900">Custom API Endpoint</h4>
                          <div className="space-y-2">
                            <Label htmlFor="customEndpoint" className="text-slate-700 font-medium">Endpoint URL</Label>
                            <Input
                              id="customEndpoint"
                              placeholder="https://your-api.com/v1/chat/completions"
                              value={apiKeys.customEndpoint}
                              onChange={(e) => setApiKeys({ ...apiKeys, customEndpoint: e.target.value })}
                              className="rounded-xl border-[#e5e4e2] focus-visible:ring-[#8B3A3A]"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="customKey" className="text-slate-700 font-medium">Custom API Key</Label>
                            <Input
                              id="customKey"
                              type="password"
                              value={apiKeys.customKey}
                              onChange={(e) => setApiKeys({ ...apiKeys, customKey: e.target.value })}
                              className="rounded-xl border-[#e5e4e2] focus-visible:ring-[#8B3A3A]"
                            />
                          </div>
                          {availableModels["custom"]?.length > 0 && (
                            <div className="mt-2">
                              <Label htmlFor="custom-model" className="text-slate-700 font-medium text-sm">Model</Label>
                              <select
                                id="custom-model"
                                value={apiModels["custom"] || ""}
                                onChange={(e) => setApiModels({ ...apiModels, custom: e.target.value })}
                                className="w-full mt-1 rounded-xl border-[#e5e4e2] focus-visible:ring-[#8B3A3A] p-2 border bg-white text-sm"
                              >
                                {availableModels["custom"].map(m => (
                                  <option key={m.id} value={m.id}>{m.name}</option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

            </AnimatePresence>

            {/* Hidden Export Container */}
            {exportingCard && (
              <div className="fixed top-0 left-0 -z-50 opacity-0 pointer-events-none">
                <div id="export-card-container" className="bg-[#f9f8f6] p-8 rounded-3xl shadow-xl w-[800px] font-sans text-slate-900 border border-[#e5e4e2]">
                  <div className="border-b border-[#e5e4e2] pb-6 mb-6 flex items-center gap-6">
                    {exportingCard.image && (
                      <div className="w-32 h-32 rounded-2xl overflow-hidden flex-shrink-0 border-2 border-white shadow-md">
                        <img src={exportingCard.image} alt={exportingCard.name} className="w-full h-full object-cover" />
                      </div>
                    )}
                    <div>
                      <h1 className="text-4xl font-serif font-bold text-[#8B3A3A] mb-2">{exportingCard.name || "Unknown Character"}</h1>
                      {exportingCard.creator && <p className="text-sm font-medium text-slate-500 uppercase tracking-widest">By {exportingCard.creator}</p>}
                    </div>
                  </div>
                  
                  <div className="space-y-6">
                    {exportingCard.description && (
                      <div className="bg-white p-6 rounded-2xl border border-[#e5e4e2]">
                        <h3 className="text-lg font-serif font-bold text-slate-800 border-b border-[#e5e4e2] pb-2 mb-3">Description</h3>
                        <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{exportingCard.description}</div>
                      </div>
                    )}
                    {exportingCard.personality && (
                      <div className="bg-white p-6 rounded-2xl border border-[#e5e4e2]">
                        <h3 className="text-lg font-serif font-bold text-slate-800 border-b border-[#e5e4e2] pb-2 mb-3">Personality</h3>
                        <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{exportingCard.personality}</div>
                      </div>
                    )}
                    {exportingCard.scenario && (
                      <div className="bg-white p-6 rounded-2xl border border-[#e5e4e2]">
                        <h3 className="text-lg font-serif font-bold text-slate-800 border-b border-[#e5e4e2] pb-2 mb-3">Scenario</h3>
                        <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{exportingCard.scenario}</div>
                      </div>
                    )}
                    {exportingCard.first_mes && (
                      <div className="bg-white p-6 rounded-2xl border border-[#e5e4e2]">
                        <h3 className="text-lg font-serif font-bold text-slate-800 border-b border-[#e5e4e2] pb-2 mb-3">First Message</h3>
                        <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed italic bg-slate-50 p-4 rounded-xl border border-[#e5e4e2]">{exportingCard.first_mes}</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
