import {
  READING_NEST_APP_VERSION,
  READING_NEST_RESOURCE_VERSION
} from "@ss/shared";

export function buildHealthPayload(buildSha = "local") {
  return {
    ok: true,
    app: "德卡里奥斯家的书房",
    version: READING_NEST_APP_VERSION,
    resourceVersion: READING_NEST_RESOURCE_VERSION,
    buildSha
  } as const;
}
