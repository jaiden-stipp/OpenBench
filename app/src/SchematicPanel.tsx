import { useEffect, useMemo, useRef, useState } from 'react';
import ELK from 'elkjs/lib/elk.bundled.js';
import ELKWorker from 'elkjs/lib/elk-worker.min.js?worker';
import { buildModuleGraph } from './netlistGraph.js';
import type { ModuleGraph, SchematicEdge, SchematicNode, YosysNetlist } from './netlistGraph.js';

type NodePort = { name: string; direction: string; width: number };
type LayoutPin = NodePort & { id: string; side: 'WEST' | 'EAST' | 'SOUTH'; x: number; y: number };
type LayoutNode = SchematicNode & {
  x: number;
  y: number;
  layoutWidth: number;
  layoutHeight: number;
  pins: LayoutPin[];
};
type LayoutEdge = SchematicEdge & { points: Array<{ x: number; y: number }> };
type Layout = {
  width: number;
  height: number;
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  graph: ModuleGraph;
};
type ElkPoint = { x: number; y: number };
type ElkPlacedNode = { id: string; x?: number; y?: number };
type ElkPlacedEdge = {
  id: string;
  sections?: Array<{ startPoint: ElkPoint; bendPoints?: ElkPoint[]; endPoint: ElkPoint }>;
};
type ElkLayoutResult = {
  width?: number;
  height?: number;
  children?: ElkPlacedNode[];
  edges?: ElkPlacedEdge[];
};

function cleanNet(value: string | null) {
  return (
    value
      ?.replace(/^\\/, '')
      .replace(/\s*\[[^\]]+\]\s*$/, '')
      .split('.')
      .at(-1) || ''
  );
}

const symbolLabel = (symbol: SchematicNode['symbol']) =>
  ({
    port: 'Port',
    register: 'Register / flip-flop',
    mux: 'Multiplexer',
    memory: 'Memory',
    arithmetic: 'Arithmetic',
    compare: 'Comparator',
    logic: 'Logic gate',
    module: 'Module instance',
    generic: 'Yosys cell',
  })[symbol];
const pinId = (nodeId: string, portName: string) => `${nodeId}::${encodeURIComponent(portName)}`;

function friendlyNetLabel(value: string) {
  const clean =
    value
      .replace(/^\\/, '')
      .replace(/\s*\[[^\]]+\]\s*$/, '')
      .split('.')
      .at(-1) || '';
  if (!clean || clean.startsWith('$') || /^(?:sv|v|vh):\d/i.test(clean) || /^bit \d+$/i.test(clean))
    return 'internal connection';
  return clean.length > 24 ? `${clean.slice(0, 23)}…` : clean;
}

function friendlyPinLabel(node: LayoutNode, pin: LayoutPin) {
  const name = pin.name.toUpperCase();
  if (['logic', 'mux', 'arithmetic', 'compare'].includes(node.symbol)) {
    return name === 'S' || name === 'SEL' || name === 'SELECT' ? 'SEL' : name;
  }
  if (node.symbol === 'register')
    return (
      (
        {
          D: 'data',
          Q: 'output',
          CLK: 'clock',
          C: 'clock',
          ARST: 'reset',
          SRST: 'reset',
          RST: 'reset',
          EN: 'enable',
          CE: 'enable',
        } as Record<string, string>
      )[name] || pin.name
    );
  return pin.direction === 'output' && name === 'Y' ? 'output' : pin.name;
}

