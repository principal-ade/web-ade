'use client';

/**
 * AI Chat Panel with Provider Selection
 *
 * Uses the library's AIChatPanel component which provides:
 * - Provider selection UI (Local vs Cloud)
 * - Model selection for local provider
 * - New conversation button
 * - Chat interface with ThemedAIChat
 */

import { AIChatPanel as LibraryAIChatPanel } from '@principal-ade/industry-themed-ai-sdk-panel';
import type { PanelComponentProps, AIChatPanelConfig, AIProviderHook } from '@principal-ade/industry-themed-ai-sdk-panel';
import { useWebLLM, AVAILABLE_MODELS } from '@/contexts/WebLLMContext';
import { useGemini } from '@/contexts/GeminiContext';

interface AIChatPanelProps extends PanelComponentProps {
  placeholder?: string;
}

/**
 * Hook adapter for WebLLM to conform to AIProviderHook interface
 */
function useLocalProvider(): AIProviderHook {
  const webllm = useWebLLM();

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
    loadModel: webllm.loadModel,
  };
}

/**
 * Hook adapter for Gemini to conform to AIProviderHook interface
 */
function useCloudProvider(): AIProviderHook {
  const gemini = useGemini();

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

/**
 * Configuration for the AI Chat Panel
 */
const aiChatConfig: AIChatPanelConfig = {
  useLocalProvider,
  useCloudProvider,
  availableModels: AVAILABLE_MODELS.map((m) => ({
    id: m.id,
    name: m.name,
    size: m.size,
  })),
  localProviderMeta: {
    name: 'Local (Browser)',
    description: 'Run AI models directly in your browser using WebGPU. No data leaves your device.',
    badge: 'Free',
    badgeVariant: 'success',
    requirements: 'Requires WebGPU support (Chrome/Edge recommended)',
  },
  cloudProviderMeta: {
    name: 'Gemini Flash',
    description: 'Fast, capable cloud model with native function calling. Best for complex queries.',
    badge: 'Cloud',
    badgeVariant: 'info',
    requirements: 'Requires API key configuration',
  },
};

export function AIChatPanel({
  context,
  actions,
  events,
  placeholder = 'Ask me anything about your code...',
}: AIChatPanelProps) {
  return (
    <LibraryAIChatPanel
      config={aiChatConfig}
      context={context}
      actions={actions}
      events={events}
      placeholder={placeholder}
    />
  );
}
