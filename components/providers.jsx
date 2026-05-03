"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { SessionProvider } from "next-auth/react";
import { ErrorBoundary } from "@/components/error-boundary";
import { ThemeProvider } from "@/components/theme-provider";
import { RealtimeSync } from "@/components/realtime-sync";
import { OfflineQueueRunner } from "@/components/offline-queue-runner";
import { ConfigProvider } from "@/components/config-provider";
import { VersionBanner } from "@/components/version-banner";

export function Providers({ children, publicConfig }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
            staleTime: 30_000,
          },
        },
      }),
  );
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <SessionProvider>
          <ConfigProvider value={publicConfig}>
            <QueryClientProvider client={client}>
              <VersionBanner />
              {children}
              <RealtimeSync />
              <OfflineQueueRunner />
              {process.env.NODE_ENV !== "production" && (
                <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
              )}
            </QueryClientProvider>
          </ConfigProvider>
        </SessionProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
