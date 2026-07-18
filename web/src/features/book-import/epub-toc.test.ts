import { describe, expect, it } from "vitest";
import { readEpub2TocTitles } from "./epub-toc.js";

describe("readEpub2TocTitles", () => {
  it("maps NCX labels to normalized chapter paths", () => {
    const document = new DOMParser().parseFromString(
      `<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/">
        <navMap>
          <navPoint>
            <navLabel><text>ChatGPT与心灵之窗</text></navLabel>
            <content src="Text/chapter.xhtml#section" />
          </navPoint>
        </navMap>
      </ncx>`,
      "application/xml"
    );

    expect(readEpub2TocTitles(document, "OEBPS/toc.ncx")).toEqual(
      new Map([["OEBPS/Text/chapter.xhtml", "ChatGPT与心灵之窗"]])
    );
  });
});
