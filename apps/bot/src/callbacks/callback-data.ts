import { z } from 'zod';

export const callbackSchema = z.object({
  version: z.literal('v1'),
  namespace: z.enum(['nav', 'confirm', 'toggle', 'noop', 'wizard']),
  action: z.string().min(1).max(24).regex(/^[a-z0-9_-]+$/u),
  value: z.string().max(28).optional(),
});

export type CallbackData = z.infer<typeof callbackSchema>;

export const buildCallbackData = (namespace: CallbackData['namespace'], action: string, value?: string): string =>
  ['v1', namespace, action, value].filter(Boolean).join(':');

export const parseCallbackData = (raw: string): CallbackData | null => {
  const [version, namespace, action, value] = raw.split(':');
  const parsed = callbackSchema.safeParse({ version, namespace, action, value });
  return parsed.success ? parsed.data : null;
};
