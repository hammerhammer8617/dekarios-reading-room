import { useEffect, useState } from "react";
import type { ParsedBookResource } from "../book-import/types.js";

export function useBookResourceUrls(
  resources: ParsedBookResource[] | undefined
): ReadonlyMap<string, string> {
  const [urls, setUrls] = useState<ReadonlyMap<string, string>>(() => new Map());

  useEffect(() => {
    let cancelled = false;
    if (!resources?.length) {
      setUrls(new Map());
      return () => {
        cancelled = true;
      };
    }

    const next = new Map<string, string>();
    for (const resource of resources) {
      void readBlobAsDataUrl(displayableImageBlob(resource))
        .then((url) => {
          if (cancelled) return;
          next.set(resource.path, url);
          setUrls(new Map(next));
        })
        .catch(() => undefined);
    }

    return () => {
      cancelled = true;
    };
  }, [resources]);

  return urls;
}

function displayableImageBlob(resource: ParsedBookResource): Blob {
  if (resource.blob.type.startsWith("image/")) return resource.blob;
  const mediaType = resource.mediaType.startsWith("image/")
    ? resource.mediaType
    : inferImageMediaType(resource.path);
  return new Blob([resource.blob], { type: mediaType });
}

function inferImageMediaType(path: string): string {
  const extension = path.split(".").pop()?.toLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "gif") return "image/gif";
  if (extension === "svg") return "image/svg+xml";
  if (extension === "webp") return "image/webp";
  return "application/octet-stream";
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("图片资源读取失败"));
    reader.onerror = () => reject(reader.error ?? new Error("图片资源读取失败"));
    reader.readAsDataURL(blob);
  });
}
