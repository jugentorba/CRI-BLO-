import { useState, useCallback } from 'react';
import { AIMessage, AIContext } from '@/lib/ai/AIAssistantService';
import AIAssistantService from '@/lib/ai/AIAssistantService';

export interface UseAIAssistantResult {
  messages: AIMessage[];
  isLoading: boolean;
  error: Error | null;
  sendMessage: (message: string) => Promise<void>;
  getMissingSuggestions: () => Promise<string[]>;
  checkEvidenceCompleteness: () => Promise<{ complete: boolean; missing: string[] }>;
  clearHistory: () => void;
  updateContext: (intervention: any) => Promise<void>;
  setLocationContext: (coordinates: any, address?: string) => void;
}

let aiService: AIAssistantService | null = null;

export function useAIAssistant(
  apiKey?: string
): UseAIAssistantResult {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Initialize service
  if (!aiService && apiKey) {
    aiService = new AIAssistantService(apiKey);
  }

  const sendMessage = useCallback(
    async (message: string) => {
      if (!aiService) {
        setError(new Error('AI service not initialized'));
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        const response = await aiService.sendMessage(message);
        setMessages(aiService.getHistory());
      } catch (err) {
        const error = err instanceof Error ? err : new Error('AI error');
        setError(error);
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const getMissingSuggestions = useCallback(async () => {
    if (!aiService) return [];
    return aiService.getMissingSuggestions();
  }, []);

  const checkEvidenceCompleteness = useCallback(async () => {
    if (!aiService) {
      return { complete: false, missing: ['AI not initialized'] };
    }
    return aiService.checkEvidenceCompleteness();
  }, []);

  const clearHistory = useCallback(() => {
    if (aiService) {
      aiService.clearHistory();
      setMessages([]);
    }
  }, []);

  const updateContext = useCallback(async (intervention: any) => {
    if (aiService) {
      await aiService.updateContext(intervention);
    }
  }, []);

  const setLocationContext = useCallback(
    (coordinates: any, address?: string) => {
      if (aiService) {
        aiService.setLocationContext(coordinates, address);
      }
    },
    []
  );

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    getMissingSuggestions,
    checkEvidenceCompleteness,
    clearHistory,
    updateContext,
    setLocationContext,
  };
}

export default useAIAssistant;