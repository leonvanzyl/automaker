import { describe, it, expect } from "vitest";
import {
  APP_SPEC_XML_FORMAT,
  getAppSpecFormatInstruction,
} from "@/lib/app-spec-format.js";

describe("app-spec-format.ts", () => {
  describe("APP_SPEC_XML_FORMAT", () => {
    it("should export a non-empty string constant", () => {
      expect(typeof APP_SPEC_XML_FORMAT).toBe("string");
      expect(APP_SPEC_XML_FORMAT.length).toBeGreaterThan(0);
    });

    it("should contain XML format documentation", () => {
      expect(APP_SPEC_XML_FORMAT).toContain("<project_specification>");
      expect(APP_SPEC_XML_FORMAT).toContain("</project_specification>");
      expect(APP_SPEC_XML_FORMAT).toContain("<project_name>");
      expect(APP_SPEC_XML_FORMAT).toContain("<overview>");
      expect(APP_SPEC_XML_FORMAT).toContain("<technology_stack>");
      expect(APP_SPEC_XML_FORMAT).toContain("<core_capabilities>");
    });

    it("should contain XML escaping instructions", () => {
      expect(APP_SPEC_XML_FORMAT).toContain("&lt;");
      expect(APP_SPEC_XML_FORMAT).toContain("&gt;");
      expect(APP_SPEC_XML_FORMAT).toContain("&amp;");
    });
  });

  describe("getAppSpecFormatInstruction", () => {
    it("should return a string containing the XML format", () => {
      const instruction = getAppSpecFormatInstruction();
      expect(typeof instruction).toBe("string");
      expect(instruction).toContain(APP_SPEC_XML_FORMAT);
    });

    it("should contain critical formatting requirements", () => {
      const instruction = getAppSpecFormatInstruction();
      expect(instruction).toContain("CRITICAL FORMATTING REQUIREMENTS");
      expect(instruction).toContain("<project_specification>");
      expect(instruction).toContain("</project_specification>");
    });

    it("should contain verification instructions", () => {
      const instruction = getAppSpecFormatInstruction();
      expect(instruction).toContain("VERIFICATION");
      expect(instruction).toContain("exactly one root XML element");
    });

    it("should instruct not to use markdown", () => {
      const instruction = getAppSpecFormatInstruction();
      expect(instruction).toContain("Do NOT use markdown");
      expect(instruction).toContain("no # headers");
      expect(instruction).toContain("no **bold**");
    });
  });
});
