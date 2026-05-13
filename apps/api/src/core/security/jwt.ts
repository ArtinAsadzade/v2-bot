import { createHmac, timingSafeEqual } from 'node:crypto';

import { config } from '../../config/index.js';

export const signInternalToken = (subject: string, expiresAt: Date): string => {
  const payload = Buffer.from(JSON.stringify({ sub: subject, exp: expiresAt.toISOString() })).toString('base64url');
  const signature = createHmac('sha256', config.jwt.accessSecret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
};

export const verifyInternalToken = (token: string): boolean => {
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;
  const expected = createHmac('sha256', config.jwt.accessSecret).update(payload).digest('base64url');
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
};
