import { describe, it, expect } from "vitest";
import { parseDefinition } from "./parseDefinition";

describe("parseDefinition", () => {
  it("识别 MW11 罗马数字词性段", () => {
    const lines = parseDefinition("<b>I. </b> \\ˈbərd\\ <i>noun</i><br><b>1.</b> a creature");
    expect(lines[0].type).toBe("pos");
    expect(lines[0].label).toBe("I");
    expect(lines[1].type).toBe("sense");
  });

  it("识别 <b><i>intransitive verb</i></b> 词性", () => {
    const lines = parseDefinition("<b><i>intransitive verb</i></b><br><b>1.</b> to run");
    expect(lines[0].type).toBe("pos");
    expect(lines[0].label).toContain("verb");
  });

  it("识别编号义项与字母子义项", () => {
    const lines = parseDefinition("<b>1.</b> first sense<br><b>2.</b> second sense<br><b>a.</b> sub sense");
    expect(lines[0]).toMatchObject({ type: "sense", label: "1" });
    expect(lines[1]).toMatchObject({ type: "sense", label: "2" });
    expect(lines[2]).toMatchObject({ type: "subsense", label: "a" });
  });

  it("识别全大写分组标题", () => {
    const lines = parseDefinition("<b>MOVE FAST ON FOOT</b><br><b>1.</b> to go quickly");
    expect(lines[0]).toMatchObject({ type: "group", label: "MOVE FAST ON FOOT" });
  });

  it("识别 meta (冒号在 <b> 内)", () => {
    const lines = parseDefinition("<b>Usage:</b> often attributive<br><b>Etymology:</b> Old English");
    expect(lines[0]).toMatchObject({ type: "meta", label: "Usage" });
    expect(lines[1]).toMatchObject({ type: "meta", label: "Etymology" });
  });

  it("识别 • 例句", () => {
    const lines = parseDefinition("<b>1.</b> sense<br>•  Can you run? <br>•  They ran.");
    expect(lines[1].type).toBe("example");
    expect(lines[2].type).toBe("example");
    expect(lines[1].html).not.toContain("•");
  });

  it("MW11 bird 真实样本: 1 词性 + 编号义项", () => {
    const html =
      "<b>I. </b> \\ˈbərd\\ <i>noun</i><br><b>Usage:</b> often attributive<br>" +
      "<b>1.</b> <i>archaic</i> <b>:</b> the young of a feathered vertebrate<br>" +
      "<b>a.</b> <b>:</b> a game bird";
    const lines = parseDefinition(html);
    expect(lines.map((l) => l.type)).toEqual(["pos", "meta", "sense", "subsense"]);
    expect(lines[2].label).toBe("1");
    expect(lines[3].label).toBe("a");
  });

  it("空白行全部过滤", () => {
    const lines = parseDefinition("   <br>  <br>  only content <br>");
    expect(lines).toHaveLength(1);
  });
});