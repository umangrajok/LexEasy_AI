import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXTAUTH_URL || "http://localhost:3000";
  return [{ url: base, lastModified: new Date(), changeFrequency: "daily", priority: 1 }];
}
