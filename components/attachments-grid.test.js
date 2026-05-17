// @vitest-environment node
import { describe, it, expect } from "vitest";
import { getTileStyle } from "./attachments-grid.jsx";

describe("getTileStyle", () => {
  it("returns image style for image/png", () => {
    expect(getTileStyle("image/png")).toEqual({ icon: "image", bg: null });
  });

  it("returns image style for image/jpeg", () => {
    expect(getTileStyle("image/jpeg")).toEqual({ icon: "image", bg: null });
  });

  it("returns pdf style for application/pdf", () => {
    expect(getTileStyle("application/pdf")).toEqual({
      icon: "file-text",
      bg: "bg-red-100 text-red-600",
    });
  });

  it("returns video style for video/mp4", () => {
    expect(getTileStyle("video/mp4")).toEqual({
      icon: "play",
      bg: "bg-slate-800 text-white",
    });
  });

  it("returns video style for video/webm", () => {
    expect(getTileStyle("video/webm")).toEqual({
      icon: "play",
      bg: "bg-slate-800 text-white",
    });
  });

  it("returns archive style for application/zip", () => {
    expect(getTileStyle("application/zip")).toEqual({
      icon: "archive",
      bg: "bg-purple-100 text-purple-700",
    });
  });

  it("returns archive style for application/x-tar", () => {
    expect(getTileStyle("application/x-tar")).toEqual({
      icon: "archive",
      bg: "bg-purple-100 text-purple-700",
    });
  });

  it("returns code style for text/plain", () => {
    expect(getTileStyle("text/plain")).toEqual({
      icon: "code",
      bg: "bg-slate-100 text-slate-700",
    });
  });

  it("returns code style for application/json", () => {
    expect(getTileStyle("application/json")).toEqual({
      icon: "code",
      bg: "bg-slate-100 text-slate-700",
    });
  });

  it("returns doc style for application/vnd.openxmlformats-officedocument.wordprocessingml.document", () => {
    expect(
      getTileStyle(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      )
    ).toEqual({ icon: "file", bg: "bg-blue-100 text-blue-700" });
  });

  it("returns doc style for application/msword", () => {
    expect(getTileStyle("application/msword")).toEqual({
      icon: "file",
      bg: "bg-blue-100 text-blue-700",
    });
  });

  it("returns fallback amber style for unknown types", () => {
    expect(getTileStyle("application/octet-stream")).toEqual({
      icon: "paperclip",
      bg: "bg-amber-100 text-amber-700",
    });
  });

  it("returns fallback for null/undefined", () => {
    expect(getTileStyle(null)).toEqual({
      icon: "paperclip",
      bg: "bg-amber-100 text-amber-700",
    });
    expect(getTileStyle(undefined)).toEqual({
      icon: "paperclip",
      bg: "bg-amber-100 text-amber-700",
    });
  });
});
