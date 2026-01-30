import { describe, it, expect } from 'vitest';
import {
  isTextPart,
  isToolCallPart,
  isToolResultPart,
  isDataPart,
  isCacheControlPart,
  isImagePart,
  ROLE,
  convertToOpenAI,
} from './providerHelpers';

describe('Type Guards', () => {
  describe('isTextPart', () => {
    it('should return true for valid text part', () => {
      expect(isTextPart({ value: 'Hello' })).toBe(true);
      expect(isTextPart({ value: '' })).toBe(true);
    });

    it('should return false for null', () => {
      expect(isTextPart(null)).toBe(false);
    });

    it('should return false for non-object', () => {
      expect(isTextPart('string')).toBe(false);
      expect(isTextPart(123)).toBe(false);
    });

    it('should return false for object without value', () => {
      expect(isTextPart({})).toBe(false);
      expect(isTextPart({ type: 'text' })).toBe(false);
    });

    it('should return false for object with non-string value', () => {
      expect(isTextPart({ value: 123 })).toBe(false);
      expect(isTextPart({ value: null })).toBe(false);
    });
  });

  describe('isToolCallPart', () => {
    it('should return true for valid tool call part', () => {
      expect(isToolCallPart({ callId: '123', name: 'getWeather', input: { city: 'NYC' } })).toBe(true);
    });

    it('should return false for null', () => {
      expect(isToolCallPart(null)).toBe(false);
    });

    it('should return false for missing properties', () => {
      expect(isToolCallPart({ callId: '123' })).toBe(false);
      expect(isToolCallPart({ name: 'test' })).toBe(false);
      expect(isToolCallPart({ callId: '123', name: 'test' })).toBe(false);
    });
  });

  describe('isToolResultPart', () => {
    it('should return true for valid tool result part', () => {
      expect(isToolResultPart({ callId: '123', content: ['result'] })).toBe(true);
      expect(isToolResultPart({ callId: '123', content: [] })).toBe(true);
    });

    it('should return false when name property is present', () => {
      // Tool result should not have name, tool call should
      expect(isToolResultPart({ callId: '123', name: 'test', content: [] })).toBe(false);
    });

    it('should return false for missing properties', () => {
      expect(isToolResultPart({ callId: '123' })).toBe(false);
      expect(isToolResultPart({ content: [] })).toBe(false);
    });
  });

  describe('isDataPart', () => {
    it('should return true for valid data part', () => {
      expect(isDataPart({ mimeType: 'image/png', data: new Uint8Array([1, 2, 3]) })).toBe(true);
    });

    it('should return false for missing properties', () => {
      expect(isDataPart({ mimeType: 'image/png' })).toBe(false);
      expect(isDataPart({ data: new Uint8Array() })).toBe(false);
    });
  });

  describe('isCacheControlPart', () => {
    it('should return true for cache control data part', () => {
      expect(isCacheControlPart({ mimeType: 'cache_control', data: new Uint8Array([0]) })).toBe(true);
    });

    it('should return false for non-cache-control', () => {
      expect(isCacheControlPart({ mimeType: 'image/png', data: new Uint8Array() })).toBe(false);
    });
  });

  describe('isImagePart', () => {
    it('should return true for image data part', () => {
      expect(isImagePart({ mimeType: 'image/png', data: new Uint8Array([1, 2]) })).toBe(true);
      expect(isImagePart({ mimeType: 'image/jpeg', data: new Uint8Array() })).toBe(true);
      expect(isImagePart({ mimeType: 'image/webp', data: new Uint8Array() })).toBe(true);
    });

    it('should return false for cache_control', () => {
      expect(isImagePart({ mimeType: 'cache_control', data: new Uint8Array() })).toBe(false);
    });

    it('should return false for non-image mime types', () => {
      expect(isImagePart({ mimeType: 'text/plain', data: new Uint8Array() })).toBe(false);
    });
  });
});

describe('ROLE constants', () => {
  it('should have correct role values', () => {
    expect(ROLE.User).toBe(1);
    expect(ROLE.Assistant).toBe(2);
    expect(ROLE.System).toBe(3);
  });
});

describe('convertToOpenAI', () => {
  it('should convert system message', () => {
    const input = [{ role: ROLE.System, content: [{ value: 'You are a helpful assistant' }] }];
    const result = convertToOpenAI(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ role: 'system', content: 'You are a helpful assistant' });
  });

  it('should convert user message', () => {
    const input = [{ role: ROLE.User, content: [{ value: 'Hello' }] }];
    const result = convertToOpenAI(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ role: 'user', content: 'Hello' });
  });

  it('should convert assistant message', () => {
    const input = [{ role: ROLE.Assistant, content: [{ value: 'Hi there!' }] }];
    const result = convertToOpenAI(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ role: 'assistant', content: 'Hi there!' });
  });

  it('should convert message with tool calls', () => {
    const input = [{
      role: ROLE.Assistant,
      content: [
        { callId: '123', name: 'getWeather', input: { city: 'NYC' } },
      ],
    }];
    const result = convertToOpenAI(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      role: 'assistant',
      content: undefined,
      tool_calls: [
        {
          id: '123',
          type: 'function' as const,
          function: { name: 'getWeather', arguments: '{"city":"NYC"}' },
        },
      ],
    });
  });

  it('should convert message with tool results', () => {
    const input = [{
      role: ROLE.User,
      content: [
        { callId: '123', content: [{ value: 'The weather is sunny' }] },
      ],
    }];
    const result = convertToOpenAI(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      role: 'tool',
      tool_call_id: '123',
      content: 'The weather is sunny',
    });
  });

  it('should handle empty content', () => {
    const input = [{ role: ROLE.User, content: [] }];
    const result = convertToOpenAI(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ role: 'user', content: '' });
  });

  it('should handle undefined content', () => {
    const input = [{ role: ROLE.User, content: undefined }];
    const result = convertToOpenAI(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ role: 'user', content: '' });
  });

  it('should handle multiple messages', () => {
    const input = [
      { role: ROLE.System, content: [{ value: 'You are a helpful assistant.' }] },
      { role: ROLE.User, content: [{ value: 'What is 2+2?' }] },
    ];
    const result = convertToOpenAI(input);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ role: 'system', content: 'You are a helpful assistant.' });
    expect(result[1]).toEqual({ role: 'user', content: 'What is 2+2?' });
  });
});
