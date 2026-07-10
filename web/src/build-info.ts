import {
  READING_NEST_APP_VERSION,
  READING_NEST_RESOURCE_VERSION
} from "@ss/shared";

const rawBuildSha = import.meta.env.VITE_BUILD_SHA?.trim();

export const READING_NEST_BUILD_INFO = {
  appVersion: READING_NEST_APP_VERSION,
  resourceVersion: READING_NEST_RESOURCE_VERSION,
  buildSha: rawBuildSha ? rawBuildSha.slice(0, 7) : "local"
} as const;
