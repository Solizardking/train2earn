import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Html, Line, OrbitControls, Stars } from "@react-three/drei";
import {
  Activity,
  Box,
  CloudUpload,
  Database,
  ExternalLink,
  FileJson,
  FolderTree,
  GitBranch,
  Orbit,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

const STAGE_META = [
  { id: "corpus", label: "Corpus", color: "#66d9ef", icon: Database },
  { id: "manifests", label: "Manifests", color: "#efc86a", icon: GitBranch },
  { id: "sft", label: "SFT", color: "#20d98b", icon: Activity },
  { id: "preference", label: "Preference", color: "#ef6f82", icon: ShieldCheck },
  { id: "eval", label: "Eval", color: "#b69cf6", icon: Orbit },
  { id: "reports", label: "Reports", color: "#78a7ff", icon: FileJson },
  { id: "source_notes", label: "Source Notes", color: "#f3a95f", icon: FolderTree },
];

const FALLBACK_STAGES = STAGE_META.map((stage, index) => ({
  ...stage,
  expectedFiles: index === 0 ? 3 : 1,
  presentFiles: 0,
  rows: 0,
  bytes: 0,
  status: "planned",
  summary: "Expected training-data output.",
}));

function formatNumber(value = 0) {
  return Number(value || 0).toLocaleString();
}

function formatBytes(value = 0) {
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size >= 10 || unit === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unit]}`;
}

function dataText(file) {
  if (!file) return "";
  return [
    file.path,
    file.rootLabel,
    file.kind,
    file.summary,
    file.title,
    ...(file.sampleKeys || []),
    ...(file.yamlKeys || []),
    ...(file.jsonKeys || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function previewPayload(file) {
  if (file?.samples) return JSON.stringify(file.samples, null, 2);
  if (file?.jsonPreview) return JSON.stringify(file.jsonPreview, null, 2);
  return file?.preview || file?.excerpt || "";
}

function stagePositions(stages) {
  return stages.map((stage, index) => {
    const angle = (index / stages.length) * Math.PI * 2 - Math.PI / 2;
    const radius = 2.7 + (index % 2) * 0.32;
    const y = ((index % 3) - 1) * 0.5;
    return {
      ...stage,
      position: [Math.cos(angle) * radius, y, Math.sin(angle) * radius],
    };
  });
}

function buildStages(data) {
  const sourceStages = data?.trainingData?.stages?.length ? data.trainingData.stages : FALLBACK_STAGES;
  return stagePositions(
    STAGE_META.map((meta) => ({
      ...meta,
      ...(sourceStages.find((stage) => stage.id === meta.id) || {}),
      color: meta.color,
    }))
  );
}

function DataNode({ stage, active, onSelect }) {
  const mesh = useRef(null);
  const Icon = stage.icon || Box;

  useFrame((state) => {
    if (!mesh.current) return;
    mesh.current.rotation.y += active ? 0.012 : 0.005;
    mesh.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.8 + stage.position[0]) * 0.12;
  });

  const scale = active ? 1.18 : 1;
  const rows = stage.rows || stage.presentRows || 0;

  return (
    <Float speed={1.4} rotationIntensity={0.18} floatIntensity={0.22}>
      <group position={stage.position}>
        <mesh
          ref={mesh}
          scale={scale}
          onClick={(event) => {
            event.stopPropagation();
            onSelect(stage.id);
          }}
          onPointerOver={() => {
            document.body.style.cursor = "pointer";
          }}
          onPointerOut={() => {
            document.body.style.cursor = "";
          }}
        >
          <icosahedronGeometry args={[0.42 + Math.min(rows / 1200, 0.28), 2]} />
          <meshStandardMaterial
            color={stage.color}
            emissive={stage.color}
            emissiveIntensity={active ? 0.8 : 0.38}
            metalness={0.35}
            roughness={0.34}
          />
        </mesh>
        <mesh scale={active ? 1.18 : 0.95}>
          <torusGeometry args={[0.62, 0.012, 12, 56]} />
          <meshBasicMaterial color={stage.color} transparent opacity={active ? 0.9 : 0.38} />
        </mesh>
        <Html center distanceFactor={7.5} position={[0, -0.82, 0]} transform>
          <button
            className={`scene-label ${active ? "active" : ""}`}
            style={{ "--stage-color": stage.color }}
            type="button"
            onClick={() => onSelect(stage.id)}
          >
            <Icon size={14} aria-hidden="true" />
            <span>{stage.label}</span>
          </button>
        </Html>
      </group>
    </Float>
  );
}

function DataOrbit({ stages, activeStage, onSelect }) {
  const points = stages.map((stage) => stage.position);
  return (
    <Canvas camera={{ position: [0, 2.5, 7.6], fov: 47 }} dpr={[1, 1.75]}>
      <color attach="background" args={["#071013"]} />
      <ambientLight intensity={0.45} />
      <pointLight color="#66d9ef" intensity={12} position={[-3, 4, 4]} />
      <pointLight color="#efc86a" intensity={9} position={[4, -2, 3]} />
      <Stars radius={18} depth={12} count={700} factor={2.6} saturation={0.4} fade speed={0.35} />
      <group rotation={[0.08, 0.12, 0]}>
        <Line points={[...points, points[0]]} color="#7ee8d5" lineWidth={1.2} transparent opacity={0.48} />
        <mesh>
          <octahedronGeometry args={[0.82, 1]} />
          <meshStandardMaterial color="#e9f3f8" emissive="#66d9ef" emissiveIntensity={0.28} metalness={0.22} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1.25, 0.01, 16, 96]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.28} />
        </mesh>
        {stages.map((stage) => (
          <DataNode key={stage.id} stage={stage} active={activeStage === stage.id} onSelect={onSelect} />
        ))}
      </group>
      <gridHelper args={[11, 22, "#304451", "#142129"]} position={[0, -2.1, 0]} />
      <OrbitControls enablePan={false} enableZoom={false} autoRotate autoRotateSpeed={0.45} />
    </Canvas>
  );
}

function MetricCard({ label, value, icon: Icon = Activity }) {
  return (
    <article className="metric-card">
      <Icon size={18} aria-hidden="true" />
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function Tag({ children, tone = "" }) {
  if (!children) return null;
  return <span className={`tag ${tone}`}>{children}</span>;
}

function SectionHead({ eyebrow, title, count }) {
  return (
    <div className="section-head">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      <strong>{count}</strong>
    </div>
  );
}

function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [rootFilter, setRootFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState("all");
  const [activeStage, setActiveStage] = useState("corpus");

  useEffect(() => {
    const dataUrl = `${import.meta.env.BASE_URL}site-data.json`;
    fetch(dataUrl, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status} loading ${dataUrl}`);
        return response.json();
      })
      .then(setData)
      .catch(setError);
  }, []);

  const stages = useMemo(() => buildStages(data), [data]);
  const activeStageData = stages.find((stage) => stage.id === activeStage) || stages[0];

  const files = data?.files || [];
  const roots = data?.roots || [];
  const totals = data?.totals || {};
  const trainingData = data?.trainingData || {};
  const buildStats = trainingData.buildStats || {};
  const wandb = data?.wandb || {};
  const baseUrl = import.meta.env.BASE_URL;

  const kinds = useMemo(() => [...new Set(files.map((file) => file.kind))].sort(), [files]);

  const filteredFiles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return files.filter((file) => {
      const rootOk = rootFilter === "all" || file.rootId === rootFilter;
      const kindOk = kindFilter === "all" || file.kind === kindFilter;
      const queryOk = !normalizedQuery || dataText(file).includes(normalizedQuery);
      return rootOk && kindOk && queryOk;
    });
  }, [files, kindFilter, query, rootFilter]);

  const datasetFiles = filteredFiles.filter((file) => file.kind === "jsonl" || /dataset|manifest|quality_report/i.test(file.path));
  const docFiles = filteredFiles.filter((file) => file.kind === "markdown");
  const previewFiles = filteredFiles.filter((file) => previewPayload(file)).slice(0, 12);

  if (error) {
    return (
      <main className="load-failure">
        <h1>Nemo Clawd Training Data</h1>
        <p>{error.message}</p>
        <code>node tools/build-static-site.mjs</code>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="loading-screen">
        <div className="loading-mark" />
        <p>Loading training index</p>
      </main>
    );
  }

  const heroStats = [
    ["PDF chunks", buildStats.pdfChunks],
    ["Repo chunks", buildStats.repoChunks],
    ["SFT rows", buildStats.sftRows],
    ["Eval rows", buildStats.evalRows],
  ];

  const wandbUrl =
    wandb.dashboardUrl || (wandb.entity ? `https://wandb.ai/${wandb.entity}/${wandb.project}` : "https://wandb.ai");

  return (
    <>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Nemo Clawd Training Data">
          <span className="brand-mark">NEMO</span>
          <span>
            <strong>Training Data</strong>
            <small>React Three Fiber debut</small>
          </span>
        </a>
        <nav className="nav-links" aria-label="Page navigation">
          <a href="#pipeline">Pipeline</a>
          <a href="#inventory">Inventory</a>
          <a href="#wandb">W&B</a>
          <a href={`${baseUrl}site-data.json`}>JSON</a>
        </nav>
      </header>

      <main id="top">
        <section className="hero">
          <div className="scene-fill" aria-hidden="true">
            <DataOrbit stages={stages} activeStage={activeStage} onSelect={setActiveStage} />
          </div>

          <div className="hero-copy">
            <p className="eyebrow">Generated at {data.generatedAt ? new Date(data.generatedAt).toLocaleString() : "local"}</p>
            <h1>Nemo Clawd Training Data</h1>
            <p className="lede">{trainingData.summary || "Source-grounded training corpus, eval prompts, preferences, manifests, reports, and source notes."}</p>
            <div className="hero-actions">
              <a className="icon-button primary" href="#inventory">
                <Search size={16} aria-hidden="true" />
                Inventory
              </a>
              <a className="icon-button" href="#wandb">
                <CloudUpload size={16} aria-hidden="true" />
                W&B
              </a>
              <a className="icon-button" href={`${baseUrl}site-data.json`}>
                <FileJson size={16} aria-hidden="true" />
                JSON
              </a>
            </div>
            <dl className="hero-stat-row">
              {heroStats.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{formatNumber(value)}</dd>
                </div>
              ))}
            </dl>
          </div>

          <aside className="stage-readout">
            <p className="eyebrow">Selected Stage</p>
            <h2>{activeStageData.label}</h2>
            <p>{activeStageData.summary}</p>
            <div className="tag-row">
              <Tag tone="cyan">{formatNumber(activeStageData.presentFiles)} present</Tag>
              <Tag tone="gold">{formatNumber(activeStageData.expectedFiles)} expected</Tag>
              <Tag tone="green">{formatNumber(activeStageData.rows)} rows</Tag>
              <Tag>{formatBytes(activeStageData.bytes)}</Tag>
            </div>
          </aside>
        </section>

        <section className="metrics-grid" aria-label="Workspace metrics">
          <MetricCard label="Training roots" value={formatNumber(trainingData.directories?.length || stages.length)} icon={FolderTree} />
          <MetricCard label="Included files" value={formatNumber(totals.files)} icon={FileJson} />
          <MetricCard label="Included size" value={formatBytes(totals.bytes)} icon={Database} />
          <MetricCard label="JSONL rows" value={formatNumber(totals.jsonlRows)} icon={Activity} />
          <MetricCard label="Docs" value={formatNumber(totals.docs)} icon={FileJson} />
          <MetricCard label="Skipped cache" value={formatBytes(totals.skippedBytes)} icon={ShieldCheck} />
        </section>

        <section id="pipeline" className="page-band">
          <SectionHead eyebrow="Training Data" title="Pipeline Orbit" count={`${formatNumber(stages.length)} stages`} />
          <div className="stage-grid">
            {stages.map((stage) => {
              const Icon = stage.icon || Box;
              return (
                <button
                  key={stage.id}
                  className={`stage-card ${activeStage === stage.id ? "active" : ""}`}
                  style={{ "--stage-color": stage.color }}
                  type="button"
                  onClick={() => setActiveStage(stage.id)}
                >
                  <span className="stage-icon">
                    <Icon size={18} aria-hidden="true" />
                  </span>
                  <span>
                    <strong>{stage.label}</strong>
                    <small>{stage.path || `training-data/${stage.id}`}</small>
                  </span>
                  <span className="stage-count">{formatNumber(stage.rows || stage.presentFiles || 0)}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section id="inventory" className="inventory-layout">
          <aside className="rail" aria-label="Workspace roots">
            <SectionHead eyebrow="Roots" title="Included Areas" count={formatNumber(roots.length)} />
            <div className="root-rail">
              <button className={`root-button ${rootFilter === "all" ? "active" : ""}`} type="button" onClick={() => setRootFilter("all")}>
                <strong>All roots</strong>
                <small>{formatNumber(files.length)} files</small>
              </button>
              {roots.map((root) => (
                <button
                  key={root.id}
                  className={`root-button ${rootFilter === root.id ? "active" : ""}`}
                  type="button"
                  onClick={() => setRootFilter(root.id)}
                >
                  <strong>{root.label}</strong>
                  <small>
                    {root.path} | {formatNumber(root.files)} files | {formatBytes(root.bytes)}
                  </small>
                </button>
              ))}
            </div>
            <p className="policy-note">{data.policy?.note}</p>
          </aside>

          <div className="main-stack">
            <section className="control-strip" aria-label="Inventory filters">
              <label className="field search-field">
                <span>Search</span>
                <div className="input-shell">
                  <Search size={16} aria-hidden="true" />
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Path, root, dataset, config"
                    autoComplete="off"
                  />
                </div>
              </label>
              <label className="field">
                <span>Root</span>
                <select value={rootFilter} onChange={(event) => setRootFilter(event.target.value)}>
                  <option value="all">All roots</option>
                  {roots.map((root) => (
                    <option key={root.id} value={root.id}>
                      {root.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Kind</span>
                <select value={kindFilter} onChange={(event) => setKindFilter(event.target.value)}>
                  <option value="all">All kinds</option>
                  {kinds.map((kind) => (
                    <option key={kind} value={kind}>
                      {kind}
                    </option>
                  ))}
                </select>
              </label>
            </section>

            <section className="page-band">
              <SectionHead eyebrow="Datasets" title="Corpora And Manifests" count={formatNumber(datasetFiles.length)} />
              <div className="dataset-grid">
                {datasetFiles.slice(0, 18).map((file) => (
                  <article className="dataset-card" key={file.id}>
                    <span className="path-label">{file.path}</span>
                    <h3>{file.title || file.name}</h3>
                    <div className="tag-row">
                      <Tag tone="green">{file.kind}</Tag>
                      <Tag tone="cyan">{file.rows ? `${formatNumber(file.rows)} rows` : `${formatNumber(file.lines)} lines`}</Tag>
                      <Tag>{formatBytes(file.bytes)}</Tag>
                    </div>
                    <p>{file.summary || file.excerpt}</p>
                  </article>
                ))}
                {!datasetFiles.length && <p className="empty">No matching dataset entries.</p>}
              </div>
            </section>

            <section className="page-band">
              <SectionHead eyebrow="Docs" title="Cards, Notes, And Reports" count={formatNumber(docFiles.length)} />
              <div className="doc-list">
                {docFiles.slice(0, 14).map((file) => (
                  <article className="doc-item" key={file.id}>
                    <span className="path-label">{file.path}</span>
                    <h3>{file.title || file.name}</h3>
                    <p>{file.excerpt || file.summary}</p>
                  </article>
                ))}
                {!docFiles.length && <p className="empty">No matching docs.</p>}
              </div>
            </section>

            <section className="page-band">
              <SectionHead eyebrow="Files" title="Static Inventory" count={formatNumber(filteredFiles.length)} />
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Path</th>
                      <th>Root</th>
                      <th>Kind</th>
                      <th>Rows</th>
                      <th>Size</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFiles.slice(0, 260).map((file) => (
                      <tr key={file.id}>
                        <td>{file.path}</td>
                        <td>{file.rootLabel}</td>
                        <td>
                          <span className="file-kind">{file.kind}</span>
                        </td>
                        <td>{file.rows ? formatNumber(file.rows) : file.lines ? formatNumber(file.lines) : "-"}</td>
                        <td>{formatBytes(file.bytes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="page-band">
              <SectionHead eyebrow="Previews" title="Redacted Samples" count={formatNumber(previewFiles.length)} />
              <div className="preview-list">
                {previewFiles.map((file) => (
                  <article className="preview-item" key={file.id}>
                    <span className="path-label">{file.path}</span>
                    <h3>{file.title || file.name}</h3>
                    <pre>{previewPayload(file)}</pre>
                  </article>
                ))}
                {!previewFiles.length && <p className="empty">No matching previews.</p>}
              </div>
            </section>

            <section id="wandb" className="wandb-band">
              <div>
                <p className="eyebrow">Weights & Biases</p>
                <h2>{wandb.project || "nemo-clawd-training-data"}</h2>
                <p className="lede small">
                  {wandb.hasApiKey ? "Local W&B API key detected during export." : "W&B sync is ready for a local authenticated run."}
                </p>
              </div>
              <div className="wandb-grid">
                <article className="wandb-cell">
                  <span>Entity</span>
                  <strong>{wandb.entity || "default"}</strong>
                </article>
                <article className="wandb-cell">
                  <span>Artifact</span>
                  <strong>{wandb.artifactName || "nemo-clawd-training-data"}</strong>
                </article>
                <article className="wandb-cell">
                  <span>Mode</span>
                  <strong>{wandb.mode || "online"}</strong>
                </article>
              </div>
              <code className="command-line">{wandb.syncCommand}</code>
              <div className="hero-actions">
                <a className="icon-button primary" href={wandbUrl} target="_blank" rel="noreferrer">
                  <ExternalLink size={16} aria-hidden="true" />
                  Open W&B
                </a>
                <a className="icon-button" href={`${baseUrl}site-data.json`}>
                  <FileJson size={16} aria-hidden="true" />
                  Data JSON
                </a>
              </div>
            </section>
          </div>
        </section>
      </main>
    </>
  );
}

export default App;
