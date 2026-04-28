import type { MockDb } from './mock-db';

type JsonBody = Record<string, unknown> | unknown[] | string | null | undefined;

export function createTestContext({
  db,
  method = 'GET',
  url = 'http://localhost.test/',
  body,
  params = {},
  env = {},
}: {
  db?: MockDb;
  method?: string;
  url?: string;
  body?: JsonBody;
  params?: Record<string, string>;
  env?: Record<string, unknown>;
}) {
  const headers = new Headers();
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    headers.set('content-type', 'application/json');
  }
  const request = new Request(url, init);

  return {
    env: {
      APP_ENV: 'development',
      DB: {},
      ...env,
    },
    req: {
      raw: request,
      query: (name: string) => new URL(request.url).searchParams.get(name) ?? undefined,
      param: (name: string) => params[name],
      json: () => request.json(),
    },
    json: (value: unknown, status = 200) => Response.json(value, { status }),
    body: (value: BodyInit | null, status = 200) => new Response(value, { status }),
    get: (key: string) => {
      if (key === 'session') {
        return { user: { id: 'user-1' } };
      }
      if (key === 'user') {
        return { id: 'user-1' };
      }
      return undefined;
    },
    set: () => {},
    var: {},
    _db: db,
  } as any;
}
