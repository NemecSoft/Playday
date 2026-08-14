import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge className strings, resolving Tailwind conflicts (last-wins). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
