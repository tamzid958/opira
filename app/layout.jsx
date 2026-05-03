import { Inter, Inter_Tight, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { Providers } from "@/components/providers";
import { FOUC_GUARD_SCRIPT } from "@/components/theme-provider";
import { getServerPublicConfig } from "@/lib/public-config";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const interTight = Inter_Tight({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata = {
  title: "Opira",
  description: "Opira — a modern UI for OpenProject. Sprint board, backlog, timeline, reports.",
};

export default function RootLayout({ children }) {
  const publicConfig = getServerPublicConfig();
  return (
    <html
      lang="en"
      className={`${inter.variable} ${interTight.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Inline FOUC-guard: sets `data-theme` synchronously before
            React hydrates so the first paint matches the user's stored
            preference (or `prefers-color-scheme`). See `theme-provider`. */}
        <script dangerouslySetInnerHTML={{ __html: FOUC_GUARD_SCRIPT }} />
      </head>
      <body>
        <Providers publicConfig={publicConfig}>{children}</Providers>
        <Toaster
          position="bottom-right"
          closeButton
          duration={4000}
          toastOptions={{
            style: {
              background: "var(--bg)",
              color: "var(--text)",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow-md)",
            },
          }}
        />
      </body>
    </html>
  );
}
