import { type Message } from 'ai';

/**
 * Mock AI Chat API Endpoint
 *
 * This endpoint simulates AI responses for the chat panel.
 * Replace with real AI SDK integration when ready.
 */

const mockResponses = [
  "I'm a mock AI assistant. I can help you with code-related questions!",
  "That's an interesting question. In a real implementation, I would use an LLM to provide helpful answers.",
  "I'm here to assist! Currently, I'm running in mock mode, but soon I'll be powered by real AI.",
  "Great question! This mock response simulates streaming behavior from an AI model.",
  "I can help you understand your codebase, write code, and answer technical questions.",
];

function getRandomResponse(): string {
  const index = Math.floor(Math.random() * mockResponses.length);
  return mockResponses[index] ?? mockResponses[0]!;
}

export async function POST(req: Request) {
  try {
    const { messages } = await req.json() as { messages: Message[] };

    // Log the incoming messages (for debugging)
    console.log('Received messages:', messages.length);
    console.log('Last message:', messages[messages.length - 1]?.content);

    // Generate mock response
    const responseText = getRandomResponse();

    // Create a streaming response compatible with useChat
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        // Split into words for streaming effect
        const words = responseText.split(' ');

        for (let i = 0; i < words.length; i++) {
          const word = words[i];
          const chunk = i === words.length - 1 ? word : word + ' ';

          // Send text chunk in data stream format
          controller.enqueue(encoder.encode(`0:${JSON.stringify(chunk)}\n`));

          // Simulate typing delay
          await new Promise(resolve => setTimeout(resolve, 50));
        }

        // Send done message
        controller.enqueue(encoder.encode('d:{"finishReason":"stop","usage":{"promptTokens":10,"completionTokens":20}}\n'));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Vercel-AI-Data-Stream': 'v1',
      },
    });

  } catch (error) {
    console.error('Chat API error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to process chat request' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
