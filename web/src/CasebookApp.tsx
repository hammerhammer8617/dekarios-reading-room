import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type {
  CaseBundle,
  CaseEntity,
  CaseEntityType,
  CaseEntryKind,
  CaseGraphStatus,
  CaseHypothesis,
  CaseRelation,
  CaseSourceType,
  InvestigationCase
} from "@ss/shared";
import {
  askChatGpt,
  callTool,
  initialToolOutput,
  requestReaderFullscreen,
  updateModelContext
} from "./bridge/host.js";

type CasebookOutput = {
  appView?: string;
  cases?: InvestigationCase[];
};

type Tab = "entries" | "graph";
type DragState = {
  entityId: string;
  offsetX: number;
  offsetY: number;
};

const entityLabels: Record<CaseEntityType, string> = {
  person: "人物",
  place: "地点",
  object: "物件",
  organization: "组织",
  event: "事件"
};

const entryLabels: Record<CaseEntryKind, string> = {
  observation: "观察",
  claim: "证词",
  evidence: "物证",
  question: "问题",
  hypothesis: "猜想"
};

const quickEntryPrefixes: Array<{ prefix: string; kind: CaseEntryKind }> = [
  { prefix: "我注意到", kind: "observation" },
  { prefix: "问盖尔", kind: "question" },
  { prefix: "我觉得", kind: "hypothesis" },
  { prefix: "证词", kind: "claim" },
  { prefix: "物证", kind: "evidence" },
  { prefix: "事实", kind: "observation" }
];

export function detectQuickEntryKind(content: string): CaseEntryKind | null {
  const normalized = content.trimStart();
  const matched = quickEntryPrefixes.find(({ prefix }) =>
    new RegExp(`^${prefix}\\s*[：:]`).test(normalized)
  );
  return matched?.kind ?? null;
}

