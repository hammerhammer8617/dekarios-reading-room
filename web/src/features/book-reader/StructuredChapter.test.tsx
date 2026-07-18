import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StructuredChapter } from "./StructuredChapter.js";

describe("StructuredChapter", () => {
  it("renders paragraphs and images in source order", () => {
    const { container } = render(
      <StructuredChapter
        chapter={{
          id: "chapter-1",
          title: "测试章节",
          text: "图片之前。\n\n图片之后。",
          blocks: [
            { id: "p1", type: "paragraph", text: "图片之前。" },
            {
              id: "image-1",
              type: "image",
              resourcePath: "OEBPS/assets/brain.png",
              alt: "脑结构图"
            },
            { id: "p2", type: "paragraph", text: "图片之后。" }
          ]
        }}
      />
    );

    const children = Array.from(container.querySelector("article")?.children ?? []);
    expect(children.map((element) => element.tagName)).toEqual(["P", "FIGURE", "P"]);
    expect(container.textContent).toContain("脑结构图");
  });
});
