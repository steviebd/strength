import { useQuery, useQueryClient } from '@tanstack/react-query';
import { enqueueLocalRead } from '../db/read-queue';
import { enqueueLocalWrite } from '../db/write-queue';

export function useOfflineQuery<TData>(options: {
  queryKey: unknown[];
  apiFn: () => Promise<TData>;
  cacheFn: () => Promise<TData | null>;
  writeCacheFn: (data: TData) => Promise<void>;
  enabled?: boolean;
  staleTime?: number;
  refetchOnMount?: boolean | 'always';
  refetchOnWindowFocus?: boolean;
  fallbackToCacheOnError?: boolean;
  networkFirst?: boolean;
  refetchInterval?: number;
  isDirtyFn?: () => Promise<boolean>;
}) {
  const queryClient = useQueryClient();
  const readCache = () => enqueueLocalRead(options.cacheFn);
  const writeCache = (data: TData) => enqueueLocalWrite(() => options.writeCacheFn(data));
  return useQuery<TData, Error, TData>({
    queryKey: options.queryKey,
    enabled: options.enabled,
    staleTime: options.staleTime ?? 0,
    refetchOnMount: options.refetchOnMount ?? 'always',
    refetchOnWindowFocus: options.refetchOnWindowFocus ?? true,
    refetchInterval: options.refetchInterval,
    queryFn: async () => {
      if (options.networkFirst) {
        try {
          const data = await options.apiFn();
          if (options.isDirtyFn) {
            const isDirty = await options.isDirtyFn();
            if (isDirty) {
              const cached = await readCache();
              if (cached != null) return cached;
              return data;
            }
          }
          await writeCache(data);
          return data;
        } catch (error) {
          const cached = await readCache();
          if (cached != null) return cached;
          throw error;
        }
      }

      const cached = await readCache();
      if (cached != null) {
        void options
          .apiFn()
          .then(async (data) => {
            if (options.isDirtyFn) {
              const isDirty = await options.isDirtyFn();
              if (isDirty) return;
            }
            await writeCache(data);
            queryClient.setQueryData(options.queryKey, data);
          })
          .catch(() => {});
        return cached;
      }
      try {
        const data = await options.apiFn();
        await writeCache(data);
        return data;
      } catch (error) {
        if (options.fallbackToCacheOnError) {
          const fallback = await readCache();
          if (fallback != null) return fallback;
        }
        throw error;
      }
    },
  });
}
