import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/lib/theme";
import { ThemeToaster } from "@/components/theme-toaster";
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

const themeInitScript = `
(function() {
  try {
    var saved = localStorage.getItem('whizan-theme');
    var resolved = 'light';
    if (saved === 'dark') {
      resolved = 'dark';
    } else if (saved === 'system') {
      var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      resolved = prefersDark ? 'dark' : 'light';
    } else {
      resolved = 'light';
    }
    document.documentElement.setAttribute('data-theme', resolved);
    document.documentElement.classList.remove(resolved === 'dark' ? 'light' : 'dark');
    document.documentElement.classList.add(resolved);
    document.documentElement.style.colorScheme = resolved;
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" className="light" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`} suppressHydrationWarning>
        <ThemeProvider>
          <AuthProvider>
            {children}
            <ThemeToaster />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
