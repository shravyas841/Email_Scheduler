import { Queue } from 'bullmq';

import { redisConnection } from './redis-connection.js';

export const EMAIL_SEND_QUEUE_NAME = 'email-send';

export interface EmailSendQueueData {
  emailJobId: string;
}

export const emailSendQueue = new Queue<EmailSendQueueData>(EMAIL_SEND_QUEUE_NAME, {
  connection: redisConnection,
});
