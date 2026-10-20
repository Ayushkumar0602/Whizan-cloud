import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { AuthProvider } from "@/lib/auth";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Whizan Cloud — Developer Platform",
    template: "%s | Whizan Cloud",
  },
  description:
    "Deploy Next.js frontends, Dockerized backends, and manage your private service mesh on the Whizan Cloud developer platform.",
  keywords: ["cloud hosting", "Next.js deployment", "Docker hosting", "developer platform"],
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/whizan_icon.png", type: "image/png" },
    ],
    shortcut: "/whizan_icon.png",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" className="light" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <AuthProvider>
          {children}
          <Toaster richColors theme="light" position="top-right" />
        </AuthProvider>
      </body>
    </html>
  );
}
