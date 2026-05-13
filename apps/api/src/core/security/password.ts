import argon2 from 'argon2';

import { config } from '../../config/index.js';

export const hashPassword = async (password: string): Promise<string> =>
  argon2.hash(`${password}${config.security.passwordPepper}`, { type: argon2.argon2id });

export const verifyPassword = async (hash: string, password: string): Promise<boolean> =>
  argon2.verify(hash, `${password}${config.security.passwordPepper}`);
