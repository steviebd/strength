import { Hono } from 'hono';
import type { WorkerEnv } from '../auth';
import type { AppVariables } from '../api/auth';

export type AppRouter = Hono<{ Bindings: WorkerEnv; Variables: AppVariables }>;

export function createRouter(): AppRouter {
  return new Hono<{ Bindings: WorkerEnv; Variables: AppVariables }>();
}
