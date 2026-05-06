import { DesignTokens } from './schema';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function mergeTokens(...sources: Array<DesignTokens | undefined | null>): DesignTokens {
  const output: DesignTokens = {};

  for (const source of sources) {
    if (!isRecord(source)) continue;

    for (const [key, value] of Object.entries(source)) {
      if (isRecord(value) && isRecord(output[key])) {
        output[key] = mergeTokens(output[key] as DesignTokens, value as DesignTokens);
      } else if (Array.isArray(value)) {
        output[key] = [...value];
      } else if (value !== undefined) {
        output[key] = value;
      }
    }
  }

  return output;
}

export function sanitizeClientTokens(tokens: DesignTokens): DesignTokens {
  const serialized = JSON.stringify(tokens);
  if (serialized.length > 15000) return {};
  if (/javascript:|expression\(|<script|<\/script/i.test(serialized)) return {};
  return tokens;
}
