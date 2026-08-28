import { prisma } from '../config/database.js';
import { environment } from '../config/environment.js';
import { logger } from '../config/logger.js';
import { redisConnection } from '../queues/redis-connection.js';
import { decrypt, notifySlack } from '../integrations/slack/slack-service.js';

export type RateAlertResult = 'sent' | 'already-sent' | 'not-connected' | 'failed';

export async function notifyRateLimit(userId: string, senderId: string, senderEmail: string, windowStart: Date, sendNotification = notifySlack): Promise<RateAlertResult> {
  const connection = await prisma.slackConnection.findUnique({ where: { userId } });
  const channelId = connection?.channelId ?? environment.SLACK_DEFAULT_CHANNEL_ID;
  if (!connection || !channelId) {
    logger.warn({ userId, senderId, channelId: channelId ?? null, notificationReason: 'hourly-limit' }, 'SLACK_NOTIFICATION_SKIPPED');
    return 'not-connected';
  }

  const key = `slack-rate-alert:${senderId}:${windowStart.toISOString()}`;
  const firstAlert = await redisConnection.set(key, '1', 'EX', 7200, 'NX');
  if (firstAlert !== 'OK') {
    logger.info({ userId, senderId, channelId, notificationReason: 'hourly-limit' }, 'SLACK_NOTIFICATION_DEDUPLICATED');
    return 'already-sent';
  }

  try {
    logger.info({ userId, senderId, channelId, notificationReason: 'hourly-limit' }, 'SLACK_NOTIFICATION_ATTEMPT');
    await sendNotification(decrypt(connection.accessTokenEncrypted), channelId, `Rate limit reached for ${senderEmail}. Additional emails have been rescheduled.`);
    logger.info({ userId, senderId, channelId, notificationReason: 'hourly-limit' }, 'SLACK_NOTIFICATION_SUCCEEDED');
    return 'sent';
  } catch (error) {
    const slackError = error as { data?: { error?: string }; message?: string };
    logger.error({ userId, senderId, channelId, notificationReason: 'hourly-limit', slackErrorCode: slackError.data?.error, slackErrorMessage: slackError.message }, 'SLACK_NOTIFICATION_FAILED');
    return 'failed';
  }
}
