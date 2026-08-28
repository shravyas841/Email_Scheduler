import { Client } from '@elastic/elasticsearch';

import { environment } from '../../config/environment.js';

export const emailIndex = 'emails';
export const elasticsearch = new Client({ node: environment.ELASTICSEARCH_URL });

export const indexEmail = async (email: {
  id: string; userId: string; sender: string; recipient: string; subject: string;
  body: string; status: string; scheduledAt: Date; sentAt: Date | null;
}) => {
  await elasticsearch.index({ index: emailIndex, id: email.id, document: email, refresh: 'wait_for' });
};
