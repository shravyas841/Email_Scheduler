import { prisma } from '../config/database.js';
import { environment } from '../config/environment.js';
import { logger } from '../config/logger.js';
import { redisConnection } from '../queues/redis-connection.js';
import { decrypt, notifySlack } from '../integrations/slack/slack-service.js';

export type RateAlertResult = 'sent' | 'already-sent' | 'not-connected' | 'failed';

export async function notifyRateLimit(userId: string, senderId: string, senderEmail: string, windowStart: Date, sendNotification = notifySlack): Promise<RateAlertResult> {
  const connection = await prisma.slackConnection.findUnique({ where: { userId } });
  const channelId = connection?.channelId ?? environment.SLACK_DEFAULT_CHANNEL_ID;
  if (!connection || !channelId) return 'not-connected';

  const key = `slack-rate-alert:${senderId}:${windowStart.toISOString()}`;
  const firstAlert = await redisConnection.set(key, '1', 'EX', 7200, 'NX');
  if (firstAlert !== 'OK') return 'already-sent';

  try {
    await sendNotification(decrypt(connection.accessTokenEncrypted), channelId, `Rate limit reached for ${senderEmail}. Additional emails have been rescheduled.`);
    return 'sent';
  } catch (error) {
    logger.error({ err: error, senderId }, 'SLACK_NOTIFICATION_FAILED');
    return 'failed';
  }
}
