import { useQuery, useQueryClient } from '@tanstack/react-query';

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
              const cached = await options.cacheFn();
              if (cached != null) return cached;
              return data;
            }
          }
          await options.writeCacheFn(data);
          return data;
        } catch (error) {
          const cached = await options.cacheFn();
          if (cached != null) return cached;
          throw error;
        }
      }

      const cached = await options.cacheFn();
      if (cached != null) {
        void options
          .apiFn()
          .then(async (data) => {
            if (options.isDirtyFn) {
              const isDirty = await options.isDirtyFn();
              if (isDirty) return;
            }
            await options.writeCacheFn(data);
            queryClient.setQueryData(options.queryKey, data);
          })
          .catch(() => {});
        return cached;
      }
      try {
        const data = await options.apiFn();
        await options.writeCacheFn(data);
        return data;
      } catch (error) {
        if (options.fallbackToCacheOnError) {
          const fallback = await options.cacheFn();
          if (fallback != null) return fallback;
        }
        throw error;
      }
    },
  });
}
