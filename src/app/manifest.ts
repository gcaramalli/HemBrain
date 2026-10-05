import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hembrain",
    short_name: "Hembrain",
    description: "Shared calendar, lists, recipes and family memory.",
    start_url: "/",
    display: "standalone",
    // Splash screen in the icon's night blue; the bar matches the page.
    background_color: "#111722",
    theme_color: "#f3f1ec",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      // Full bleed, the mark well inside the safe zone: Android crops it to its own shape.
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
