import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FootnoteText } from "./FootnoteText.js";

describe("FootnoteText", () => {
  it("opens a footnote beside its reference without changing the readable text", () => {
    const { container } = render(
      <FootnoteText
        text="正文开始正文继续。"
        references={[
          {
            id: "ref-1",
            noteId: "note-1",
            label: "[1]",
            offset: 4
          }
        ]}
        notes={[
          {
            id: "note-1",
            label: "[1]",
            text: "这是脚注内容。",
            targetHref: "text/chapter.xhtml#note-1"
          }
        ]}
      />
    );

    expect(container.textContent).toBe("正文开始[1]正文继续。");
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "[1]" }));
    expect(screen.getByRole("dialog", { name: "脚注 [1]" })).toHaveTextContent(
      "这是脚注内容。"
    );

    fireEvent.click(screen.getByRole("button", { name: "关闭脚注" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
