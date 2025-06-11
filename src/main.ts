import * as nip19 from 'nostr-tools/nip19';
import { finalizeEvent, type NostrEvent } from 'nostr-tools/pure';
import { SimplePool, type SubCloser } from 'nostr-tools/pool';
import type { Filter } from 'nostr-tools/filter';

const isDebug = false;

(async () => {
  const relaysToFetch = [
    'wss://relay.nostr.band/',
    'wss://nos.lol/',
    'wss://relay.damus.io/',
    'wss://relay.nostr.wirednet.jp/',
    'wss://relay-jp.nostr.wirednet.jp/',
    'wss://yabu.me/',
    'wss://r.kojira.io/',
  ];

  const relaysToWrite = ['wss://relay.nostr.wirednet.jp/', 'wss://n3r.xyz/', 'wss://nrelay.c-stellar.net/'];

  const now = new Date();
  const until = Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000) + 15 * 60 * 60;
  const since = until - 24 * 60 * 60;

  const getGeneralEvents = (
    pool: SimplePool,
    relays: string[],
    filters: Filter[],
    callbackEvent: Function = () => {},
    autoClose: boolean = true,
  ): Promise<NostrEvent[]> => {
    return new Promise((resolve) => {
      const events: NostrEvent[] = [];
      const onevent = (ev: NostrEvent) => {
        events.push(ev);
        callbackEvent(ev);
      };
      const oneose = () => {
        if (autoClose) {
          sub.close();
          pool.close(relays);
        }
        resolve(events);
      };
      const sub: SubCloser = pool.subscribeMany(relays, filters, {
        onevent,
        oneose,
      });
    });
  };

  const getReactions = async (pool: SimplePool, relays: string[]): Promise<NostrEvent[]> => {
    const reactionEventsFetched = await getGeneralEvents(pool, relays, [{ kinds: [17], since, until }]);
    return reactionEventsFetched;
  };

  const postNostr = async (pool: SimplePool, sk: Uint8Array, content: string, relays: string[], urls: string[], hashTag: string) => {
    const tags = [['t', hashTag], ...urls.map((url) => ['r', url])];
    const unsignedEvent = {
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content,
    };
    const signedEvent = finalizeEvent(unsignedEvent, sk);
    const pubs = pool.publish(relays, signedEvent);
    await Promise.allSettled(pubs);
    pool.close(relays);
  };

  const rankingEmoji = new Map<Number, string>([
    [1, '🥇'],
    [2, '🥈'],
    [3, '🥉'],
    [4, '④'],
    [5, '⑤'],
    [6, '⑥'],
    [7, '⑦'],
    [8, '⑧'],
    [9, '⑨'],
    [10, '⑩'],
    [11, '⑪'],
    [12, '⑫'],
    [13, '⑬'],
    [14, '⑭'],
    [15, '⑮'],
    [16, '⑯'],
    [17, '⑰'],
    [18, '⑱'],
    [19, '⑲'],
    [20, '⑳'],
  ]);

  const main = async () => {
    console.info('[start]');
    const NOSTR_PRIVATE_KEY: string = process.env.NOSTR_PRIVATE_KEY ?? '';
    const events: NostrEvent[] = await getReactions(new SimplePool(), relaysToFetch);
    const urls: string[] = events
      .map((ev) => ev.tags.find((tag) => tag.length >= 2 && tag[0] === 'r' && URL.canParse(tag[1]))?.at(1))
      .filter((ev) => ev !== undefined);
    if (urls.length === 0) {
      console.info('0件でした');
      process.exit(0);
    }
    const ranking = new Map<string, number>();
    for (const url of urls) {
      if (ranking.has(url)) {
        ranking.set(url, ranking.get(url)! + 1);
      } else {
        ranking.set(url, 1);
      }
    }
    const hashtag = 'makibishiranking';
    let message = `${new Date(until * 1000).toLocaleDateString('ja-JP')}のまきびしランキング #${hashtag}\n\n`;
    const urlsSorted = Array.from(ranking.keys());
    urlsSorted.sort((a, b) => {
      const m = ranking.get(a)!;
      const n = ranking.get(b)!;
      return n - m;
    });
    let count_rank = 1;
    let count_url = -1;
    let index = 0;
    for (const url of urlsSorted) {
      let rank;
      if (ranking.get(url) === count_url) {
        rank = count_rank;
      } else {
        count_rank = index + 1;
        rank = count_rank;
        count_url = ranking.get(url)!;
      }
      index++;
      message += `${rankingEmoji.get(rank)} ${ranking.get(url)} ${url}\n`;
      if (index >= 19) break;
    }
    console.info('message: ', message);
    if (!isDebug) {
      const { type, data } = nip19.decode(NOSTR_PRIVATE_KEY);
      if (type !== 'nsec') {
        console.warn('NOSTR_PRIVATE_KEY is not nsec');
        return;
      }
      const sk: Uint8Array = data;
      await postNostr(new SimplePool(), sk, message, relaysToWrite, urlsSorted, hashtag);
      console.info('post complete');
    }
    process.exit(0);
  };

  try {
    await main();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
})();
