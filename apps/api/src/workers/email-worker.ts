import { Worker } from 'bullmq';

import { prisma, disconnectDatabase, connectDatabase } from '../config/database.js';
import { environment } from '../config/environment.js';
import { logger } from '../config/logger.js';
import { EMAIL_SEND_QUEUE_NAME, type EmailSendQueueData } from '../queues/email-send-queue.js';
import { redisConnection } from '../queues/redis-connection.js';
import { EmailDeliveryService } from '../services/email-delivery-service.js';

const emailDeliveryService = new EmailDeliveryService();

const worker = new Worker<EmailSendQueueData>(
  EMAIL_SEND_QUEUE_NAME,
  async (queueJob) => {
    const emailJob = await prisma.emailJob.findUnique({
      where: { id: queueJob.data.emailJobId },
      include: { sender: true },
    });

    if (!emailJob || emailJob.status === 'SENT' || emailJob.status === 'CANCELLED') return;

    const claimed = await prisma.emailJob.updateMany({
      where: { id: emailJob.id, status: 'SCHEDULED' },
      data: { status: 'PROCESSING', processingStartedAt: new Date(), attempts: { increment: 1 } },
    });

    if (claimed.count === 0) return;

    const attemptNumber = emailJob.attempts + 1;
    const attempt = await prisma.deliveryAttempt.create({
      data: { emailJobId: emailJob.id, attemptNumber },
    });

    try {
      const delivery = await emailDeliveryService.send({
        from: `${emailJob.sender.displayName} <${emailJob.sender.email}>`,
        to: emailJob.recipient,
        subject: emailJob.subject,
        body: emailJob.body,
      });

      await prisma.$transaction([
        prisma.deliveryAttempt.update({
          where: { id: attempt.id },
          data: { outcome: 'SENT', providerMessageId: delivery.messageId, completedAt: new Date() },
        }),
        prisma.emailJob.update({
          where: { id: emailJob.id },
          data: { status: 'SENT', sentAt: new Date(), providerMessageId: delivery.messageId, previewUrl: delivery.previewUrl },
        }),
      ]);
      logger.info({ emailJobId: emailJob.id }, 'EMAIL_SENT');
    } catch (error) {
      const finalAttempt = queueJob.attemptsMade + 1 >= (queueJob.opts.attempts ?? 1);
      await prisma.$transaction([
        prisma.deliveryAttempt.update({
          where: { id: attempt.id },
          data: { outcome: 'FAILED', errorMessage: error instanceof Error ? error.message : 'Unknown error', completedAt: new Date() },
        }),
        prisma.emailJob.update({
          where: { id: emailJob.id },
          data: finalAttempt
            ? { status: 'FAILED', failedAt: new Date(), failureReason: error instanceof Error ? error.message : 'Unknown error' }
            : { status: 'SCHEDULED', processingStartedAt: null },
        }),
      ]);
      logger.error({ err: error, emailJobId: emailJob.id }, 'EMAIL_FAILED');
      if (!finalAttempt) throw error;
    }
  },
  { connection: redisConnection, concurrency: environment.WORKER_CONCURRENCY },
);

worker.on('error', (error) => logger.error({ err: error }, 'WORKER_ERROR'));

await connectDatabase();
logger.info({ concurrency: environment.WORKER_CONCURRENCY }, 'WORKER_STARTED');

const shutdown = async (signal: string) => {
  logger.info({ signal }, 'Worker shutting down');
  await worker.close();
  await redisConnection.quit();
  await disconnectDatabase();
};

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
