'use client';

/**
 * AI Chat Panel with Provider Selection
 *
 * Allows users to choose between:
 * - Local models (WebLLM - runs in browser)
 * - Gemini API (fast, cheap cloud model)
 */

import { useTheme } from '@principal-ade/industry-theme';
import { ThemedAIChat } from '@principal-ade/industry-themed-ai-sdk/components';
import type { PanelComponentProps, CustomChatHandler } from '@principal-ade/industry-themed-ai-sdk';
import { useWebLLM, AVAILABLE_MODELS, ModelId } from '@/contexts/WebLLMContext';
import { useGemini } from '@/contexts/GeminiContext';
import { useMemo, useState } from 'react';
import { Cpu, Cloud, ChevronLeft } from 'lucide-react';

export type AIProvider = 'local' | 'gemini';

interface AIChatPanelProps extends PanelComponentProps {
  placeholder?: string;
}

export function AIChatPanel({
  events,
  placeholder = 'Ask me anything about your code...',
}: AIChatPanelProps) {
  const { theme } = useTheme();
  const webllm = useWebLLM();
  const gemini = useGemini();

  const [selectedProvider, setSelectedProvider] = useState<AIProvider | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<ModelId | null>(null);

  // Create custom handler based on selected provider
  const customHandler: CustomChatHandler | null = useMemo(() => {
    if (selectedProvider === 'local' && webllm.status !== 'idle') {
      return {
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
      };
    }

    if (selectedProvider === 'gemini') {
      return {
        messages: gemini.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
        })),
        isGenerating: gemini.isGenerating,
        sendMessage: gemini.sendMessage,
        clearMessages: gemini.clearMessages,
        stopGeneration: gemini.stopGeneration,
        status: gemini.status,
        error: gemini.error,
      };
    }

    return null;
  }, [selectedProvider, webllm, gemini]);

  // Emit panel events for chat actions
  const handleFinish = (message: { role: string; content: string }) => {
    events.emit({
      type: 'ai-chat:message-received',
      source: `${selectedProvider}.ai-chat`,
      timestamp: Date.now(),
      payload: { message },
    });
  };

  const handleError = (error: Error) => {
    events.emit({
      type: 'ai-chat:error',
      source: `${selectedProvider}.ai-chat`,
      timestamp: Date.now(),
      payload: { error: error.message },
    });
  };

  // Handle local model selection
  const handleLocalModelSelect = async (modelId: ModelId) => {
    setSelectedModelId(modelId);
    await webllm.loadModel(modelId);
  };

  // Handle back button
  const handleBack = () => {
    if (selectedProvider === 'local' && webllm.status === 'idle') {
      setSelectedProvider(null);
    } else if (selectedProvider === 'gemini') {
      setSelectedProvider(null);
    } else {
      // If model is loaded, just go back to provider selection
      setSelectedProvider(null);
      setSelectedModelId(null);
    }
  };

  // Provider selection screen
  if (!selectedProvider) {
    return (
      <div
        className="h-full w-full flex flex-col items-center justify-center p-6"
        style={{
          background: theme.colors.background,
          color: theme.colors.text,
          fontFamily: theme.fonts.body,
        }}
      >
        <div className="max-w-md w-full space-y-6">
          <div className="text-center space-y-2">
            <h3
              className="text-lg font-semibold"
              style={{ color: theme.colors.text }}
            >
              AI Assistant
            </h3>
            <p
              className="text-sm"
              style={{ color: theme.colors.textMuted }}
            >
              Choose how you want to run the AI assistant
            </p>
          </div>

          <div className="space-y-3">
            {/* Local option */}
            <button
              onClick={() => setSelectedProvider('local')}
              className="w-full p-4 rounded-lg text-left transition-all hover:opacity-90"
              style={{
                background: theme.colors.surface,
                border: `1px solid ${theme.colors.border}`,
              }}
            >
              <div className="flex items-start gap-3">
                <div
                  className="p-2 rounded-md"
                  style={{ background: theme.colors.backgroundTertiary }}
                >
                  <Cpu size={20} style={{ color: theme.colors.primary }} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span style={{ color: theme.colors.text, fontWeight: 600 }}>
                      Local (Browser)
                    </span>
                    <span
                      className="text-xs px-2 py-0.5 rounded"
                      style={{
                        background: theme.colors.success + '20',
                        color: theme.colors.success,
                      }}
                    >
                      Free
                    </span>
                  </div>
                  <p
                    className="text-sm mt-1"
                    style={{ color: theme.colors.textMuted }}
                  >
                    Run AI models directly in your browser using WebGPU. No data leaves your device.
                  </p>
                  <p
                    className="text-xs mt-2"
                    style={{ color: theme.colors.textMuted }}
                  >
                    Requires WebGPU support (Chrome/Edge recommended)
                  </p>
                </div>
              </div>
            </button>

            {/* Gemini option */}
            <button
              onClick={() => setSelectedProvider('gemini')}
              className="w-full p-4 rounded-lg text-left transition-all hover:opacity-90"
              style={{
                background: theme.colors.surface,
                border: `1px solid ${theme.colors.border}`,
              }}
            >
              <div className="flex items-start gap-3">
                <div
                  className="p-2 rounded-md"
                  style={{ background: theme.colors.backgroundTertiary }}
                >
                  <Cloud size={20} style={{ color: theme.colors.info }} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span style={{ color: theme.colors.text, fontWeight: 600 }}>
                      Gemini Flash
                    </span>
                    <span
                      className="text-xs px-2 py-0.5 rounded"
                      style={{
                        background: theme.colors.info + '20',
                        color: theme.colors.info,
                      }}
                    >
                      Cloud
                    </span>
                  </div>
                  <p
                    className="text-sm mt-1"
                    style={{ color: theme.colors.textMuted }}
                  >
                    Fast, capable cloud model with native function calling. Best for complex queries.
                  </p>
                  <p
                    className="text-xs mt-2"
                    style={{ color: theme.colors.textMuted }}
                  >
                    Requires API key configuration
                  </p>
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Local model selection screen
  if (selectedProvider === 'local' && webllm.status === 'idle' && !selectedModelId) {
    return (
      <div
        className="h-full w-full flex flex-col p-6"
        style={{
          background: theme.colors.background,
          color: theme.colors.text,
          fontFamily: theme.fonts.body,
        }}
      >
        {/* Back button */}
        <button
          onClick={handleBack}
          className="flex items-center gap-1 mb-4 text-sm hover:opacity-80 transition-opacity"
          style={{ color: theme.colors.textMuted }}
        >
          <ChevronLeft size={16} />
          Back
        </button>

        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="max-w-md w-full space-y-4">
            <div className="text-center space-y-2">
              <h3
                className="text-lg font-semibold"
                style={{ color: theme.colors.text }}
              >
                Select Local Model
              </h3>
              <p
                className="text-sm"
                style={{ color: theme.colors.textMuted }}
              >
                Models are downloaded once and cached in your browser.
              </p>
            </div>

            <div className="space-y-2">
              {AVAILABLE_MODELS.map((model) => (
                <button
                  key={model.id}
                  onClick={() => handleLocalModelSelect(model.id)}
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
          </div>
        </div>
      </div>
    );
  }

  // Show chat interface if we have a handler
  if (customHandler) {
    return (
      <div className="h-full w-full flex flex-col">
        {/* Provider indicator header */}
        <div
          className="flex items-center justify-between px-3 py-2 border-b"
          style={{
            background: theme.colors.surface,
            borderColor: theme.colors.border,
          }}
        >
          <button
            onClick={handleBack}
            className="flex items-center gap-1 text-sm hover:opacity-80 transition-opacity"
            style={{ color: theme.colors.textMuted }}
          >
            <ChevronLeft size={14} />
            <span>
              {selectedProvider === 'local' ? (
                <>
                  <Cpu size={12} className="inline mr-1" />
                  {AVAILABLE_MODELS.find(m => m.id === selectedModelId)?.name || 'Local'}
                </>
              ) : (
                <>
                  <Cloud size={12} className="inline mr-1" />
                  Gemini Flash
                </>
              )}
            </span>
          </button>
        </div>

        <div className="flex-1 min-h-0">
          <ThemedAIChat
            theme={theme}
            customHandler={customHandler}
            placeholder={placeholder}
            showLoadingIndicator={true}
            onFinish={handleFinish}
            onError={handleError}
          />
        </div>
      </div>
    );
  }

  // Loading state
  return (
    <div
      className="h-full w-full flex items-center justify-center"
      style={{
        background: theme.colors.background,
        color: theme.colors.textMuted,
      }}
    >
      Loading...
    </div>
  );
}
