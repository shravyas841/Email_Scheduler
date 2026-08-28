import { prisma } from '../config/database.js';

export async function rescheduleEmailJob(emailId: string, retryAt: number, moveToDelayed: () => Promise<void>) {
  await moveToDelayed();
  await prisma.emailJob.updateMany({ where: { id: emailId, status: 'SCHEDULED' }, data: { scheduledAt: new Date(retryAt) } });
}