function nodeMetrics(node: SchematicNode) {
  const ports: NodePort[] =
    node.kind === 'port'
      ? [{ name: node.name, direction: node.direction || 'unknown', width: node.width }]
      : node.ports || [];
  const sideFor = (port: NodePort): 'WEST' | 'EAST' | 'SOUTH' =>
    node.kind === 'port'
      ? node.direction === 'input' || node.direction === 'inout'
        ? 'EAST'
        : 'WEST'
      : node.symbol === 'mux' && /^(?:S|SEL|SELECT)$/i.test(port.name)
        ? 'SOUTH'
        : port.direction === 'output'
          ? 'EAST'
          : 'WEST';
  if (node.kind === 'port') {
    const side = sideFor(ports[0]);
    return {
      width: 128,
      height: 42,
      pins: [
        {
          ...ports[0],
          id: pinId(node.id, ports[0].name),
          side,
          x: side === 'WEST' ? -4 : 124,
          y: 17,
        },
      ],
    };
  }
  const left = ports.filter((port) => sideFor(port) === 'WEST');
  const right = ports.filter((port) => sideFor(port) === 'EAST');
  const bottom = ports.filter((port) => sideFor(port) === 'SOUTH');
  const rows = Math.max(left.length, right.length, 1);
  const dimensionsBySymbol = {
    module: { width: 208, baseHeight: 76, startY: 34, pitch: 18 },
    register: { width: 132, baseHeight: 78, startY: 32, pitch: 17 },
    mux: { width: 94, baseHeight: 68, startY: 25, pitch: 16 },
    logic: { width: 82, baseHeight: 54, startY: 23, pitch: 15 },
    arithmetic: { width: 102, baseHeight: 62, startY: 25, pitch: 16 },
    compare: { width: 88, baseHeight: 56, startY: 24, pitch: 15 },
    memory: { width: 148, baseHeight: 84, startY: 32, pitch: 17 },
    generic: { width: 112, baseHeight: 62, startY: 25, pitch: 16 },
  } as const;
  const dimensions =
    dimensionsBySymbol[node.symbol === 'port' ? 'generic' : node.symbol] ||
    dimensionsBySymbol.generic;
  const width = dimensions.width;
  const height = Math.max(
    dimensions.baseHeight,
    dimensions.startY + Math.max(0, rows - 1) * dimensions.pitch + 25,
  );
  const place = (port: NodePort, index: number, side: 'WEST' | 'EAST'): LayoutPin => ({
    ...port,
    id: pinId(node.id, port.name),
    side,
    x: side === 'WEST' ? -4 : width - 4,
    y: dimensions.startY + index * dimensions.pitch,
  });
  return {
    width,
    height,
    pins: [
      ...left.map((port, index) => place(port, index, 'WEST')),
      ...right.map((port, index) => place(port, index, 'EAST')),
      ...bottom.map((port, index) => ({
        ...port,
        id: pinId(node.id, port.name),
        side: 'SOUTH' as const,
        x: width / 2 - 4 + index * 14,
        y: height - 4,
      })),
    ],
  };
}

