import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: "FlipDeck — TCG Price Arbitrage",
  description: "Track prices and one-click flip cards across Magic, Riftbound, Yu-Gi-Oh!, Pokémon, and Lorcana.",
  manifest: "/manifest.webmanifest",
  applicationName: "FlipDeck",
};

export const viewport: Viewport = {
  themeColor: "#0d0d0d",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
