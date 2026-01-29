/**
 * Token counting utilities
 * Simple token estimation without external dependencies
 */

/**
 * Estimate token count for a text string
 * Uses simple character-based approximation: 1 token ≈ 4 characters
 */
export function estimateTokens(text: string): number {
  if (!text || typeof text !== 'string') {
    return 0;
  }
  return Math.ceil(text.length / 4);
}

/**
 * Estimate token count for messages
 * Counts content, role, and name overhead
 */
export function estimateMessagesTokens(
  messages: Array<{
    role: string;
    content: string | Array<{ type: string; text?: string }>;
    name?: string;
  }>
): number {
  let total = 0;

  for (const message of messages) {
    // Count content
    const content = typeof message.content === 'string'
      ? message.content
      : message.content
          .filter(p => p.type === 'text' && p.text)
          .map(p => (p as { text: string }).text)
          .join('');

    total += estimateTokens(content);

    // Count role overhead
    total += estimateTokens(message.role);
    total += 1; // Role delimiter

    // Count name if present
    if (message.name) {
      total += estimateTokens(message.name);
      total += 1; // Name delimiter
    }
  }

  return total;
}

/**
 * Estimate token count for tool definitions
 */
export function estimateToolTokens(
  tools: Array<{
    type: string;
    function: {
      name: string;
      description?: string;
      parameters?: object;
    };
  }>
): number {
  if (!tools || tools.length === 0) {
    return 0;
  }

  try {
    return estimateTokens(JSON.stringify(tools));
  } catch {
    return 0;
  }
}

/**
 * Calculate remaining context space
 */
export function calculateRemainingContext(
  totalContextLength: number,
  messages: Array<{
    role: string;
    content: string | Array<{ type: string; text?: string }>;
    name?: string;
  }>,
  tools: Array<{
    type: string;
    function: {
      name: string;
      description?: string;
      parameters?: object;
    };
  }> | undefined,
  reservedOutputTokens: number
): number {
  const messageTokens = estimateMessagesTokens(messages);
  const toolTokens = estimateToolTokens(tools ?? []);
  const reserved = reservedOutputTokens;

  return Math.max(0, totalContextLength - messageTokens - toolTokens - reserved);
}
