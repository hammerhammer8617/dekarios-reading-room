import { describe, expect, it } from "vitest";
import { readEpubCreators } from "./epub-metadata.js";

describe("readEpubCreators", () => {
  it("prefers creators with the author role", () => {
    const document = new DOMParser().parseFromString(
      `<package xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
        <metadata>
          <dc:creator opf:role="aut">麦克斯·班尼特</dc:creator>
          <dc:creator opf:role="edt">编辑甲</dc:creator>
          <dc:creator opf:role="trl">译者乙</dc:creator>
        </metadata>
      </package>`,
      "application/xml"
    );

    expect(readEpubCreators(document)).toEqual(["麦克斯·班尼特"]);
  });

  it("keeps all creators when role metadata is absent", () => {
    const document = new DOMParser().parseFromString(
      `<package xmlns:dc="http://purl.org/dc/elements/1.1/">
        <metadata><dc:creator>作者甲</dc:creator></metadata>
      </package>`,
      "application/xml"
    );

    expect(readEpubCreators(document)).toEqual(["作者甲"]);
  });
});
