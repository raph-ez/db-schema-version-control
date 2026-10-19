import type { Viewport } from "next";
import "./globals.css";
import Providers from "./Providers";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#050505] text-zinc-300 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}