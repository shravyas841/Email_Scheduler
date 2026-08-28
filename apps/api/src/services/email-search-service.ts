import { emailIndex, elasticsearch } from '../integrations/search/elasticsearch.js';

export class EmailSearchService {
  public async search(userId: string, query: string) {
    const result = await elasticsearch.search({
      index: emailIndex,
      query: {
        bool: {
          filter: [{ term: { 'userId.keyword': userId } }],
          must: query ? [{ multi_match: { query, fields: ['recipient', 'subject', 'body', 'sender'] } }] : [{ match_all: {} }],
        },
      },
    });
    return result.hits.hits.map((hit) => hit._source);
  }
}
