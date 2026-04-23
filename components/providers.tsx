"use client";

import { ReactNode } from "react";

// No auth providers needed — LexEasy is fully open (bot-protected at API level)
export function Providers({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
