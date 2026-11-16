// A minimal client without IndexedDB, for Node scripts such as the demo seed.
// It uses the same schemas and encryption as the apps, so seeded data is
// indistinguishable from data entered on a phone.

import { randomBase64Url } from "./base64.ts";
import { generateSecrets, importKeys, seal, writeKeyHash, type SpaceSecrets, type WritersOnlyFields } from "./crypto.ts";
import type { Envelope } from "./event.ts";
import type { AppDefinition, AppEvent, EventSchemas, PayloadOf } from "./app.ts";
import { buildLinks, type ShareLinks } from "./links.ts";
import { BATCH_SIZE, httpTransport, type SyncTransport } from "./sync.ts";

export interface RemoteSpace<M extends EventSchemas> {
  secrets: Required<SpaceSecrets>;
  links(appUrl: string): ShareLinks;
  /** Queues an event. `ts` defaults to now; `device` lets a script simulate several phones. */
  emit<K extends keyof M & string>(type: K, payload: PayloadOf<M, K>, opts?: { ts?: number; device?: string }): Promise<AppEvent<M>>;
  /** Registers the space if needed and pushes every queued event. */
  flush(): Promise<number>;
}

export async function createRemoteSpace<M extends EventSchemas>(
  def: AppDefinition<M, unknown>,
  serverUrl: string,
  transport: SyncTransport = httpTransport(serverUrl),
): Promise<RemoteSpace<M>> {
  const secrets = generateSecrets();
  const keys = await importKeys(secrets);
  const defaultDevice = randomBase64Url(12);
  const queue: Envelope[] = [];
  let registered = false;
  let lastTs = 0;

  return {
    secrets,
    links: (appUrl) => buildLinks(appUrl, secrets),
    async emit(type, payload, opts = {}) {
      const schema = def.events[type];
      if (!schema) throw new Error(`Unknown event type ${type}`);
      // Keep timestamps strictly increasing so the replay order matches the script order.
      const ts = Math.max(opts.ts ?? Date.now(), lastTs + 1);
      lastTs = ts;
      const event = {
        id: crypto.randomUUID(),
        space: secrets.space,
        type,
        payload: schema.parse(payload),
        ts,
        device: opts.device ?? defaultDevice,
      } as AppEvent<M>;
      queue.push(await seal(event, keys, (def.writersOnly ?? {}) as WritersOnlyFields));
      return event;
    },
    async flush() {
      if (!registered) {
        await transport.createSpace({ id: secrets.space, app: def.name, writeKeyHash: await writeKeyHash(secrets.write) });
        registered = true;
      }
      let sent = 0;
      while (queue.length > 0) {
        const batch = queue.splice(0, BATCH_SIZE);
        const result = await transport.push(secrets.space, secrets.write, batch);
        if (result.rejected.length > 0) throw new Error(`Server rejected ${result.rejected.length} events: ${result.rejected[0]!.reason}`);
        sent += result.accepted.length;
      }
      return sent;
    },
  };
}