export function CasebookApp(props: {
  initialOutput?: CasebookOutput;
  onBackToReading?: () => void | Promise<void>;
  returningToReading?: boolean;
} = {}) {
  const initial = props.initialOutput ?? initialToolOutput<CasebookOutput>();
  const [cases, setCases] = useState<InvestigationCase[]>(() => initial?.cases ?? []);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [bundle, setBundle] = useState<CaseBundle | null>(null);
  const [tab, setTab] = useState<Tab>("entries");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState("");
  const [title, setTitle] = useState("");
  const [sourceType, setSourceType] = useState<CaseSourceType>("novel");
  const [sourceLabel, setSourceLabel] = useState("");
  const [entryContent, setEntryContent] = useState("");
  const [entryKind, setEntryKind] = useState<CaseEntryKind>("observation");
  const [sourcePosition, setSourcePosition] = useState("");
  const [entityName, setEntityName] = useState("");
  const [entityType, setEntityType] = useState<CaseEntityType>("person");
  const [relationSource, setRelationSource] = useState("");
  const [relationTarget, setRelationTarget] = useState("");
  const [relationType, setRelationType] = useState("");
  const [hypothesis, setHypothesis] = useState("");
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const graphRef = useRef<HTMLDivElement | null>(null);

  const loadCases = useCallback(async () => {
    const result = await callTool("case_list", {});
    const next = Array.isArray(result.structuredContent?.cases)
      ? (result.structuredContent?.cases as InvestigationCase[])
      : [];
    setCases(next);
    return next;
  }, []);

  useEffect(() => {
    void loadCases().catch(() => setToast("案件列表暂时没有读取成功。"));
  }, [loadCases]);

  const loadBundle = useCallback(async (caseId: string, quiet = false) => {
    try {
      const result = await callTool("case_get", { caseId });
      const next = result.structuredContent?.bundle as CaseBundle | undefined;
      if (next) setBundle(next);
    } catch {
      if (!quiet) setToast("案情暂时没有读取成功，请重试。");
    }
  }, []);

  useEffect(() => {
    if (!selectedCaseId) {
      setBundle(null);
      return;
    }
    void loadBundle(selectedCaseId);
    const timer = window.setInterval(() => void loadBundle(selectedCaseId, true), 4_000);
    return () => window.clearInterval(timer);
  }, [loadBundle, selectedCaseId]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const selectedEntity = useMemo(
    () => bundle?.entities.find((entity) => entity.id === selectedEntityId) ?? null,
    [bundle?.entities, selectedEntityId]
  );
  const detectedEntryKind = useMemo(
    () => detectQuickEntryKind(entryContent),
    [entryContent]
  );

  async function createCase() {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      const result = await callTool("case_create", {
        title: title.trim(),
        sourceType,
        ...(sourceLabel.trim() ? { sourceLabel: sourceLabel.trim() } : {})
      });
      const investigationCase = result.structuredContent?.case as InvestigationCase | undefined;
      if (!investigationCase) throw new Error("Missing case");
      setCreating(false);
      setTitle("");
      setSourceLabel("");
      await loadCases();
      setSelectedCaseId(investigationCase.id);
      setToast("案件已经展开。");
    } catch {
      setToast("案件没有建立成功，请重试。");
    } finally {
      setBusy(false);
    }
  }

  async function addEntry(syncAfter = false) {
    if (!bundle || !entryContent.trim() || busy) return;
    setBusy(true);
    try {
      await callTool("case_add_entry", {
        caseId: bundle.case.id,
        author: "tav",
        kind: entryKind,
        content: entryContent.trim(),
        ...(sourcePosition.trim() ? { sourcePosition: sourcePosition.trim() } : {})
      });
      setEntryContent("");
      setSourcePosition("");
      await loadBundle(bundle.case.id);
      await loadCases();
      setToast("已经按原话记下。");
      if (syncAfter) await syncCase(bundle.case.id);
    } catch {
      setToast("这条案情没有保存成功，请重试。");
    } finally {
      setBusy(false);
    }
  }

  async function addEntity() {
    if (!bundle || !entityName.trim() || busy) return;
    setBusy(true);
    try {
      await callTool("case_upsert_entity", {
        caseId: bundle.case.id,
        entityType,
        name: entityName.trim(),
        createdBy: "tav",
        status: "confirmed"
      });
      setEntityName("");
      await loadBundle(bundle.case.id);
      setToast("节点已经放上结构图。");
    } catch {
      setToast("节点没有保存成功，请重试。");
    } finally {
      setBusy(false);
    }
  }

  async function addRelation() {
    if (!bundle || !relationSource || !relationTarget || !relationType.trim() || busy) return;
    setBusy(true);
    try {
      await callTool("case_upsert_relation", {
        caseId: bundle.case.id,
        sourceEntityId: relationSource,
        targetEntityId: relationTarget,
        relationType: relationType.trim(),
        createdBy: "tav",
        status: "confirmed"
      });
      setRelationType("");
      await loadBundle(bundle.case.id);
      setToast("关系已经连上。");
    } catch {
      setToast("关系没有保存成功，请检查起点与终点。");
    } finally {
      setBusy(false);
    }
  }

  async function addHypothesis() {
    if (!bundle || !hypothesis.trim() || busy) return;
    setBusy(true);
    try {
      await callTool("case_upsert_hypothesis", {
        caseId: bundle.case.id,
        author: "tav",
        claim: hypothesis.trim(),
        status: "active"
      });
      setHypothesis("");
      await loadBundle(bundle.case.id);
      setToast("猜想已经封在案情里。");
    } catch {
      setToast("猜想没有保存成功，请重试。");
    } finally {
      setBusy(false);
    }
  }

  async function updateRelationStatus(relation: CaseRelation, status: CaseGraphStatus) {
    if (!bundle) return;
    await callTool("case_upsert_relation", {
      caseId: bundle.case.id,
      relationId: relation.id,
      sourceEntityId: relation.sourceEntityId,
      targetEntityId: relation.targetEntityId,
      relationType: relation.relationType,
      ...(relation.label ? { label: relation.label } : {}),
      status,
      createdBy: relation.createdBy,
      ...(relation.supportingEntryId
        ? { supportingEntryId: relation.supportingEntryId }
        : {})
    });
    await loadBundle(bundle.case.id);
  }

  async function updateEntityStatus(entity: CaseEntity, status: CaseGraphStatus) {
    if (!bundle) return;
    await saveEntity({ ...entity, status });
  }

  async function updateHypothesisStatus(
    item: CaseHypothesis,
    status: CaseHypothesis["status"]
  ) {
    if (!bundle) return;
    await callTool("case_upsert_hypothesis", {
      caseId: bundle.case.id,
      hypothesisId: item.id,
      author: item.author,
      claim: item.claim,
      status,
      ...(item.confidence !== undefined ? { confidence: item.confidence } : {})
    });
    await loadBundle(bundle.case.id);
  }

  async function saveEntity(entity: CaseEntity) {
    if (!bundle) return;
    await callTool("case_upsert_entity", {
      caseId: bundle.case.id,
      entityId: entity.id,
      entityType: entity.entityType,
      name: entity.name,
      ...(entity.description ? { description: entity.description } : {}),
      status: entity.status,
      createdBy: entity.createdBy,
      ...(entity.x !== undefined ? { x: entity.x } : {}),
      ...(entity.y !== undefined ? { y: entity.y } : {})
    });
    await loadBundle(bundle.case.id, true);
  }

  async function syncCase(caseId = bundle?.case.id) {
    if (!caseId || syncing) return;
    setSyncing(true);
    try {
      const result = await callTool("case_prepare_sync", { caseId });
      const context = result.structuredContent?.context as Record<string, unknown> | undefined;
      const operation = result.structuredContent?.operation as
        | { operationId?: string; fromRevision?: number; toRevision?: number }
        | undefined;
      if (!context || !operation?.operationId) throw new Error("Missing case context");
      await updateModelContext(context);
      await askChatGpt(
        `【案件簿同步】我把案件从第 ${operation.fromRevision ?? 0} 版到第 ${operation.toRevision ?? 0} 版的新材料放到案件桌上了。请只依据刚刚同步的结构化案情和已有图谱参与推理；把观察、证词、物证与猜想分开。你可以提出问题，也可以用 case_upsert_entity、case_upsert_relation 或 case_upsert_hypothesis 写下自己的建议，createdBy/author 使用 gale，新增节点和关系保持 suggested。确认实际收到这批上下文后，请调用 case_confirm_sync，caseId=${caseId}，operationId=${operation.operationId}。`
      );
      setToast("新增案情已经递给盖尔，回应会留在聊天里。");
    } catch {
      setToast("同步没有完成；案件版本没有被假装推进。");
    } finally {
      setSyncing(false);
    }
  }

  function startDrag(event: ReactPointerEvent, entity: CaseEntity) {
    const graph = graphRef.current?.getBoundingClientRect();
    if (!graph) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const position = entityPosition(entity, bundle?.entities ?? []);
    setDrag({
      entityId: entity.id,
      offsetX: event.clientX - graph.left - position.x,
      offsetY: event.clientY - graph.top - position.y
    });
    setSelectedEntityId(entity.id);
  }

  function moveDrag(event: ReactPointerEvent) {
    if (!drag || !bundle) return;
    const graph = graphRef.current?.getBoundingClientRect();
    if (!graph) return;
    const x = clamp(event.clientX - graph.left - drag.offsetX, 8, graph.width - 150);
    const y = clamp(event.clientY - graph.top - drag.offsetY, 8, graph.height - 70);
    setBundle({
      ...bundle,
      entities: bundle.entities.map((entity) =>
        entity.id === drag.entityId ? { ...entity, x, y } : entity
      )
    });
  }

  async function endDrag() {
    if (!drag || !bundle) return;
    const entity = bundle.entities.find((item) => item.id === drag.entityId);
    setDrag(null);
    if (entity) await saveEntity(entity);
  }

  if (!bundle) {
    return (
      <main className="casebook-shell casebook-home">
        <header className="casebook-title-row">
          <div>
            <span className="casebook-kicker">G.T.D. CASEBOOK</span>
            <h1>德卡里奥斯家的案件簿</h1>
            <p>只记录我们此刻已经知道的事实。</p>
          </div>
          <div className="casebook-home-actions">
            {props.onBackToReading ? (
              <button
                className="text-button"
                disabled={props.returningToReading}
                onClick={() => void props.onBackToReading?.()}
              >
                {props.returningToReading ? "正在返回…" : "返回书房"}
              </button>
            ) : null}
            <button className="action-primary" onClick={() => setCreating(true)}>新建案件</button>
          </div>
        </header>
        {creating ? (
          <CaseCreateForm
            title={title}
            sourceType={sourceType}
            sourceLabel={sourceLabel}
            busy={busy}
            onTitle={setTitle}
            onSourceType={setSourceType}
            onSourceLabel={setSourceLabel}
            onSubmit={() => void createCase()}
            onCancel={() => setCreating(false)}
          />
        ) : null}
        <section className="case-list">
          {cases.length === 0 ? (
            <div className="casebook-empty">
              <strong>案件桌还是空的。</strong>
              <p>建一个案子，我们就从第一条不对劲的细节开始。</p>
            </div>
          ) : (
            cases.map((item) => (
              <button key={item.id} className="case-card" onClick={() => setSelectedCaseId(item.id)}>
                <span>{sourceTypeLabel(item.sourceType)}</span>
                <strong>{item.title}</strong>
                <small>版本 {item.caseRevision} · 盖尔已同步 {item.assistantSyncedRevision}</small>
              </button>
            ))
          )}
        </section>
        {toast ? <div className="toast" role="status">{toast}</div> : null}
      </main>
    );
  }

  const unsynced = bundle.case.caseRevision - bundle.case.assistantSyncedRevision;

  return (
    <div className="casebook-shell">
      <header className="casebook-case-header">
        <button className="back-link" onClick={() => { setBundle(null); setSelectedCaseId(null); }}>
          ‹ 案件列表
        </button>
        <div className="casebook-heading">
          <div>
            <span className="casebook-kicker">{sourceTypeLabel(bundle.case.sourceType)}</span>
            <h1>{bundle.case.title}</h1>
            {bundle.case.sourceLabel ? <p>{bundle.case.sourceLabel}</p> : null}
          </div>
          <button className="text-button" onClick={() => void requestReaderFullscreen()}>全屏</button>
        </div>
        <div className="case-sync-strip">
          <span>案件 v{bundle.case.caseRevision}</span>
          <span>盖尔已知 v{bundle.case.assistantSyncedRevision}</span>
          <strong className={unsynced > 0 ? "pending" : "synced"}>
            {unsynced > 0 ? `${unsynced} 个版本待同步` : "认知同步"}
          </strong>
          <button disabled={syncing} onClick={() => void syncCase()}>
            {syncing ? "正在递过去…" : "给盖尔看新增案情"}
          </button>
        </div>
      </header>

      <nav className="casebook-tabs" aria-label="案件视图">
        <button aria-pressed={tab === "entries"} onClick={() => setTab("entries")}>案情记录</button>
        <button aria-pressed={tab === "graph"} onClick={() => setTab("graph")}>结构图</button>
      </nav>

      {tab === "entries" ? (
        <main className="casebook-content">
          <section className="case-entry-composer">
            <textarea
              aria-label="记录一条案情"
              value={entryContent}
              onChange={(event) => {
                const nextContent = event.target.value;
                const detected = detectQuickEntryKind(nextContent);
                setEntryContent(nextContent);
                if (detected) setEntryKind(detected);
              }}
              placeholder={'事实：……\n证词：……\n我注意到：……\n我觉得：……\n问盖尔：……'}
            />
            {detectedEntryKind ? (
              <p className="entry-kind-preview" role="status">
                将保存为「{entryLabels[detectedEntryKind]}」；原文不会改写。
              </p>
            ) : null}
            <div className="case-form-row">
              <select aria-label="案情类型" value={entryKind} onChange={(event) => setEntryKind(event.target.value as CaseEntryKind)}>
                {Object.entries(entryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <input aria-label="来源位置" value={sourcePosition} onChange={(event) => setSourcePosition(event.target.value)} placeholder="章节／场景（可选）" />
            </div>
            <div className="case-action-row">
              <button disabled={busy || !entryContent.trim()} onClick={() => void addEntry(false)}>只保存</button>
              <button className="action-primary" disabled={busy || !entryContent.trim()} onClick={() => void addEntry(true)}>保存并递给盖尔</button>
            </div>
          </section>

          <section className="case-section">
            <div className="section-heading"><h2>我们的记录</h2><span>{bundle.entries.length} 条</span></div>
            <div className="case-entry-list">
              {[...bundle.entries].reverse().map((entry) => (
                <article key={entry.id} className={`case-entry author-${entry.author}`}>
                  <div><strong>{entryLabels[entry.kind]}</strong><span>{authorLabel(entry.author)} · v{entry.createdRevision}</span></div>
                  <p>{entry.content}</p>
                  {entry.sourcePosition ? <small>{entry.sourcePosition}</small> : null}
                </article>
              ))}
            </div>
          </section>

          <section className="case-section hypothesis-section">
            <div className="section-heading"><h2>猜想</h2><span>{bundle.hypotheses.length} 条</span></div>
            <div className="case-inline-form">
              <input value={hypothesis} onChange={(event) => setHypothesis(event.target.value)} placeholder="我现在怀疑……" />
              <button disabled={!hypothesis.trim() || busy} onClick={() => void addHypothesis()}>保存猜想</button>
            </div>
            <div className="hypothesis-list">
              {bundle.hypotheses.map((item) => (
                <article key={item.id} className={`hypothesis-card author-${item.author}`}>
                  <div><strong>{authorLabel(item.author)}</strong><span>{hypothesisStatusLabel(item.status)}</span></div>
                  <p>{item.claim}</p>
                  <div className="compact-actions">
                    {item.status !== "confirmed" ? <button onClick={() => void updateHypothesisStatus(item, "confirmed")}>证实</button> : null}
                    {item.status !== "rejected" ? <button onClick={() => void updateHypothesisStatus(item, "rejected")}>推翻</button> : null}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </main>
      ) : (
        <main className="casebook-content graph-content">
          <section className="graph-toolbar">
            <div className="case-inline-form">
              <input value={entityName} onChange={(event) => setEntityName(event.target.value)} placeholder="新增节点" />
              <select value={entityType} onChange={(event) => setEntityType(event.target.value as CaseEntityType)}>
                {Object.entries(entityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <button disabled={!entityName.trim() || busy} onClick={() => void addEntity()}>添加</button>
            </div>
            {bundle.entities.length >= 2 ? (
              <div className="case-inline-form relation-form">
                <select value={relationSource} onChange={(event) => setRelationSource(event.target.value)}><option value="">起点</option>{bundle.entities.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
                <input value={relationType} onChange={(event) => setRelationType(event.target.value)} placeholder="关系，例如：认识" />
                <select value={relationTarget} onChange={(event) => setRelationTarget(event.target.value)}><option value="">终点</option>{bundle.entities.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
                <button disabled={!relationSource || !relationTarget || !relationType.trim() || busy} onClick={() => void addRelation()}>连线</button>
              </div>
            ) : null}
          </section>

          <section
            ref={graphRef}
            className="case-graph"
            aria-label="案件结构图"
            onPointerMove={moveDrag}
            onPointerUp={() => void endDrag()}
            onPointerCancel={() => setDrag(null)}
          >
            <GraphEdges entities={bundle.entities} relations={bundle.relations} />
            {bundle.entities.map((entity) => {
              const position = entityPosition(entity, bundle.entities);
              return (
                <button
                  key={entity.id}
                  className={`graph-node type-${entity.entityType} status-${entity.status}`}
                  style={{ left: position.x, top: position.y }}
                  onPointerDown={(event) => startDrag(event, entity)}
                  onClick={() => setSelectedEntityId(entity.id)}
                >
                  <small>{entityLabels[entity.entityType]} · {authorLabel(entity.createdBy)}</small>
                  <strong>{entity.name}</strong>
                </button>
              );
            })}
            {bundle.entities.length === 0 ? <p className="graph-empty">先添加一个人物、地点或物件。</p> : null}
          </section>

          {selectedEntity ? (
            <section className="graph-inspector">
              <div><strong>{selectedEntity.name}</strong><span>{entityLabels[selectedEntity.entityType]} · {statusLabel(selectedEntity.status)}</span></div>
              <p>{selectedEntity.description || "暂无补充说明。"}</p>
              <div className="compact-actions">
                {selectedEntity.status !== "confirmed" ? <button onClick={() => void updateEntityStatus(selectedEntity, "confirmed")}>确认节点</button> : null}
                {selectedEntity.status !== "rejected" ? <button onClick={() => void updateEntityStatus(selectedEntity, "rejected")}>驳回节点</button> : null}
              </div>
            </section>
          ) : null}

          <section className="case-section relation-list">
            <div className="section-heading"><h2>关系</h2><span>{bundle.relations.length} 条</span></div>
            {bundle.relations.map((relation) => (
              <article key={relation.id} className={`relation-card status-${relation.status}`}>
                <p><strong>{entityNameById(bundle.entities, relation.sourceEntityId)}</strong> → {relation.relationType} → <strong>{entityNameById(bundle.entities, relation.targetEntityId)}</strong></p>
                <span>{authorLabel(relation.createdBy)} · {statusLabel(relation.status)}</span>
                {relation.status === "suggested" ? (
                  <div className="compact-actions">
                    <button onClick={() => void updateRelationStatus(relation, "confirmed")}>确认</button>
                    <button onClick={() => void updateRelationStatus(relation, "rejected")}>驳回</button>
                  </div>
                ) : null}
              </article>
            ))}
          </section>
        </main>
      )}

      {toast ? <div className="toast" role="status">{toast}</div> : null}
    </div>
  );
}

function CaseCreateForm(props: {
  title: string;
  sourceType: CaseSourceType;
  sourceLabel: string;
  busy: boolean;
  onTitle: (value: string) => void;
  onSourceType: (value: CaseSourceType) => void;
  onSourceLabel: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <section className="case-create-form">
      <label>案件名<input value={props.title} onChange={(event) => props.onTitle(event.target.value)} placeholder="例如：温室失窃案" /></label>
      <label>来源<select value={props.sourceType} onChange={(event) => props.onSourceType(event.target.value as CaseSourceType)}><option value="novel">小说</option><option value="video_game">电子游戏</option><option value="tabletop">桌游</option><option value="other">其他</option></select></label>
      <label>作品或章节<input value={props.sourceLabel} onChange={(event) => props.onSourceLabel(event.target.value)} placeholder="可选" /></label>
      <div className="case-action-row"><button onClick={props.onCancel}>取消</button><button className="action-primary" disabled={props.busy || !props.title.trim()} onClick={props.onSubmit}>建立案件</button></div>
    </section>
  );
}

function GraphEdges({ entities, relations }: { entities: CaseEntity[]; relations: CaseRelation[] }) {
  return (
    <svg className="graph-edges" aria-hidden="true">
      {relations.filter((item) => item.status !== "rejected").map((relation) => {
        const source = entities.find((entity) => entity.id === relation.sourceEntityId);
        const target = entities.find((entity) => entity.id === relation.targetEntityId);
        if (!source || !target) return null;
        const start = entityPosition(source, entities);
        const end = entityPosition(target, entities);
        const x1 = start.x + 68;
        const y1 = start.y + 30;
        const x2 = end.x + 68;
        const y2 = end.y + 30;
        return (
          <g key={relation.id} className={`edge-${relation.status}`}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} />
            <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 6}>{relation.relationType}</text>
          </g>
        );
      })}
    </svg>
  );
}

function entityPosition(entity: CaseEntity, entities: CaseEntity[]) {
  if (entity.x !== undefined && entity.y !== undefined) return { x: entity.x, y: entity.y };
  const index = Math.max(0, entities.findIndex((item) => item.id === entity.id));
  return { x: 24 + (index % 3) * 190, y: 28 + Math.floor(index / 3) * 105 };
}

function entityNameById(entities: CaseEntity[], id: string) {
  return entities.find((item) => item.id === id)?.name ?? "未知节点";
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function authorLabel(author: "tav" | "gale" | "joint") {
  return author === "tav" ? "塔芙" : author === "gale" ? "盖尔" : "共同确认";
}

function sourceTypeLabel(type: CaseSourceType) {
  return type === "novel" ? "小说" : type === "video_game" ? "电子游戏" : type === "tabletop" ? "桌游" : "其他";
}

function statusLabel(status: CaseGraphStatus) {
  return status === "confirmed" ? "已确认" : status === "suggested" ? "待确认" : "已驳回";
}

function hypothesisStatusLabel(status: CaseHypothesis["status"]) {
  return status === "active" ? "仍在考虑" : status === "weakened" ? "被削弱" : status === "confirmed" ? "已证实" : "已推翻";
}
