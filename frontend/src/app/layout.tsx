import Script from "next/script";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { MswProvider } from "@/components/providers/MswProvider";
import { SocketProvider } from "@/components/providers/SocketProvider";
import { Toaster } from "sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BuildTrack | Construction Monitoring & Safety Platform",
  description: "Real-time IoT telemetry, AI computer vision safety, and site operations control room",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <head>
        {/* Apply the saved theme before first paint to avoid a light/dark flash */}
        <Script id="theme-init" strategy="beforeInteractive">
          {`
              (function() {
                try {
                  var t = localStorage.getItem('bt_theme');
                  if (t === 'light') {
                    document.documentElement.classList.remove('dark');
                  } else {
                    document.documentElement.classList.add('dark');
                  }
                } catch(e) {}
              })();
            `}
        </Script>
      </head>
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900 dark:bg-zinc-950 dark:text-zinc-100 selection:bg-amber-500 selection:text-zinc-950 font-sans">
        <MswProvider>
          <QueryProvider>
            <SocketProvider>
              {children}
              <Toaster
                position="top-right"
                richColors
                closeButton
              />
            </SocketProvider>
          </QueryProvider>
        </MswProvider>
      </body>
    </html>
  );
}