function NodeBody({ node }: { node: LayoutNode }) {
  const { layoutWidth: width, layoutHeight: height, symbol } = node;
  const operation = node.type.replace(/^\$/, '').toLowerCase();
  const isNot = symbol === 'logic' && /(?:^|_)not$|logic_not/.test(operation);
  const isAnd = symbol === 'logic' && /and/.test(operation);
  const logicOperation = isNot
    ? 'NOT'
    : operation.includes('xnor')
      ? 'XNOR'
      : operation.includes('xor')
        ? 'XOR'
        : operation.includes('nand')
          ? 'NAND'
          : operation.includes('and')
            ? 'AND'
            : operation.includes('nor')
              ? 'NOR'
              : operation.includes('or')
                ? 'OR'
                : '';
  return (
    <g className={`node-body ${symbol}`}>
      <title>
        {symbolLabel(symbol)} · {node.type}
      </title>
      {symbol === 'mux' ? (
        <path
          className="block-surface"
          d={`M12 10 L${width - 12} 24 L${width - 12} ${height - 24} L12 ${height - 10} Z`}
        />
      ) : isNot ? (
        <path
          className="block-surface"
          d={`M16 12 L${width - 16} ${height / 2} L16 ${height - 12} Z`}
        />
      ) : isAnd ? (
        <path
          className="block-surface"
          d={`M12 12 H${width * 0.48} C${width * 0.78} 12 ${width - 8} ${height * 0.28} ${width - 8} ${height / 2} C${width - 8} ${height * 0.72} ${width * 0.78} ${height - 12} ${width * 0.48} ${height - 12} H12 Z`}
        />
      ) : symbol === 'logic' ? (
        <path
          className="block-surface"
          d={`M12 12 H${width * 0.42} C${width * 0.76} 12 ${width - 8} ${height * 0.29} ${width - 8} ${height / 2} C${width - 8} ${height * 0.71} ${width * 0.76} ${height - 12} ${width * 0.42} ${height - 12} H12 C${width * 0.24} ${height * 0.7} ${width * 0.24} ${height * 0.3} 12 12 Z`}
        />
      ) : symbol === 'arithmetic' ? (
        <ellipse
          className="block-surface"
          cx={width / 2}
          cy={height / 2}
          rx={width / 2 - 8}
          ry={height / 2 - 8}
        />
      ) : symbol === 'port' ? (
        <path
          className="block-surface"
          d={
            node.direction === 'output'
              ? `M14 5 H${width - 18} L${width - 4} ${height / 2} L${width - 18} ${height - 5} H14 Z`
              : `M4 ${height / 2} L20 5 H${width - 14} V${height - 5} H20 Z`
          }
        />
      ) : (
        <rect
          className="block-surface"
          x="4"
          y="4"
          width={width - 8}
          height={height - 8}
          rx={symbol === 'module' ? 3 : 8}
        />
      )}
      {symbol === 'register' && (
        <>
          <path
            className="block-detail"
            d={`M4 ${height - 29} L14 ${height - 21} L4 ${height - 13}`}
          />
          <text className="block-letter" x={width / 2} y={height / 2 + 7}>
            DFF
          </text>
        </>
      )}
      {symbol === 'module' && (
        <>
          <path className="module-header-line" d={`M5 29 H${width - 5}`} />
          <rect className="module-badge" x="10" y="9" width="19" height="13" rx="2" />
          <text className="module-badge-text" x="19.5" y="19" textAnchor="middle">
            M
          </text>
        </>
      )}
      {symbol === 'mux' && (
        <text className="block-letter" x={width / 2} y={height / 2 + 7}>
          MUX
        </text>
      )}
      {symbol === 'logic' && logicOperation && (
        <text className="logic-operation" x={width / 2} y={height / 2 + 3}>
          {logicOperation}
        </text>
      )}
      {symbol === 'arithmetic' && (
        <text className="block-letter" x={width / 2} y={height / 2 + 9}>
          Σ
        </text>
      )}
      {symbol === 'compare' && (
        <text className="block-letter" x={width / 2} y={height / 2 + 9}>
          =
        </text>
      )}
      {symbol === 'memory' && (
        <path
          className="block-detail"
          d={`M18 34 H${width - 18} M18 50 H${width - 18} M18 66 H${width - 18}`}
        />
      )}
    </g>
  );
}

function PinLabels({ node }: { node: LayoutNode }) {
  if (node.kind === 'port') return null;
  return (
    <>
      {node.pins.map((pin) => {
        const west = pin.side === 'WEST';
        const south = pin.side === 'SOUTH';
        const cy = pin.y + 4;
        const label = `${friendlyPinLabel(node, pin)}${pin.width > 1 ? ` [${pin.width}]` : ''}`;
        return south ? (
          <g key={pin.id} className={`node-pin ${pin.direction} control`}>
            <circle cx={pin.x + 4} cy={node.layoutHeight} r="4" />
            <line
              x1={pin.x + 4}
              x2={pin.x + 4}
              y1={node.layoutHeight - 12}
              y2={node.layoutHeight}
            />
            <text x={pin.x + 4} y={node.layoutHeight - 16} textAnchor="middle">
              {label}
            </text>
          </g>
        ) : (
          <g key={pin.id} className={`node-pin ${pin.direction}`}>
            <circle cx={west ? 0 : node.layoutWidth} cy={cy} r="4" />
            <line
              x1={west ? 0 : node.layoutWidth - 12}
              x2={west ? 12 : node.layoutWidth}
              y1={cy}
              y2={cy}
            />
            <text
              x={west ? 16 : node.layoutWidth - 16}
              y={cy + 4}
              textAnchor={west ? 'start' : 'end'}
            >
              {label}
            </text>
          </g>
        );
      })}
    </>
  );
}

