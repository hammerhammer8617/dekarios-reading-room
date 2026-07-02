import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FootnoteText } from "./FootnoteText.js";

describe("repeated footnote references", () => {
  it("opens one bubble for the selected reference", () => {
    render(
      <FootnoteText
        text="甲乙丙丁"
        references={[
          { id: "ref-a", noteId: "note-1", label: "[1]", offset: 1 },
          { id: "ref-b", noteId: "note-1", label: "[1]", offset: 3 }
        ]}
        notes={[
          {
            id: "note-1",
            label: "[1]",
            text: "重复引用的脚注。",
            targetHref: "text/chapter.xhtml#note-1"
          }
        ]}
      />
    );

    fireEvent.click(screen.getAllByRole("button", { name: "[1]" }).at(1)!);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });
});
