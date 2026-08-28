import { WebClient } from '@slack/web-api';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

import { environment } from '../../config/environment.js';

const key = () => createHash('sha256').update(environment.SESSION_SECRET).digest();
export const encrypt = (value: string) => { const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key(), iv); const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]); return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${encrypted.toString('base64')}`; };
export const decrypt = (value: string) => { const [iv, tag, encrypted] = value.split('.'); const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64')); decipher.setAuthTag(Buffer.from(tag, 'base64')); return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]).toString('utf8'); };
export const notifySlack = async (token: string, channel: string, text: string) => new WebClient(token).chat.postMessage({ channel, text });
