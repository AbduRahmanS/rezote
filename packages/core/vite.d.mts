import type { UserConfig } from "vite";

export function rezoteConfig(app: {
  name: string;
  shortName: string;
  description: string;
  themeColor?: string;
  port?: number;
}): UserConfig;
