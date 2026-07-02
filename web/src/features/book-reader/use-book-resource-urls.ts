import { useEffect, useState } from "react";
import type { ParsedBookResource } from "../book-import/types.js";

export function useBookResourceUrls(
  resources: ParsedBookResource[] | undefined
): ReadonlyMap<string, string> {
  const [urls, setUrls] = useState<ReadonlyMap<string, string>>(() => new Map());

  useEffect(() => {
    const next = new Map<string, string>();
    for (const resource of resources ?? []) {
      next.set(resource.path, URL.createObjectURL(resource.blob));
    }
    setUrls(next);

    return () => {
      for (const url of next.values()) URL.revokeObjectURL(url);
    };
  }, [resources]);

  return urls;
}
