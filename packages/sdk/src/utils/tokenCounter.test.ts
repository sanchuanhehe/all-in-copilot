import { describe, it, expect } from 'vitest';
import { estimateTokens, estimateMessagesTokens } from './tokenCounter';

describe('estimateTokens', () => {
  it('should return 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('should return 0 for null or undefined', () => {
    expect(estimateTokens(null as unknown as string)).toBe(0);
    expect(estimateTokens(undefined as unknown as string)).toBe(0);
  });

  it('should estimate tokens based on characters (1 token ≈ 4 characters)', () => {
    expect(estimateTokens('test')).toBe(1);
    expect(estimateTokens('hello world')).toBe(3); // 11 chars / 4 = 2.75 -> 3
    expect(estimateTokens('a'.repeat(12))).toBe(3); // 12 chars / 4 = 3
  });

  it('should handle long text', () => {
    const text = 'Lorem ipsum dolor sit amet '.repeat(100);
    const expected = Math.ceil((text.length) / 4);
    expect(estimateTokens(text)).toBe(expected);
  });
});

describe('estimateMessagesTokens', () => {
  it('should estimate tokens for single message', () => {
    const messages = [
      { role: 'user', content: 'hello' },
    ];
    // "hello" = 5 chars / 4 = 1.25 -> 2 tokens
    // "user" = 4 chars / 4 = 1 token
    // delimiter = 1 token
    // Total: 2 + 1 + 1 = 4 tokens
    expect(estimateMessagesTokens(messages)).toBe(4);
  });

  it('should estimate tokens for multiple messages', () => {
    const messages = [
      { role: 'system', content: 'You are a helpful assistant.' },  // 27 chars = 7 tokens
      { role: 'user', content: 'Hi' },  // 2 chars = 1 token
    ];
    // Message 1: "You are a helpful assistant." (27 chars = 7) + system (6 chars = 2) + 1 = 10
    // Message 2: "Hi" (2 chars = 1) + user (4 chars = 1) + 1 = 3
    // Total: 10 + 3 = 13
    expect(estimateMessagesTokens(messages)).toBe(13);
  });

  it('should handle messages with name', () => {
    const messages = [
      { role: 'user', content: 'hello', name: 'John' },
    ];
    // hello (1) + user (1) + John (1) + 3 delimiters = 6
    expect(estimateMessagesTokens(messages)).toBe(6);
  });

  it('should handle array content with text parts', () => {
    const messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Hello' },
          { type: 'text', text: ' World' },
        ],
      },
    ];
    // "Hello World" (3) + user (1) + 1 = 5
    expect(estimateMessagesTokens(messages)).toBe(5);
  });

  it('should skip non-text parts in array content', () => {
    const messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Hello' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
          { type: 'text', text: ' World' },
        ],
      },
    ];
    // Only text parts: "Hello World" (3) + user (1) + 1 = 5
    expect(estimateMessagesTokens(messages)).toBe(5);
  });

  it('should handle empty messages array', () => {
    expect(estimateMessagesTokens([])).toBe(0);
  });
});
