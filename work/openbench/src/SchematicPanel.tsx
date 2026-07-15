import { useEffect, useMemo, useRef, useState } from 'react';
import ELK from 'elkjs/lib/elk.bundled.js';
import ELKWorker from 'elkjs/lib/elk-worker.min.js?worker';
import { buildModuleGraph } from './netlistGraph.js';
import type { ModuleGraph, SchematicEdge, SchematicNode, YosysNetlist } from './netlistGraph.js';

type NodePort = { name: string; direction: string; width: number };
type LayoutPin = NodePort & { id: string; side: 'WEST' | 'EAST' | 'SOUTH'; x: number; y: number };
type LayoutNode = SchematicNode & { x: number; y: number; layoutWidth: number; layoutHeight: number; pins: LayoutPin[] };
type LayoutEdge = SchematicEdge & { points: Array<{ x: number; y: number }> };
type Layout = { width: number; height: number; nodes: LayoutNode[]; edges: LayoutEdge[]; graph: ModuleGraph };

function cleanNet(value: string | null) {
  return value?.replace(/^\\/, '').replace(/\s*\[[^\]]+\]\s*$/, '').split('.').at(-1) || '';
}

const symbolLabel = (symbol: SchematicNode['symbol']) => ({ port: 'Port', register: 'Register / flip-flop', mux: 'Multiplexer', memory: 'Memory', arithmetic: 'Arithmetic', compare: 'Comparator', logic: 'Logic gate', module: 'Module instance', generic: 'Yosys cell' })[symbol];
const pinId = (nodeId: string, portName: string) => `${nodeId}::${encodeURIComponent(portName)}`;

function nodeMetrics(node: SchematicNode) {
  const ports: NodePort[] = node.kind === 'port' ? [{ name: node.name, direction: node.direction || 'unknown', width: node.width }] : node.ports || [];
  const sideFor = (port: NodePort): 'WEST' | 'EAST' | 'SOUTH' => node.kind === 'port'
    ? (node.direction === 'input' || node.direction === 'inout' ? 'EAST' : 'WEST')
    : (node.symbol === 'mux' && /^(?:S|SEL|SELECT)$/i.test(port.name) ? 'SOUTH' : port.direction === 'output' ? 'EAST' : 'WEST');
  if (node.kind === 'port') {
    const side = sideFor(ports[0]);
    return { width: 150, height: 48, pins: [{ ...ports[0], id: pinId(node.id, ports[0].name), side, x: side === 'WEST' ? -4 : 146, y: 20 }] };
  }
  const left = ports.filter((port) => sideFor(port) === 'WEST');
  const right = ports.filter((port) => sideFor(port) === 'EAST');
  const bottom = ports.filter((port) => sideFor(port) === 'SOUTH');
  const rows = Math.max(left.length, right.length, 1);
  const width = node.symbol === 'module' ? 244 : node.symbol === 'arithmetic' ? 166 : 184;
  const height = Math.max(node.symbol === 'mux' ? 124 : 96, 60 + rows * 20);
  const place = (port: NodePort, index: number, side: 'WEST' | 'EAST'): LayoutPin => ({ ...port, id: pinId(node.id, port.name), side, x: side === 'WEST' ? -4 : width - 4, y: 40 + index * 20 });
  return { width, height, pins: [...left.map((port, index) => place(port, index, 'WEST')), ...right.map((port, index) => place(port, index, 'EAST')), ...bottom.map((port, index) => ({ ...port, id: pinId(node.id, port.name), side: 'SOUTH' as const, x: width / 2 - 4 + index * 14, y: height - 4 }))] };
}