export default function SchematicPanel({
  netlist,
  top,
  focusModule,
  probeNet,
  onNetProbe,
  onNavigateSource,
  onGenerateTestbench,
}: {
  netlist: YosysNetlist | null;
  top: string | null;
  focusModule?: string | null;
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

  useEffect(() => {
    if (top) setModuleName(top);
  }, [top]);
  useEffect(() => {
    if (focusModule && netlist?.modules?.[focusModule]) setModuleName(focusModule);
  }, [focusModule, netlist]);
  useEffect(() => {
    if (probeNet) setSelectedNet(probeNet);
  }, [probeNet]);

  useEffect(() => {
    if (!netlist || !moduleName) {
      setLayout(null);
      return;
    }
    let cancelled = false;
    setLayoutError(null);
    const graph = buildModuleGraph(netlist, moduleName);
    const metrics = new Map(graph.nodes.map((node) => [node.id, nodeMetrics(node)]));
    const endpoint = (nodeId: string, portName: string) =>
      metrics.get(nodeId)?.pins.find((pin) => pin.name === portName)?.id || nodeId;
    const input = {
      id: 'root',
      layoutOptions: {
        'elk.algorithm': 'layered',
        'elk.direction': 'RIGHT',
        'elk.edgeRouting': 'ORTHOGONAL',
        'elk.spacing.nodeNode': '42',
        'elk.layered.spacing.nodeNodeBetweenLayers': '88',
        'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
        'elk.padding': '[top=52,left=52,bottom=52,right=52]',
      },
      children: graph.nodes.map((node) => {
        const metric = metrics.get(node.id)!;
        return {
          id: node.id,
          width: metric.width,
          height: metric.height,
          layoutOptions: { 'elk.portConstraints': 'FIXED_POS' },
          ports: metric.pins.map((pin) => ({
            id: pin.id,
            width: 8,
            height: 8,
            x: pin.x,
            y: pin.y,
            layoutOptions: { 'elk.port.side': pin.side },
          })),
        };
      }),
      edges: graph.edges.map((edge) => ({
        id: edge.id,
        sources: [endpoint(edge.source, edge.sourcePort)],
        targets: [endpoint(edge.target, edge.targetPort)],
      })),
    };
    void elk
      .layout(input)
      .then((result: ElkLayoutResult) => {
        if (cancelled) return;
        const nodeLayouts = new Map(
          (result.children || []).map((node) => [node.id, node] as const),
        );
        const edgeLayouts = new Map((result.edges || []).map((edge) => [edge.id, edge] as const));
        setLayout({
          width: Math.max(400, result.width || 400),
          height: Math.max(260, result.height || 260),
          graph,
          nodes: graph.nodes.map((node) => {
            const placed = nodeLayouts.get(node.id) || { id: node.id };
            const metric = metrics.get(node.id)!;
            return {
              ...node,
              x: placed.x || 0,
              y: placed.y || 0,
              layoutWidth: metric.width,
              layoutHeight: metric.height,
              pins: metric.pins,
            };
          }),
          edges: graph.edges.map((edge) => {
            const placed = edgeLayouts.get(edge.id);
            const section = placed?.sections?.[0];
            return {
              ...edge,
              points: section
                ? [section.startPoint, ...(section.bendPoints || []), section.endPoint]
                : [],
            };
          }),
        });
        setScale(1);
        setPan({ x: 0, y: 0 });
      })
      .catch((error: unknown) => {
        if (!cancelled) setLayoutError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [elk, moduleName, netlist]);

  if (!netlist || !top)
    return (
      <div className="schematic-empty">
        <div className="chip">JSON</div>
        <h1>No RTL netlist loaded</h1>
        <p>Run RTL Analysis to elaborate the design with Yosys.</p>
      </div>
    );

  const modules = Object.keys(netlist.modules || {});
  const selectedClean = cleanNet(selectedNet);
  const selectedNodeDetails = layout?.nodes.find((node) => node.id === selectedNode) || null;
  return (
    <div className="schematic-panel">
      <div className="schematic-toolbar">
        <strong>Module</strong>
        <select value={moduleName} onChange={(event) => setModuleName(event.target.value)}>
          {modules.map((module) => (
            <option key={module}>{module}</option>
          ))}
        </select>
        <span>
          {layout
            ? `${summarizeNodes(layout.nodes)} · ${layout.edges.length} nets`
            : 'Running ELK layout…'}
        </span>
        {selectedNodeDetails && (
          <span className={`selected-node-summary ${selectedNodeDetails.symbol}`}>
            {selectedNodeDetails.name} · {symbolLabel(selectedNodeDetails.symbol)}
          </span>
        )}
        {selectedNodeDetails?.source && (
          <button onClick={() => onNavigateSource(selectedNodeDetails.source!)}>Open source</button>
        )}
        {selectedNodeDetails?.moduleRef && (
          <button onClick={() => setModuleName(selectedNodeDetails.moduleRef!)}>Open module</button>
        )}
        {selectedNet && (
          <code title={`Yosys net: ${selectedNet}`}>signal: {friendlyNetLabel(selectedNet)}</code>
        )}
        <button onClick={() => setScale((value) => Math.min(4, value * 1.25))}>Zoom +</button>
        <button onClick={() => setScale((value) => Math.max(0.3, value / 1.25))}>Zoom −</button>
        <button
          onClick={() => {
            setScale(1);
            setPan({ x: 0, y: 0 });
          }}
        >
          Fit
        </button>
        <button
          data-testid="starter-testbench"
          className="starter-testbench"
          title="Build an editable beginner testbench from these real Yosys ports"
          onClick={() => onGenerateTestbench(moduleName)}
        >
          Stimulus Builder
        </button>
      </div>
      <div className="schematic-legend">
        <span>
          <i className="legend-icon register">D</i>Register
        </span>
        <span>
          <i className="legend-icon mux">M</i>Mux
        </span>
        <span>
          <i className="legend-icon logic">∿</i>Logic
        </span>
        <span>
          <i className="legend-icon arithmetic">Σ</i>Arithmetic
        </span>
        <span>
          <i className="legend-icon module">□</i>Module
        </span>
        <span>
          <i className="legend-icon port">I/O</i>Port
        </span>
        <small>Wires terminate on labeled inputs and outputs.</small>
      </div>
      <div className="schematic-stage">
        {!layout ? (
          <div className={`layout-progress ${layoutError ? 'error' : ''}`}>
            {layoutError
              ? `ELK layout failed: ${layoutError}`
              : 'ELK is laying out the elaborated netlist…'}
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            onWheel={(event) => {
              event.preventDefault();
              setScale((value) =>
                Math.max(0.3, Math.min(4, value * Math.exp(-event.deltaY * 0.001))),
              );
            }}
            onPointerDown={(event) => {
              if (event.target === event.currentTarget) {
                event.currentTarget.setPointerCapture(event.pointerId);
                drag.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
              }
            }}
            onPointerMove={(event) => {
              if (drag.current)
                setPan({
                  x: drag.current.panX + event.clientX - drag.current.x,
                  y: drag.current.panY + event.clientY - drag.current.y,
                });
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
          >
            <defs>
              <marker
                id="rtl-arrow"
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="4"
                orient="auto"
              >
                <path d="M0,0 L8,4 L0,8 Z" />
              </marker>
            </defs>
            <g transform={`translate(${pan.x} ${pan.y}) scale(${scale})`}>
              {layout.edges.map((edge) => {
                const active = selectedClean && cleanNet(edge.netName) === selectedClean;
                const pathData = edge.points
                  .map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`)
                  .join(' ');
                const middle = edge.points[Math.floor(edge.points.length / 2)];
                const label = friendlyNetLabel(edge.netName);
                return (
                  <g
                    key={edge.id}
                    className={`schematic-edge ${active ? 'active' : ''}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedNet(edge.netName);
                      onNetProbe(edge.netName);
                    }}
                  >
                    <title>
                      {label === 'internal connection'
                        ? `Internal Yosys connection: ${edge.netName}`
                        : edge.netName}
                    </title>
                    <path d={pathData} markerEnd="url(#rtl-arrow)" />
                    {middle && label !== 'internal connection' && (
                      <text x={middle.x + 4} y={middle.y - 7}>
                        {label}
                        {edge.bits.length > 1 ? ` [${edge.bits.length}]` : ''}
                      </text>
                    )}
                  </g>
                );
              })}
              {layout.nodes.map((node) => {
                const selected = selectedNode === node.id;
                return (
                  <g
                    key={node.id}
                    className={`schematic-node ${node.kind} symbol-${node.symbol} ${selected ? 'selected' : ''}`}
                    transform={`translate(${node.x} ${node.y})`}
                    role="button"
                    tabIndex={0}
                    aria-label={`${node.name}, ${symbolLabel(node.symbol)}. Double click or use Open source to navigate.`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedNode(node.id);
                    }}
                    onDoubleClick={(event) => {
                      event.stopPropagation();
                      if (node.source) onNavigateSource(node.source);
                    }}
                    onKeyDown={(event) => {
                      if ((event.key === 'Enter' || event.key === ' ') && node.source) {
                        event.preventDefault();
                        onNavigateSource(node.source);
                      }
                    }}
                  >
                    <NodeBody node={node} />
                    {node.kind === 'port' ? (
                      <>
                        <text
                          className="port-name"
                          x={node.layoutWidth / 2}
                          y="19"
                          textAnchor="middle"
                        >
                          {node.name}
                          {node.width > 1 ? ` [${node.width}]` : ''}
                        </text>
                        <text
                          className="port-direction"
                          x={node.layoutWidth / 2}
                          y="33"
                          textAnchor="middle"
                        >
                          {node.direction}
                        </text>
                      </>
                    ) : (
                      <>
                        <title>{`${node.name} · Yosys type ${node.type}`}</title>
                        {showsNodeHeading(node) && (
                          <text
                            className="node-name"
                            x={node.layoutWidth / 2 + (node.symbol === 'module' ? 11 : 0)}
                            y={node.symbol === 'module' ? 20 : 15}
                            textAnchor="middle"
                          >
                            {displayNodeName(node)}
                          </text>
                        )}
                        {showsNodeCaption(node) && (
                          <text
                            className="node-type"
                            x={node.layoutWidth / 2}
                            y={node.layoutHeight - 8}
                            textAnchor="middle"
                          >
                            {symbolLabel(node.symbol)}
                          </text>
                        )}
                        <PinLabels node={node} />
                      </>
                    )}
                    {node.moduleRef && (
                      <g
                        className="drill-module"
                        onClick={(event) => {
                          event.stopPropagation();
                          setModuleName(node.moduleRef!);
                        }}
                      >
                        <rect x={node.layoutWidth - 54} y="9" width="45" height="17" rx="4" />
                        <text x={node.layoutWidth - 48} y="21">
                          OPEN
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>
        )}
      </div>
    </div>
  );
}

function displayNodeName(node: LayoutNode) {
  const limit = node.symbol === 'module' ? 24 : node.symbol === 'register' ? 17 : 13;
  return node.name.length > limit ? `${node.name.slice(0, limit - 1)}…` : node.name;
}

function showsNodeHeading(node: LayoutNode) {
  return ['module', 'register', 'memory', 'generic'].includes(node.symbol);
}

function showsNodeCaption(node: LayoutNode) {
  return ['module', 'register', 'memory', 'generic'].includes(node.symbol);
}

function summarizeNodes(nodes: LayoutNode[]) {
  const modules = nodes.filter((node) => node.symbol === 'module').length;
  const registers = nodes.filter((node) => node.symbol === 'register').length;
  const primitives = nodes.filter(
    (node) => !['module', 'port', 'register'].includes(node.symbol),
  ).length;
  return `${modules} module${modules === 1 ? '' : 's'} · ${registers} register${registers === 1 ? '' : 's'} · ${primitives} primitive${primitives === 1 ? '' : 's'}`;
}
