import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  MessageCircle,
  Send,
  Loader,
  AlertCircle,
  CheckCircle2,
  Lightbulb,
  X,
} from 'lucide-react';
import { AIMessage } from '@/lib/ai/AIAssistantService';

interface AIAssistantViewProps {
  messages: AIMessage[];
  isLoading: boolean;
  error?: Error | null;
  onSendMessage: (message: string) => Promise<void>;
  onClose?: () => void;
  suggestions?: string[];
}

export function AIAssistantView({
  messages,
  isLoading,
  error,
  onSendMessage,
  onClose,
  suggestions,
}: AIAssistantViewProps) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const message = input.trim();
    setInput('');

    try {
      await onSendMessage(message);
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  };

  return (
    <Card className="h-full flex flex-col bg-gradient-to-b from-blue-50 to-white">
      <CardHeader className="pb-3 border-b flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-blue-600" />
            Field Assistant
          </CardTitle>
          {onClose && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
        {/* Messages */}
        <ScrollArea
          ref={scrollRef}
          className="flex-1 p-4 space-y-4 overflow-auto"
        >
          {messages.length === 0 && !suggestions && (
            <div className="text-center py-8">
              <MessageCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">Ask me anything about your work</p>
            </div>
          )}

          {/* Suggestions */}
          {suggestions && suggestions.length > 0 && messages.length === 0 && (
            <div className="space-y-2">
              <div className="flex items-start gap-2 p-3 bg-yellow-50 rounded-lg">
                <Lightbulb className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-medium text-sm mb-2">Suggestions:</div>
                  {suggestions.map((suggestion, idx) => (
                    <div key={idx} className="text-sm text-gray-700 mb-1">
                      • {suggestion}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Chat messages */}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-none'
                    : 'bg-gray-200 text-gray-900 rounded-bl-none'
                }`}
              >
                <p className="text-sm">{msg.content}</p>
                <p className="text-xs mt-1 opacity-70">
                  {new Date(msg.timestamp).toLocaleTimeString('fr-FR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            </div>
          ))}

          {/* Loading */}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-gray-200 text-gray-900 px-4 py-2 rounded-lg rounded-bl-none">
                <Loader className="w-5 h-5 animate-spin" />
              </div>
            </div>
          )}
        </ScrollArea>

        {/* Error */}
        {error && (
          <Alert variant="destructive" className="mx-4 mt-2">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}

        {/* Input */}
        <div className="p-4 border-t bg-white flex-shrink-0">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && !isLoading) {
                  handleSend();
                }
              }}
              placeholder="Ask a question..."
              disabled={isLoading}
              className="flex-1"
            />
            <Button
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              className="bg-blue-600 hover:bg-blue-700"
              size="sm"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default AIAssistantView;