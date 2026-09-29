/**
 * R3 端到端 fixture：以运行库真数据断言「parseDefinition + dictSounds.attachSounds」发音链路
 *
 * 用法（node ≥22.6，直连真库只读，无浏览器/无 tauri 依赖）：
 *   node --experimental-strip-types docs/repair-dict-fixture.mjs
 *
 * 数据源：~/Library/Application Support/com.desktop-translation/dictionaries.db（运行库，只读打开）。
 * 期望值来源：废弃库 desktop-translation/ 中保留的 DOCE5 DSL 原文（[s] 标签文档序即
 * 音↔行对应真值，2026-09-29 R2 取证；hello 逐位一致，见 docs/repair-dict.md R2 段）。
 * 全部 PASS 才算通过；任何 FAIL 退出码 1。
 */
import { DatabaseSync } from "node:sqlite";
import { homedir } from "node:os";

const { parseDefinition } = await import(new URL("../src/lib/parseDefinition.ts", import.meta.url).href);
const { attachSounds, scopeResources, soundTag, pickHeadAudio, isExampleSound, isPlayableSoundFile } = await import(
  new URL("../src/lib/dictSounds.ts", import.meta.url).href
);
const { extractPhonetic } = await import(new URL("../src/lib/dictPhonetic.ts", import.meta.url).href);
const { toPlayableAudioUrl } = await import(new URL("../src/lib/audioUrl.ts", import.meta.url).href);

const DB_PATH =
  process.env.DICT_DB ??
  `${homedir()}/Library/Application Support/com.desktop-translation/dictionaries.db`;

// ---- 期望值（DSL 原文真值，逐行测得）----
const EXPECT = {
  DOCE5: {
    name: "En-En_Longman_DOCE5",
    audioRef: "bre_hello0205.wav",
    pron: ["bre_hello0205.wav", "ame_hello.wav"],
    pronTags: ["英音", "美音"],
    phonetic: "/həˈləʊ, he- -ˈloʊ/",
    // 例句行文本片段 → exa 文件（按 DSL 文档序 1:1）
    examples: [
      ["Hello, John! How are you?", "exa_p008-001354151.wav"],
      ["Stanley, come and", "exa_p008-001725228.wav"],
      ["Well,", "exa_p008-001725232.wav"],
      ["may I speak to Anne?", "exa_p008-001354161.wav"],
      ["Is there anybody home?", "exa_p008-001354166.wav"],
      ["didn’t remember her birthday?", "exa_p008-001834014.wav"],
      ["What’s happened here?", "exa_p008-001354171.wav"],
      ["Promise you’ll look in", "exa_p008-001725240.wav"],
    ],
    senseLabels: ["1", "2", "3", "4", "5", "6"],
  },
  OALD8: { name: "En-En_OALD8", pron: ["z_hello__gb_1.wav", "z_hello__us_1.wav"], pronTags: ["英音", "美音"] },
  MW11: { name: "En-En_Merriam_Webster11", pron: ["hello001.wav"], pronTags: [null] },
  LPron3: { name: "En-En_Longman_Pronunciation3", pron: ["uk_hello0205.wav", "us_hello.wav"], pronTags: ["英音", "美音"] },
};

let pass = 0, fail = 0;
const failures = [];
function check(id, cond, detail) {
  if (cond) { pass++; console.log(`PASS ${id}`); }
  else { fail++; failures.push(id); console.log(`FAIL ${id}${detail ? ` — ${detail}` : ""}`); }
}

const db = new DatabaseSync(DB_PATH, { readOnly: true });

// ---- 取真数据：4 词典 hello 词条 + 各自 resources（自然 rowid 序）----
const helloRows = db
  .prepare(`select id, dictionary_id, word, word_raw, definition, audio_ref from entries_data where word = 'hello'`)
  .all();
const dictNames = new Map(
  db.prepare(`select id, name from dictionaries`).all().map((d) => [d.id, d.name]),
);
const resourcesByEntry = new Map();
for (const r of db.prepare(`select entry_id, kind, filename, zip_file from resources`).all()) {
  if (!resourcesByEntry.has(r.entry_id)) resourcesByEntry.set(r.entry_id, []);
  resourcesByEntry.get(r.entry_id).push({ kind: r.kind, filename: r.filename, zip_file: r.zip_file });
}