function NodeBody({ node }: { node: LayoutNode }) {
  const { layoutWidth: width, layoutHeight: height, symbol } = node;
  return <g className={`node-body ${symbol}`}><title>{symbolLabel(symbol)} · {node.type}</title>
    {symbol === 'mux' ? <path className="block-surface" d={`M12 24 L${width - 12} 10 L${width - 12} ${height - 10} L12 ${height - 24} Z`} /> :
      symbol === 'logic' ? <path className="block-surface" d={`M10 12 H${width * .42} C${width * .82} 12 ${width - 8} ${height / 2 - 18} ${width - 8} ${height / 2} C${width - 8} ${height / 2 + 18} ${width * .82} ${height - 12} ${width * .42} ${height - 12} H10 C${width * .25} ${height * .72} ${width * .25} ${height * .28} 10 12 Z`} /> :
      symbol === 'arithmetic' ? <ellipse className="block-surface" cx={width / 2} cy={height / 2} rx={width / 2 - 8} ry={height / 2 - 8} /> :
      symbol === 'port' ? <path className="block-surface" d={node.direction === 'output' ? `M14 5 H${width - 18} L${width - 4} ${height / 2} L${width - 18} ${height - 5} H14 Z` : `M4 ${height / 2} L20 5 H${width - 14} V${height - 5} H20 Z`} /> :
      <rect className="block-surface" x="4" y="4" width={width - 8} height={height - 8} rx={symbol === 'module' ? 3 : 8} />}
    {symbol === 'register' && <><path className="block-detail" d={`M4 ${height - 29} L14 ${height - 21} L4 ${height - 13}`} /><text className="block-letter" x={width / 2} y={height / 2 + 7}>DFF</text></>}
    {symbol === 'mux' && <text className="block-letter" x={width / 2} y={height / 2 + 7}>MUX</text>}
    {symbol === 'arithmetic' && <text className="block-letter" x={width / 2} y={height / 2 + 9}>Σ</text>}
    {symbol === 'compare' && <text className="block-letter" x={width / 2} y={height / 2 + 9}>=</text>}
    {symbol === 'memory' && <path className="block-detail" d={`M18 34 H${width - 18} M18 50 H${width - 18} M18 66 H${width - 18}`} />}
  </g>;
}

function PinLabels({ node }: { node: LayoutNode }) {
  if (node.kind === 'port') return null;
  return <>{node.pins.map((pin) => {
    const west = pin.side === 'WEST';
    const south = pin.side === 'SOUTH';
    const cy = pin.y + 4;
    const label = `${pin.name}${pin.width > 1 ? ` [${pin.width}]` : ''}`;
    return south ? <g key={pin.id} className={`node-pin ${pin.direction} control`}>
      <circle cx={pin.x + 4} cy={node.layoutHeight} r="4" />
      <line x1={pin.x + 4} x2={pin.x + 4} y1={node.layoutHeight - 12} y2={node.layoutHeight} />
      <text x={pin.x + 4} y={node.layoutHeight - 16} textAnchor="middle">{label}</text>
    </g> : <g key={pin.id} className={`node-pin ${pin.direction}`}>
      <circle cx={west ? 0 : node.layoutWidth} cy={cy} r="4" />
      <line x1={west ? 0 : node.layoutWidth - 12} x2={west ? 12 : node.layoutWidth} y1={cy} y2={cy} />
      <text x={west ? 16 : node.layoutWidth - 16} y={cy + 4} textAnchor={west ? 'start' : 'end'}>{label}</text>
    </g>;
  })}</>;
}

