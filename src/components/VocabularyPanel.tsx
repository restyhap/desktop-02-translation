import { useState, useEffect } from "react";
import { store } from "@/storage";
import type { VocabularyGroup, VocabularyWord } from "@/types/vocabulary";

const COLORS = ["#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899"];

export function VocabularyPanel() {
  const [groups, setGroups] = useState<VocabularyGroup[]>([]);
  const [words, setWords] = useState<VocabularyWord[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [showAddGroup, setShowAddGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupColor, setNewGroupColor] = useState(COLORS[0]);

  const [showAddWord, setShowAddWord] = useState(false);
  const [newWord, setNewWord] = useState("");
  const [newTranslation, setNewTranslation] = useState("");
  const [newPhonetic, setNewPhonetic] = useState("");
  const [newExample, setNewExample] = useState("");

  const loadData = async () => {
    setLoading(true);
    try {
      const [groupsData, wordsData] = await Promise.all([
        store.getVocabularyGroups(),
        store.getVocabularyWords(),
      ]);
      setGroups(groupsData);
      setWords(wordsData);
    } catch (error) {
      console.error("[VocabularyPanel] 加载数据失败:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddGroup = async () => {
    if (!newGroupName.trim()) return;
    try {
      await store.addVocabularyGroup(newGroupName.trim(), newGroupColor);
      setNewGroupName("");
      setShowAddGroup(false);
      loadData();
    } catch (error) {
      console.error("[VocabularyPanel] 创建词组失败:", error);
    }
  };

  const handleDeleteGroup = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("删除词组会同时删除所有词条，确定？")) return;
    try {
      await store.deleteVocabularyGroup(id);
      if (selectedGroupId === id) setSelectedGroupId(null);
      loadData();
    } catch (error) {
      console.error("[VocabularyPanel] 删除词组失败:", error);
    }
  };

  const handleAddWord = async () => {
    if (!newWord.trim() || !newTranslation.trim() || !selectedGroupId) return;
    try {
      await store.addVocabularyWord(
        newWord.trim(),
        newTranslation.trim(),
        selectedGroupId,
        newPhonetic.trim() || undefined,
        newExample.trim() || undefined
      );
      setNewWord("");
      setNewTranslation("");
      setNewPhonetic("");
      setNewExample("");
      setShowAddWord(false);
      loadData();
    } catch (error) {
      console.error("[VocabularyPanel] 添加词条失败:", error);
    }
  };

  const handleDeleteWord = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await store.deleteVocabularyWord(id);
      loadData();
    } catch (error) {
      console.error("[VocabularyPanel] 删除词条失败:", error);
    }
  };

  const filteredWords = selectedGroupId
    ? words.filter((w) => w.groupId === selectedGroupId)
    : words;

  const getGroupById = (id: string) => groups.find((g) => g.id === id);

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold">生词本</span>
          <button
            onClick={() => setShowAddGroup(!showAddGroup)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {showAddGroup ? "取消" : "+ 词组"}
          </button>
        </div>

        {showAddGroup && (
          <div className="mb-2 p-2 border rounded bg-muted/30">
            <input
              type="text"
              placeholder="词组名称"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              className="w-full px-2 py-1 text-sm border rounded mb-2 focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <div className="flex gap-1.5 mb-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setNewGroupColor(c)}
                  className={`w-5 h-5 rounded-full ${newGroupColor === c ? "ring-2 ring-offset-1 ring-foreground" : ""}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <button
              onClick={handleAddGroup}
              disabled={!newGroupName.trim()}
              className="w-full px-2 py-1 text-xs bg-primary text-primary-foreground rounded disabled:opacity-50"
            >
              创建
            </button>
          </div>
        )}

        {loading ? (
          <div className="text-xs text-muted-foreground">加载中...</div>
        ) : (
          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={() => { setSelectedGroupId(null); setShowAddWord(false); }}
              className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                selectedGroupId === null
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              全部
            </button>
            {groups.map((group) => (
              <div key={group.id} className="relative group">
                <button
                  onClick={() => { setSelectedGroupId(group.id); setShowAddWord(false); }}
                  className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                    selectedGroupId === group.id
                      ? "text-white"
                      : "text-muted-foreground hover:opacity-80"
                  }`}
                  style={{
                    backgroundColor:
                      selectedGroupId === group.id ? group.color : `${group.color}20`,
                  }}
                >
                  {group.name}
                </button>
                <button
                  onClick={(e) => handleDeleteGroup(e, group.id)}
                  className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 text-white rounded-full text-[9px] leading-none opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                  title="删除词组"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {selectedGroupId && (
          <div className="mb-3">
            {!showAddWord ? (
              <button
                onClick={() => setShowAddWord(true)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                + 添加生词
              </button>
            ) : (
              <div className="p-2 border rounded bg-muted/30">
                <input
                  type="text"
                  placeholder="单词"
                  value={newWord}
                  onChange={(e) => setNewWord(e.target.value)}
                  className="w-full px-2 py-1 text-sm border rounded mb-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <input
                  type="text"
                  placeholder="释义"
                  value={newTranslation}
                  onChange={(e) => setNewTranslation(e.target.value)}
                  className="w-full px-2 py-1 text-sm border rounded mb-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <input
                  type="text"
                  placeholder="音标（可选）"
                  value={newPhonetic}
                  onChange={(e) => setNewPhonetic(e.target.value)}
                  className="w-full px-2 py-1 text-sm border rounded mb-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <input
                  type="text"
                  placeholder="例句（可选）"
                  value={newExample}
                  onChange={(e) => setNewExample(e.target.value)}
                  className="w-full px-2 py-1 text-sm border rounded mb-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleAddWord}
                    disabled={!newWord.trim() || !newTranslation.trim()}
                    className="flex-1 px-2 py-1 text-xs bg-primary text-primary-foreground rounded disabled:opacity-50"
                  >
                    添加
                  </button>
                  <button
                    onClick={() => { setShowAddWord(false); setNewWord(""); setNewTranslation(""); setNewPhonetic(""); setNewExample(""); }}
                    className="px-2 py-1 text-xs bg-muted text-muted-foreground rounded"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {!loading && filteredWords.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-8">
            {selectedGroupId ? "该词组暂无生词" : "暂无生词"}
          </div>
        ) : (
          !loading && filteredWords.map((word) => {
            const group = getGroupById(word.groupId);
            return (
              <div
                key={word.id}
                className="p-3 border rounded-lg mb-2 hover:bg-muted/30 transition-colors group"
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium text-sm">{word.word}</div>
                  <div className="flex items-center gap-2">
                    {group && (
                      <span
                        className="text-xs px-2 py-0.5 rounded-full text-white"
                        style={{ backgroundColor: group.color }}
                      >
                        {group.name}
                      </span>
                    )}
                    <button
                      onClick={(e) => handleDeleteWord(e, word.id)}
                      className="text-sm text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-500"
                      title="删除"
                    >
                      ×
                    </button>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  {word.translation}
                </div>
                {word.phonetic && (
                  <div className="text-xs text-muted-foreground/70 mt-0.5">
                    {word.phonetic}
                  </div>
                )}
                {word.example && (
                  <div className="text-xs text-muted-foreground mt-2 italic">
                    "{word.example}"
                  </div>
                )}
                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground/60">
                  <span>复习 {word.reviewCount} 次</span>
                  {word.lastReviewedAt && (
                    <span>
                      最近复习: {new Date(word.lastReviewedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
