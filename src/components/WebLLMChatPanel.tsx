'use client';

/**
 * WebLLM-powered AI Chat Panel
 *
 * This component wraps ThemedAIChatPanel and provides it with a WebLLM-based
 * custom chat handler instead of a server API.
 */

import { useTheme } from '@principal-ade/industry-theme';
import { ThemedAIChat } from '@principal-ade/industry-themed-ai-sdk-panel';
import type { PanelComponentProps, CustomChatHandler } from '@principal-ade/industry-themed-ai-sdk-panel';
import { useWebLLM, AVAILABLE_MODELS, ModelId } from '@/contexts/WebLLMContext';
import { useMemo, useState } from 'react';

interface WebLLMChatPanelProps extends PanelComponentProps {
  placeholder?: string;
}

export function WebLLMChatPanel({
  events,
  placeholder = 'Ask me anything about your code...',
}: WebLLMChatPanelProps) {
  const { theme } = useTheme();
  const webllm = useWebLLM();
  const [selectedModelId, setSelectedModelId] = useState<ModelId | null>(null);

  // Create custom handler from WebLLM context
  const customHandler: CustomChatHandler = useMemo(
    () => ({
      messages: webllm.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
      })),
      isGenerating: webllm.isGenerating,
      sendMessage: webllm.sendMessage,
      clearMessages: webllm.clearMessages,
      stopGeneration: webllm.stopGeneration,
      status: webllm.status,
      loadProgress: webllm.loadProgress,
      loadProgressText: webllm.loadProgressText,
      error: webllm.error,
    }),
    [webllm]
  );

  // Emit panel events for chat actions
  const handleFinish = (message: { role: string; content: string }) => {
    events.emit({
      type: 'ai-chat:message-received',
      source: 'webllm.ai-chat',
      timestamp: Date.now(),
      payload: { message },
    });
  };

  const handleError = (error: Error) => {
    events.emit({
      type: 'ai-chat:error',
      source: 'webllm.ai-chat',
      timestamp: Date.now(),
      payload: { error: error.message },
    });
  };

  // Handle model selection
  const handleModelSelect = async (modelId: ModelId) => {
    setSelectedModelId(modelId);
    await webllm.loadModel(modelId);
  };

  // If no model is loaded, show model selection UI
  if (webllm.status === 'idle' && !selectedModelId) {
    return (
      <div
        className="h-full w-full flex flex-col items-center justify-center p-6"
        style={{
          background: theme.colors.background,
          color: theme.colors.text,
          fontFamily: theme.fonts.body,
        }}
      >
        <div className="max-w-md w-full space-y-4">
          <div className="text-center space-y-2">
            <h3
              className="text-lg font-semibold"
              style={{ color: theme.colors.text }}
            >
              Local AI Assistant
            </h3>
            <p
              className="text-sm"
              style={{ color: theme.colors.textMuted }}
            >
              Select a model to run locally in your browser using WebGPU.
              Models are downloaded once and cached.
            </p>
          </div>

          <div className="space-y-2">
            {AVAILABLE_MODELS.map((model) => (
              <button
                key={model.id}
                onClick={() => handleModelSelect(model.id)}
                className="w-full p-3 rounded-md text-left transition-all hover:opacity-90"
                style={{
                  background: theme.colors.surface,
                  border: `1px solid ${theme.colors.border}`,
                }}
              >
                <div className="flex justify-between items-center">
                  <span style={{ color: theme.colors.text, fontWeight: 500 }}>
                    {model.name}
                  </span>
                  <span
                    className="text-xs px-2 py-0.5 rounded"
                    style={{
                      background: theme.colors.backgroundTertiary,
                      color: theme.colors.textMuted,
                    }}
                  >
                    {model.size}
                  </span>
                </div>
              </button>
            ))}
          </div>

          <p
            className="text-xs text-center"
            style={{ color: theme.colors.textMuted }}
          >
            Requires WebGPU support. Works best in Chrome/Edge.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ThemedAIChat
      theme={theme}
      customHandler={customHandler}
      placeholder={placeholder}
      showLoadingIndicator={true}
      onFinish={handleFinish}
      onError={handleError}
    />
  );
}
