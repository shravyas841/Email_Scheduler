import { prisma } from '../config/database.js';
import { AppError } from '../errors/app-error.js';
import { emailSendQueue } from '../queues/email-send-queue.js';

export async function cancelEmail(userId: string, emailId: string) {
  const email = await prisma.emailJob.findFirst({ where: { id: emailId, userId }, select: { id: true, status: true, bullJobId: true } });
  if (!email) throw new AppError(404, 'EMAIL_NOT_FOUND', 'Email was not found for this user.');
  if (email.status !== 'SCHEDULED') throw new AppError(409, 'EMAIL_NOT_SCHEDULED', 'Only scheduled emails can be cancelled.');
  const updated = await prisma.emailJob.updateMany({ where: { id: email.id, userId, status: 'SCHEDULED' }, data: { status: 'CANCELLED' } });
  if (updated.count === 0) throw new AppError(409, 'EMAIL_NOT_SCHEDULED', 'Email is no longer scheduled.');
  const job = await emailSendQueue.getJob(email.bullJobId ?? `email-${email.id}`);
  if (job) await job.remove().catch(() => undefined);
  return { cancelled: true, id: email.id };
}
