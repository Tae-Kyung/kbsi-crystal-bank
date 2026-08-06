import { describe, it, expect } from 'vitest';

describe('Extract API', () => {
  it('extraction-prompt module exports required functions', async () => {
    const mod = await import('@/lib/llm/extraction-prompt');
    expect(typeof mod.EXTRACTION_SYSTEM_PROMPT).toBe('string');
    expect(typeof mod.buildExtractionPrompt).toBe('function');
  });

  it('buildExtractionPrompt returns string containing target table', async () => {
    const { buildExtractionPrompt } = await import('@/lib/llm/extraction-prompt');
    const prompt = buildExtractionPrompt('sample text', 'kbsi_expression');
    expect(prompt).toContain('expression');
  });

  it('EXTRACTION_SYSTEM_PROMPT is non-empty', async () => {
    const { EXTRACTION_SYSTEM_PROMPT } = await import('@/lib/llm/extraction-prompt');
    expect(EXTRACTION_SYSTEM_PROMPT.length).toBeGreaterThan(10);
  });
});
