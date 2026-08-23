import { StoredIntervention, StoredPhoto } from '@/lib/storage/database';
import { offlineStorageService } from '@/lib/storage/OfflineStorageService';

export interface AIMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface AIContext {
  currentIntervention?: StoredIntervention;
  currentPhotos?: StoredPhoto[];
  formData?: Record<string, any>;
  location?: {
    coordinates?: { latitude: number; longitude: number; accuracy: number };
    address?: string;
  };
}

class AIAssistantService {
  private apiKey: string;
  private model = 'gpt-4';
  private conversationHistory: AIMessage[] = [];
  private context: AIContext = {};

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Update context from current intervention/data
   */
  async updateContext(intervention?: StoredIntervention): Promise<void> {
    this.context = {};

    if (intervention) {
      this.context.currentIntervention = intervention;
      this.context.formData = intervention.data;

      const photos = await offlineStorageService.getPhotosForIntervention(
        intervention.id
      );
      this.context.currentPhotos = photos;
    }
  }

  /**
   * Set location context
   */
  setLocationContext(coordinates: any, address?: string): void {
    this.context.location = {
      coordinates,
      address,
    };
  }

  /**
   * Send message to AI and get response
   */
  async sendMessage(userMessage: string): Promise<AIMessage> {
    const userMsg: AIMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: userMessage,
      timestamp: Date.now(),
    };

    this.conversationHistory.push(userMsg);

    try {
      const contextText = this.buildContextText();
      const messages = this.conversationHistory.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: `You are CRI-BLO, a field work assistant for fiber technicians. You help technicians complete interventions quickly and accurately. ${contextText}`,
            },
            ...messages,
          ],
          max_tokens: 500,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }

      const data = await response.json();
      const assistantContent =
        data.choices[0]?.message?.content ||
        'Unable to process response';

      const assistantMsg: AIMessage = {
        id: `msg_${Date.now()}`,
        role: 'assistant',
        content: assistantContent,
        timestamp: Date.now(),
      };

      this.conversationHistory.push(assistantMsg);
      return assistantMsg;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`AI request failed: ${errorMsg}`);
    }
  }

  /**
   * Get suggestions for missing information
   */
  async getMissingSuggestions(): Promise<string[]> {
    const intervention = this.context.currentIntervention;
    if (!intervention) {
      return [];
    }

    const suggestions: string[] = [];

    // Check for missing photos
    const photoCount = this.context.currentPhotos?.length || 0;
    if (photoCount === 0) {
      suggestions.push('No photos captured yet. Consider taking before/after photos.');
    }

    // Check for missing form fields
    const requiredFields = ['location', 'type', 'status'];
    for (const field of requiredFields) {
      if (!intervention.data[field]) {
        suggestions.push(`Missing required field: ${field}`);
      }
    }

    return suggestions;
  }

  /**
   * Check if evidence is complete
   */
  async checkEvidenceCompleteness(): Promise<{
    complete: boolean;
    missing: string[];
  }> {
    const missing: string[] = [];

    if (!this.context.currentPhotos || this.context.currentPhotos.length === 0) {
      missing.push('No evidence photos');
    }

    if (!this.context.location?.coordinates) {
      missing.push('GPS coordinates');
    }

    if (!this.context.location?.address) {
      missing.push('Address');
    }

    return {
      complete: missing.length === 0,
      missing,
    };
  }

  /**
   * Get conversation history
   */
  getHistory(): AIMessage[] {
    return [...this.conversationHistory];
  }

  /**
   * Clear conversation
   */
  clearHistory(): void {
    this.conversationHistory = [];
  }

  private buildContextText(): string {
    const parts: string[] = [];

    if (this.context.currentIntervention) {
      parts.push(
        `Current intervention: ${JSON.stringify(this.context.formData)}`
      );
    }

    if (this.context.currentPhotos) {
      parts.push(`Photos captured: ${this.context.currentPhotos.length}`);
    }

    if (this.context.location) {
      parts.push(`Location: ${this.context.location.address || 'No address'}`);
    }

    return parts.join('. ');
  }
}

export default AIAssistantService;