const byDict = new Map(helloRows.map((e) => [e.dictionary_id, e]));
const doce = byDict.get(1);
const resOf = (entry) => resourcesByEntry.get(entry.id) ?? [];

// ================= 1) DOCE5 hello：解析 + 挂载全链 =================
{
  const E = EXPECT.DOCE5;
  check("doce.entry", !!doce && doce.word_raw === "hello" && doce.audio_ref === E.audioRef,
    `audio_ref=${doce?.audio_ref}`);
  const res = resOf(doce);
  check("doce.resources.count", res.length === 10, `n=${res.length}`);
  const lines = attachSounds(parseDefinition(doce.definition), res);

  // b) 无 DSL 包装标签残留
  const joined = lines.map((l) => l.html).join("\n");
  check("doce.noResidue", !/\[(?:lang|trn|\*|\/\*|\/ex|\/?m\d?|\/?s)\]/.test(joined), "存在 [lang]/[trn]/[*]/[/ex] 残留");

  // c) sense 标号 1..6
  const senses = lines.filter((l) => l.type === "sense").map((l) => l.label);
  check("doce.senses", JSON.stringify(senses) === JSON.stringify(E.senseLabels), `senses=${senses}`);

  // d) 词头行挂载：英 bre + 美 ame
  const head = lines.find((l) => l.type === "text");
  check("doce.headSounds", JSON.stringify(head?.sounds ?? []) === JSON.stringify(E.pron),
    `head.sounds=${JSON.stringify(head?.sounds)}`);
  const tags = (head?.sounds ?? []).map(soundTag);
  check("doce.headTags", JSON.stringify(tags) === JSON.stringify(E.pronTags), `tags=${JSON.stringify(tags)}`);

  // e) 音标行：$ 控制符清理后与期望一致
  const base = head.html.replace(/<[^>]+>/g, "");
  const pho = base.match(/\/[^/]+\//)?.[0]?.replace(/\$\s*/g, "").replace(/,\s*,/g, ",").replace(/\s+/g, " ").trim();
  check("doce.phonetic", pho === E.phonetic, `phonetic=${pho}`);

  // f) 例句槽逐位对应（文本片段定位行 → 恰 1 个期望文件）
  for (const [fragment, file] of E.examples) {
    const line = lines.find((l) => l.type === "example" && l.html.includes(fragment));
    check(`doce.exa[${fragment}]`,
      !!line && line.sounds?.length === 1 && line.sounds[0] === file && line.slot === true,
      `sounds=${JSON.stringify(line?.sounds)} slot=${line?.slot}`);
  }

  // g) 例句槽总数 == 8 == exa 资源数（槽位律防护前提）
  const slots = lines.filter((l) => l.slot === true);
  const exaCount = res.filter((r) => r.kind === "audio" && /^exa/i.test(r.filename)).length;
  check("doce.slotCount", slots.length === 8 && exaCount === 8, `slots=${slots.length} exa=${exaCount}`);

  // h) ▪ 注释行（REGISTER/THESAURUS）不挂音
  const bullets = lines.filter((l) => l.type !== "example" && /^\u25aa/.test(l.html));
  check("doce.bulletsSilent", bullets.length >= 8 && bullets.every((l) => !l.sounds?.length),
    `bullets=${bullets.length} 有音行=${bullets.filter((l) => l.sounds?.length).length}`);
}

// ================= 2) 跨库隔离 =================
{
  const E = EXPECT.DOCE5;
  const allHelloRes = helloRows.flatMap((e) => resOf(e));
  check("xlib.raw", allHelloRes.length === 15, `raw=${allHelloRes.length}`);

  const scoped = scopeResources(allHelloRes, E.name);
  check("xlib.scopeDoce", scoped.length === 10 && scoped.every((r) => r.zip_file.includes(`/${E.name}/`)),
    `scoped=${scoped.length}`);

  // speakFile 模拟：本词典命中 / 他库文件名不可命中
  const hit = scoped.find((r) => r.kind === "audio" && r.filename === "exa_p008-001354151.wav");
  check("xlib.resolveOwn", !!hit && hit.zip_file.includes("/En-En_Longman_DOCE5/"));
  const cross = scoped.find((r) => r.filename === "z_hello__gb_1.wav");
  check("xlib.rejectCross", cross === undefined);

  // pickHeadAudio：audio_ref 优先
  const headPick = pickHeadAudio(scoped, E.audioRef);
  check("xlib.headAudioRef", headPick?.filename === E.audioRef);

  // 各词典 hello 头行挂载互不污染
  for (const [dictId, key] of [[2, "OALD8"], [3, "MW11"], [4, "LPron3"]]) {
    const entry = byDict.get(dictId);
    const E2 = EXPECT[key];
    const lines = attachSounds(parseDefinition(entry.definition), resOf(entry));
    const head = lines.find((l) => l.type === "text");
    const tags = (head?.sounds ?? []).map(soundTag);
    check(`${key}.head`, JSON.stringify(head?.sounds ?? []) === JSON.stringify(E2.pron),
      `${key} head.sounds=${JSON.stringify(head?.sounds)}`);
    check(`${key}.tags`, JSON.stringify(tags) === JSON.stringify(E2.pronTags), `${key} tags=${JSON.stringify(tags)}`);
    check(`${key}.noExaLeak`, !(lines.some((l) => l.sounds ?? []).valueOf(), lines.some((l) => (l.sounds ?? []).some((f) => /^exa/i.test(f)))),
      `${key} 例句槽出现 exa 文件`);
  }

  // OALD8 例句槽为空但不得挂上 DOCE5 的 exa（词头行也不得混入他库文件）
  const oaldHead = (() => {
    const lines = attachSounds(parseDefinition(byDict.get(2).definition), resOf(byDict.get(2)));
    return lines.find((l) => l.type === "text");
  })();
  check("xlib.oaldNoDoce", (oaldHead.sounds ?? []).every((f) => f.startsWith("z_hello__")),
    `oald head=${JSON.stringify(oaldHead.sounds)}`);
}

// ================= 3) 同文件并钮（去重）+ 槽律防护 =================
{
  // 同文件重复出现 → 并钮（头行只留一份）
  const lines = attachSounds(
    [{ type: "text", html: "test /tɛst/" }, { type: "example", html: "e1", slot: true }, { type: "example", html: "e2", slot: true }],
    [
      { kind: "audio", filename: "bre_x.wav", zip_file: "/d/En-En_X/x.zip" },
      { kind: "audio", filename: "bre_x.wav", zip_file: "/d/En-En_X/x.zip" },
      { kind: "audio", filename: "ame_x.wav", zip_file: "/d/En-En_X/x.zip" },
      { kind: "audio", filename: "exa_1.wav", zip_file: "/d/En-En_X/x.zip" },
      { kind: "audio", filename: "exa_2.wav", zip_file: "/d/En-En_X/x.zip" },
    ],
  );
  check("dedupe.head", JSON.stringify(lines[0].sounds) === JSON.stringify(["bre_x.wav", "ame_x.wav"]),
    `head=${JSON.stringify(lines[0].sounds)}`);
  check("dedupe.slots", lines[1].sounds?.[0] === "exa_1.wav" && lines[2].sounds?.[0] === "exa_2.wav");

  // 槽数 != exa 数 → 槽行整条不挂（防错位，宁缺勿错）；头音不受防护影响
  const guard = attachSounds(
    [{ type: "text", html: "t" }, { type: "example", html: "e1", slot: true }, { type: "example", html: "e2", slot: true }, { type: "example", html: "e3", slot: true }],
    [
      { kind: "audio", filename: "bre_t.wav", zip_file: "/d/En-En_X/x.zip" },
      { kind: "audio", filename: "exa_1.wav", zip_file: "/d/En-En_X/x.zip" },
    ],
  );
  check("guard.mismatch",
    guard[0].sounds?.length === 1 && guard.filter((l) => l.slot).every((l) => !l.sounds?.length),
    "槽位不齐时槽行仍挂载");

  // DSL 分支产物已带 [s] → 不二次挂载
  const dsl = [{ type: "text", html: "head", sounds: ["from_dsl.wav"] }, { type: "example", html: "e", slot: true, sounds: ["exa_dsl.wav"] }];
  const untouched = attachSounds(dsl, [{ kind: "audio", filename: "exa_9.wav", zip_file: "/z/z.zip" }]);
  check("dsl.skip", untouched[0].sounds[0] === "from_dsl.wav" && untouched[1].sounds[0] === "exa_dsl.wav");
}

// ================= 4) 可选：DSL 分支回归（废弃库存在时） =================
{
  let oldDb = null;
  try {
    oldDb = new DatabaseSync(`${homedir()}/Library/Application Support/desktop-translation/dictionaries.db`, { readOnly: true });
  } catch { /* 废弃库已清理 → SKIP */ }
  if (oldDb) {
    const dslRow = oldDb.prepare(`select definition from entries_data where word_raw='hello'`).get();
    const lines = parseDefinition(dslRow.definition);
    const headSounds = lines.find((l) => l.sounds?.length)?.sounds ?? [];
    check("dsl.branch.head", JSON.stringify(headSounds) === JSON.stringify(["bre_hello0205.wav", "ame_hello.wav"]),
      `dsl head=${JSON.stringify(headSounds)}`);
    const dslSlots = lines.filter((l) => l.type === "example");
    // DSL 真值：hello 共 17 个 [ex] 例句行（8 个带 [s] 音 + REGISTER/THESAURUS 内联 9 个不带）
    const audible = dslSlots.filter((l) => l.sounds?.length);
    check("dsl.branch.slots",
      dslSlots.length === 17 && audible.length === 8 && audible.every((l) => /^exa_/.test(l.sounds[0])),
      `dsl slots=${dslSlots.length} audible=${audible.length}`);
    oldDb.close();
  } else {
    console.log("SKIP dsl.branch（废弃库不存在，DSL 分支回归跳过）");
  }
}

// ================= 5) 非.DOCE5 词典（OALD8 / MW11 / LPron3）hello + 群律/槽位律断言 =================
{
  // ---- OALD8 hello：词头 [英][美]（z_hello__gb_1 / z_hello__us_1）、例句行无音 ----
  {
    const e = byDict.get(2);
    const res = resOf(e);
    const lines = attachSounds(parseDefinition(e.definition), res, EXPECT.OALD8.name);
    const head = lines.find((l) => l.type === "text");
    check("oald8.headSounds", JSON.stringify(head?.sounds ?? []) === JSON.stringify(EXPECT.OALD8.pron),
      `oald8 head=${JSON.stringify(head?.sounds)}`);
    check("oald8.headTags", JSON.stringify((head?.sounds ?? []).map(soundTag)) === JSON.stringify(EXPECT.OALD8.pronTags),
      `oald8 tags=${JSON.stringify((head?.sounds ?? []).map(soundTag))}`);
    // OALD8 词头行为 `BrE [həˈləʊ] NAmE [həˈloʊ]`（标记词绑定段 → brE/amE variants）；
    // 词形表 [run runs ran running] 含空格须跳过（统一化后 plain 置空，由 variants 表达）
    const ext = extractPhonetic(head.html);
    check("oald8.phonetic", ext?.phonetic.brE === "/həˈləʊ/" && ext?.phonetic.amE === "/həˈloʊ/",
      `oald8 phonetic=${JSON.stringify(ext?.phonetic)}`);
    // 反斜杠型直测（MW11 形态）：\hə-ˈlō, he-\
    const mw = extractPhonetic("\\hə-ˈlō, he-\\ <i>noun</i>");
    check("phonetic.backslashShape", mw?.phonetic.plain === "/hə-ˈlō, he-/", `backslash=${mw?.phonetic?.plain}`);
    // 例句行为 bullet 行（• Hello John…），本词典无例句音数据 → 全条无 exa 文件
    check("oald8.noExa", !lines.some((l) => (l.sounds ?? []).some((f) => /^exa/i.test(f))), "oald8 例句槽泄漏 exa");
    // 例句行（type=example）不得被附加声音（该词典只有词头/词形变体音）
    check("oald8.examplesSilent", lines.filter((l) => l.type === "example").every((l) => !l.sounds?.length),
      "oald8 例句行有音");
  }

  // ---- MW11 hello：单钮（hello001.wav，无前缀 → 无标注）、音标 \…\ 反斜杠型 ----
  {
    const e = byDict.get(3);
    const res = resOf(e);
    const lines = attachSounds(parseDefinition(e.definition), res, EXPECT.MW11.name);
    const head = lines.find((l) => l.type === "text");
    check("mw11.headSounds", JSON.stringify(head?.sounds ?? []) === JSON.stringify(EXPECT.MW11.pron),
      `mw11 head=${JSON.stringify(head?.sounds)}`);
    check("mw11.headTags", JSON.stringify((head?.sounds ?? []).map(soundTag)) === JSON.stringify(EXPECT.MW11.pronTags),
      `mw11 tags=${JSON.stringify((head?.sounds ?? []).map(soundTag))}`);
    // MW11 音标：\…\ 反斜杠型提取归一为 /…/
    {
      const ext = extractPhonetic(head.html);
      check("mw11.phonetic", ext?.phonetic.plain === "/hə-ˈlō, he-/", `mw11 phonetic=${JSON.stringify(ext?.phonetic)}`);
    }
    // isExampleSound：MW11 stem 前缀（exacer01/exactl01 等）不得误判为例句音；DOCE5 exa_ 命中
    check("mw11.notExaByPrefix", !isExampleSound("exacer01.wav") && !isExampleSound("exactl01.wav") && isExampleSound("exa_p008-001354151.wav"),
      "isExampleSound 判定与 MW11 stem 前缀冲突");
    // MW11 无例句槽（3+ 空格行 0/400 实测）
    check("mw11.noSlotLines", !lines.some((l) => l.slot === true), "mw11 出现 slot 行");
  }

  // ---- LPron3 hello + light 群律（词头 1 组 + ▶ 复合行按序 1 组/行）----
  {
    // hello：2 音（uk_/us_），▷ 变体行无音
    const e = byDict.get(4);
    const lines = attachSounds(parseDefinition(e.definition), resOf(e), EXPECT.LPron3.name);
    const head = lines.find((l) => l.type === "text");
    check("lpron3.headSounds", JSON.stringify(head?.sounds ?? []) === JSON.stringify(EXPECT.LPron3.pron),
      `lpron3 head=${JSON.stringify(head?.sounds)}`);
    check("lpron3.headTags", JSON.stringify((head?.sounds ?? []).map(soundTag)) === JSON.stringify(EXPECT.LPron3.pronTags),
      `lpron3 tags=${JSON.stringify((head?.sounds ?? []).map(soundTag))}`);
    check("lpron3.variantsSilent", lines.filter((l) => l.type === "text" && l !== head).every((l) => !l.sounds?.length),
      "lpron3 hello ▷ 变体行有音");

    // light：18 音 = 词头 1 组 + 复合行 8 组；composite ▶ 行按序逐位挂载
    {
      const le = db.prepare(`select id, definition from entries_data where word='light' and dictionary_id=4`).get();
      const lres = db.prepare(`select kind, filename from resources where entry_id=? and kind='audio' order by id`).all(le.id);
      const llines = attachSounds(parseDefinition(le.definition), lres, EXPECT.LPron3.name);
      const lhead = llines.find((l) => l.type === "text");
      check("lpron3.light.headPair",
        JSON.stringify(lhead?.sounds ?? []) === JSON.stringify(["uk_light_las2_br.wav", "us_light1.wav"]),
        `lpron3 light head=${JSON.stringify(lhead?.sounds)}`);
      const compound = llines.filter((l) => l.type === "text" && l !== lhead && l.html.replace(/<[^>]+>/g, "").trim().startsWith("▶"));
      const pairs = lres.slice(2);
      check("lpron3.light.compoundCount", compound.length === 8 && pairs.length === 16,
        `compound=${compound.length} pairs=${pairs.length}`);
      // 群律逐位：第 k 复合行挂 resources[2+2k..3+2k]
      const aligned = compound.every((l, k) =>
        JSON.stringify(l.sounds ?? []) === JSON.stringify([pairs[2 * k].filename, pairs[2 * k + 1].filename]));
      check("lpron3.light.groupLaw", aligned, "lpron3 light 复合行群律不齐");
      // ▷ 变体行（lighted/lighter 等 6 行）不挂
      const variants = llines.filter((l) => l.type === "text" && l !== lhead &&
        !l.html.replace(/<[^>]+>/g, "").trim().startsWith("▶"));
      check("lpron3.light.variantsSilent", variants.length >= 5 && variants.every((l) => !l.sounds?.length),
        `variants=${variants.length} 有音=${variants.filter((l) => l.sounds?.length).length}`);
    }
  }
}

// ================= 6) 统一化断言（docs/dict-unify.md 规格#1/#2/#3，2026-09-29）=================
{
  // 音标统一结构：4 词典 hello 各 1 条（head/tail 为渲染派生伴随信息）
  const headLineOf = (dictId) => parseDefinition(byDict.get(dictId).definition).find((l) => l.type === "text");

  // —— DOCE5：单斜杠段 → plain，无 variants；尾段孤立标记词（BrE AmE 文件标签）已抽出 ——
  {
    const ext = extractPhonetic(headLineOf(1).html);
    check("uniform.doce.phonetic",
      ext?.phonetic.plain === "/həˈləʊ, he-ˈloʊ/" && ext?.phonetic.brE === undefined && ext?.phonetic.amE === undefined,
      `doce=${JSON.stringify(ext?.phonetic)}`);
    check("uniform.doce.noMarkerTail", ext != null && !/^\s*(BrE|AmE|NAmE)\b/.test(ext.tail),
      `doce tail 头部残留标记词: ${ext?.tail.slice(0, 30)}`);
  }

  // —— OALD8：BrE [..] NAmE [..] → brE/amE variants（plain 置空）；NAmE 段不再泄漏进 tail ——
  {
    const ext = extractPhonetic(headLineOf(2).html);
    check("uniform.oald8.phonetic",
      ext?.phonetic.plain === "" && ext?.phonetic.brE === "/həˈləʊ/" && ext?.phonetic.amE === "/həˈloʊ/",
      `oald8=${JSON.stringify(ext?.phonetic)}`);
    check("uniform.oald8.noMarkerTail", ext != null && !/\b(BrE|NAmE|AmE)\b/.test(ext.tail),
      `oald8 tail 残留标记词: ${ext?.tail.slice(0, 40)}`);
  }

  // —— MW11：反斜杠型归一 plain ——
  {
    const ext = extractPhonetic(headLineOf(3).html);
    check("uniform.mw11.phonetic", ext?.phonetic.plain === "/hə-ˈlō, he-/", `mw11=${JSON.stringify(ext?.phonetic)}`);
  }

  // —— LPron3：无括号型必须出结果；`AmE\` 残段清洗 + 地区段拆分为 variants ——
  {
    const ext = extractPhonetic(headLineOf(4).html);
    check("uniform.lpron3.phonetic",
      ext?.phonetic.plain === "" && ext?.phonetic.brE === "hə ˈləʊ he-" && ext?.phonetic.amE === "-ˈloʊ",
      `lpron3=${JSON.stringify(ext?.phonetic)}`);
    const vals = [ext?.phonetic.plain, ext?.phonetic.brE, ext?.phonetic.amE].filter(Boolean).join("|");
    check("uniform.lpron3.noResidue", !vals.includes("\\") && !/\b(BrE|AmE|NAmE)\b/.test(vals),
      `lpron3 残段=${vals}`);
    // 单段形态（light）：无括号出 plain（LPD 记法原样）
    const le = db.prepare(`select definition from entries_data where word='light' and dictionary_id=4`).get();
    const lext = extractPhonetic(parseDefinition(le.definition).find((l) => l.type === "text").html);
    check("uniform.lpron3.singleSection", lext?.phonetic.plain === "laɪt" && lext?.phonetic.brE === undefined,
      `light=${JSON.stringify(lext?.phonetic)}`);
  }

  // —— 按钮数据形状（规格#2）：soundTag (标签,文件名) 序对；渲染律=1音无标签/≥2音标签胶囊 ——
  for (const [dictId, key, E] of [[1, "doce", EXPECT.DOCE5], [2, "oald8", EXPECT.OALD8], [3, "mw11", EXPECT.MW11], [4, "lpron3", EXPECT.LPron3]]) {
    const lines = attachSounds(parseDefinition(byDict.get(dictId).definition), resOf(byDict.get(dictId)), E.name);
    const head = lines.find((l) => l.type === "text");
    const variants = [...new Set(head?.sounds ?? [])].map((f) => ({ file: f, tag: soundTag(f) }));
    const shapeOk = variants.every((v) => typeof v.file === "string" && (v.tag === null || v.tag === "英音" || v.tag === "美音"));
    check(`uniform.${key}.buttonShape`,
      shapeOk
        && JSON.stringify(variants.map((v) => v.file)) === JSON.stringify(E.pron)
        && JSON.stringify(variants.map((v) => v.tag)) === JSON.stringify(E.pronTags),
      `${key} variants=${JSON.stringify(variants)}`);
    // 数量律：MW11 单音（无标签单钮）；DOCE5/OALD8/LPron3 双音（英/美分组胶囊）
    check(`uniform.${key}.buttonCount`, variants.length === E.pron.length, `${key} n=${variants.length}`);
  }

  // —— 音频容器（规格#3，合成字节直测）：OggS/Speex→null；真 PCM 直过；伪 WAV 重打包 ——
  const dataUrlOf = (mime, buf) => `data:${mime};base64,${buf.toString("base64")}`;
  const u32le = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n, 0); return b; };
  const riffWav = (fmtTag, payload) => {
    const fmt = Buffer.alloc(16);
    fmt.writeUInt16LE(fmtTag, 0); // 其余 fmt 字段对本嗅探无关
    const body = Buffer.concat([Buffer.from("WAVEfmt "), u32le(16), fmt, Buffer.from("data"), u32le(payload.length), payload]);
    return Buffer.concat([Buffer.from("RIFF", "latin1"), u32le(body.length), body]);
  };
  const ogg = Buffer.concat([Buffer.from("OggS", "latin1"), Buffer.alloc(28, 0), Buffer.from("Speex   ", "latin1")]);
  check("uniform.audio.oggSpeex", toPlayableAudioUrl(dataUrlOf("audio/ogg", ogg)) === null, "OggS/Speex 未判为不可播");
  const pcmUrl = dataUrlOf("audio/x-wav", riffWav(1, Buffer.from("PCMPCMPCM")));
  check("uniform.audio.pcmWav", toPlayableAudioUrl(pcmUrl) === pcmUrl, "真 PCM WAV 应原样返回");
  const fakeUrl = dataUrlOf("audio/x-wav", riffWav(0x55, Buffer.from("ID3MP3DATA")));
  const fakeOut = toPlayableAudioUrl(fakeUrl);
  check("uniform.audio.fakeWav",
    typeof fakeOut === "string" && fakeOut.startsWith("data:audio/mpeg;base64,")
      && Buffer.from(fakeOut.split(",")[1] ?? "", "base64").toString("latin1") === "ID3MP3DATA",
    `fakeWav out=${String(fakeOut).slice(0, 40)}`);
  const mp3Url = dataUrlOf("audio/mpeg", Buffer.from("MP3RAW"));
  check("uniform.audio.plainMp3", toPlayableAudioUrl(mp3Url) === mp3Url, "非容器 data URL 应原样返回");

  // —— 文件名级可播判定：.spx 不可播（喇叭不渲染），wav 正常 ——
  check("uniform.isPlayable.spx", !isPlayableSoundFile("uk_hello.spx") && isPlayableSoundFile("bre_hello0205.wav"),
    "spx/wav 可播判定错误");
}

db.close();

console.log(`\n===== fixture 结果: PASS=${pass} FAIL=${fail} =====`);
if (fail > 0) {
  console.log("失败项:", failures.join(", "));
  process.exit(1);
}