export default function SchematicPanel({ netlist, top, probeNet, onNetProbe, onNavigateSource, onGenerateTestbench }: {
  netlist: YosysNetlist | null;
  top: string | null;
  probeNet: string | null;
  onNetProbe: (netName: string) => void;
  onNavigateSource: (source: string) => void;
  onGenerateTestbench: (moduleName: string) => void;
}) {
  const [moduleName, setModuleName] = useState(top || '');
  const [layout, setLayout] = useState<Layout | null>(null);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedNet, setSelectedNet] = useState<string | null>(probeNet);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const elk = useMemo(() => new ELK({ workerFactory: () => new ELKWorker() }), []);

  useEffect(() => { if (top) setModuleName(top); }, [top]);
  useEffect(() => { if (probeNet) setSelectedNet(probeNet); }, [probeNet]);

  useEffect(() => {
    if (!netlist || !moduleName) { setLayout(null); return; }
    let cancelled = false;
    setLayoutError(null);
    const graph = buildModuleGraph(netlist, moduleName);
    const metrics = new Map(graph.nodes.map((node) => [node.id, nodeMetrics(node)]));
    const endpoint = (nodeId: string, portName: string) => metrics.get(nodeId)?.pins.find((pin) => pin.name === portName)?.id || nodeId;
    const input = {
      id: 'root',
      layoutOptions: {
        'elk.algorithm': 'layered', 'elk.direction': 'RIGHT', 'elk.edgeRouting': 'ORTHOGONAL',
        'elk.spacing.nodeNode': '58', 'elk.layered.spacing.nodeNodeBetweenLayers': '105',
        'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
        'elk.padding': '[top=52,left=52,bottom=52,right=52]',
      },
      children: graph.nodes.map((node) => {
        const metric = metrics.get(node.id)!;
        return { id: node.id, width: metric.width, height: metric.height, layoutOptions: { 'elk.portConstraints': 'FIXED_POS' }, ports: metric.pins.map((pin) => ({ id: pin.id, width: 8, height: 8, x: pin.x, y: pin.y, layoutOptions: { 'elk.port.side': pin.side } })) };
      }),
      edges: graph.edges.map((edge) => ({ id: edge.id, sources: [endpoint(edge.source, edge.sourcePort)], targets: [endpoint(edge.target, edge.targetPort)] })),
    };
    void elk.layout(input).then((result: any) => {
      if (cancelled) return;
      const nodeLayouts = new Map((result.children || []).map((node: any) => [node.id, node]));
      const edgeLayouts = new Map((result.edges || []).map((edge: any) => [edge.id, edge]));
      setLayout({
        width: Math.max(400, result.width || 400), height: Math.max(260, result.height || 260), graph,
        nodes: graph.nodes.map((node) => { const placed: any = nodeLayouts.get(node.id) || {}; const metric = metrics.get(node.id)!; return { ...node, x: placed.x || 0, y: placed.y || 0, layoutWidth: metric.width, layoutHeight: metric.height, pins: metric.pins }; }),
        edges: graph.edges.map((edge) => { const placed: any = edgeLayouts.get(edge.id); const section = placed?.sections?.[0]; return { ...edge, points: section ? [section.startPoint, ...(section.bendPoints || []), section.endPoint] : [] }; }),
      });
      setScale(1); setPan({ x: 0, y: 0 });
    }).catch((error: unknown) => { if (!cancelled) setLayoutError(error instanceof Error ? error.message : String(error)); });
    return () => { cancelled = true; };
  }, [elk, moduleName, netlist]);

  if (!netlist || !top) return <div className="schematic-empty"><div className="chip">JSON</div><h1>No RTL netlist loaded</h1><p>Run RTL Analysis to elaborate the design with Yosys.</p></div>;

  const modules = Object.keys(netlist.modules || {});
  const selectedClean = cleanNet(selectedNet);
  return <div className="schematic-panel">
    <div className="schematic-toolbar">
      <strong>Module</strong><select value={moduleName} onChange={(event) => setModuleName(event.target.value)}>{modules.map((module) => <option key={module}>{module}</option>)}</select>
      <span>{layout ? `${layout.nodes.length} blocks · ${layout.edges.length} nets` : 'Running ELK layout…'}</span>
      {selectedNet && <code title={selectedNet}>net: {selectedNet}</code>}
      <button onClick={() => setScale((value) => Math.min(4, value * 1.25))}>Zoom +</button><button onClick={() => setScale((value) => Math.max(.3, value / 1.25))}>Zoom −</button><button onClick={() => { setScale(1); setPan({ x: 0, y: 0 }); }}>Fit</button>
      <button data-testid="starter-testbench" className="starter-testbench" title="Create an editable beginner testbench from these real Yosys ports" onClick={() => onGenerateTestbench(moduleName)}>Starter Testbench</button>
    </div>
    <div className="schematic-legend"><span><i className="legend-icon register">D</i>Register</span><span><i className="legend-icon mux">M</i>Mux</span><span><i className="legend-icon logic">∿</i>Logic</span><span><i className="legend-icon arithmetic">Σ</i>Arithmetic</span><span><i className="legend-icon module">□</i>Module</span><small>Wires terminate on labeled inputs and outputs.</small></div>
    <div className="schematic-stage">
      {!layout ? <div className={`layout-progress ${layoutError ? 'error' : ''}`}>{layoutError ? `ELK layout failed: ${layoutError}` : 'ELK is laying out the elaborated netlist…'}</div> : <svg viewBox={`0 0 ${layout.width} ${layout.height}`} onWheel={(event) => { event.preventDefault(); setScale((value) => Math.max(.3, Math.min(4, value * Math.exp(-event.deltaY * .001)))); }} onPointerDown={(event) => { if (event.target === event.currentTarget) { event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y }; } }} onPointerMove={(event) => { if (drag.current) setPan({ x: drag.current.panX + event.clientX - drag.current.x, y: drag.current.panY + event.clientY - drag.current.y }); }} onPointerUp={() => { drag.current = null; }}>
        <defs><marker id="rtl-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" /></marker></defs>
        <g transform={`translate(${pan.x} ${pan.y}) scale(${scale})`}>
          {layout.edges.map((edge) => {
            const active = selectedClean && cleanNet(edge.netName) === selectedClean;
            const pathData = edge.points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
            const middle = edge.points[Math.floor(edge.points.length / 2)];
            return <g key={edge.id} className={`schematic-edge ${active ? 'active' : ''}`} onClick={(event) => { event.stopPropagation(); setSelectedNet(edge.netName); onNetProbe(edge.netName); }}><path d={pathData} markerEnd="url(#rtl-arrow)" />{middle && <text x={middle.x + 4} y={middle.y - 7}>{edge.netName}{edge.bits.length > 1 ? ` [${edge.bits.length}]` : ''}</text>}</g>;
          })}
          {layout.nodes.map((node) => {
            const selected = selectedNode === node.id;
            return <g key={node.id} className={`schematic-node ${node.kind} symbol-${node.symbol} ${selected ? 'selected' : ''}`} transform={`translate(${node.x} ${node.y})`} onClick={(event) => { event.stopPropagation(); setSelectedNode(node.id); if (node.source) onNavigateSource(node.source); }}>
              <NodeBody node={node} />
              {node.kind === 'port' ? <><text className="port-name" x={node.layoutWidth / 2} y="22" textAnchor="middle">{node.name}{node.width > 1 ? ` [${node.width}]` : ''}</text><text className="port-direction" x={node.layoutWidth / 2} y="37" textAnchor="middle">{node.direction}</text></> : <><text className="node-name" x={node.layoutWidth / 2} y="20" textAnchor="middle">{node.name.length > 22 ? `${node.name.slice(0, 21)}…` : node.name}</text><text className="node-type" x={node.layoutWidth / 2} y={node.symbol === 'mux' ? 35 : node.layoutHeight - 12} textAnchor="middle">{symbolLabel(node.symbol)} · {node.type}</text><PinLabels node={node} /></>}
              {node.moduleRef && <g className="drill-module" onClick={(event) => { event.stopPropagation(); setModuleName(node.moduleRef!); }}><rect x={node.layoutWidth - 54} y="9" width="45" height="17" rx="4" /><text x={node.layoutWidth - 48} y="21">OPEN</text></g>}
            </g>;
          })}
        </g>
      </svg>}
    </div>
  </div>;
}
