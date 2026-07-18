import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App.js";

describe("Bindery app", () => {
  it("presents the converter as a local independent tool", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "电子书装订室" })).toBeInTheDocument();
    expect(screen.getByText(/原书不会上传/u)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "转换并校验" })).toBeDisabled();
  });

  it("accepts a supported file and exposes the conversion action", () => {
    const { container } = render(<App />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["正文"], "书.txt")] } });
    expect(screen.getByText("书.txt")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "转换并校验" })).toBeEnabled();
  });

  it("converts a real text file all the way to a downloadable EPUB", async () => {
    const { container } = render(<App />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(["第一章\n\n这是可以阅读的正文。"], "小书.txt")] }
    });
    fireEvent.click(screen.getByRole("button", { name: "转换并校验" }));

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "下载 EPUB" })).toHaveAttribute(
        "download",
        "小书.epub"
      );
    });
    expect(screen.getByText(/已通过小于 40 MB 的硬校验/u)).toBeInTheDocument();
  });
});
