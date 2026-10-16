// src/lib/utils.ts
// Standard shadcn/ui cn() helper — merges conditional class lists and
// resolves conflicting Tailwind utilities (e.g. "p-2" vs "p-4") in favor of
// the later one. This project has no other shadcn scaffolding (no
// components.json); this file exists only because components under
// src/components/ui/ expect "@/lib/utils" to be importable.
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
