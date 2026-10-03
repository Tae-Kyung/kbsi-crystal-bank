import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { chatTools, SYSTEM_PROMPT } from '@/lib/llm/chat-tools';

export const maxDuration = 60;

export async function POST(request: Request) {
  const { messages } = await request.json();

  const result = streamText({
    model: openai('gpt-4o-mini'),
    system: SYSTEM_PROMPT,
    messages,
    tools: chatTools,
    maxSteps: 5,
  });

  return result.toDataStreamResponse();
}
