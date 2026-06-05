import { z } from 'zod';

export const xrayApiEnvelopeSchema = z.object({
  success: z.boolean().optional(),
  msg: z.string().optional(),
  obj: z.unknown().optional(),
});

export const xrayClientTrafficSchema = z.object({
  up: z.coerce.number().optional(),
  down: z.coerce.number().optional(),
  total: z.coerce.number().optional(),
  enable: z.boolean().optional(),
  expiryTime: z.coerce.number().optional(),
});

export const xrayLinksResponseSchema = z.union([
  z.array(z.string()),
  z.object({ links: z.array(z.string()).optional() }).transform((v) => v.links ?? []),
  z.string().transform((v) => (v ? [v] : [])),
]);

export const addClientPayloadSchema = z.object({
  id: z.number().int(),
  settings: z.string(),
});

export type XrayClientTraffic = z.infer<typeof xrayClientTrafficSchema>;
