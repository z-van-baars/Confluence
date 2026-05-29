import type { Patch, CurtainWall, Point } from '../../core/types';
import { distance } from '../../core/geometry';

export interface GraphNode {
  point: Point;
  inner: boolean;   // within city boundary
  blocked: boolean; // wall/citadel vertex (not a gate)
  edges: GraphEdge[];
}

export interface GraphEdge {
  to: GraphNode;
  weight: number;
}

export interface Graph {
  nodes: Map<Point, GraphNode>;
  innerNodes: GraphNode[];
  outerNodes: GraphNode[];
}

export function buildTopology(
  patches: Patch[],
  wall: CurtainWall | null,
  castleWall: CurtainWall | null,
  gates: Point[],
): Graph {
  const nodes = new Map<Point, GraphNode>();
  const gateSet = new Set(gates);

  // Collect all unique vertices from all patches
  const allVertices = new Set<Point>();
  for (const patch of patches) {
    for (const v of patch.shape) allVertices.add(v);
  }

  // Determine which vertices are wall/castle vertices (blocked unless gate)
  const wallVertexSet = new Set<Point>();
  if (wall) for (const v of wall.shape) wallVertexSet.add(v);
  if (castleWall) for (const v of castleWall.shape) wallVertexSet.add(v);

  // Create nodes
  for (const v of allVertices) {
    const isGate = gateSet.has(v);
    const isWallVert = wallVertexSet.has(v);
    nodes.set(v, {
      point: v,
      inner: false, // will be set below
      blocked: isWallVert && !isGate,
      edges: [],
    });
  }

  // Determine inner vs outer by checking which patches contain each vertex
  // A vertex is "inner" if it belongs to at least one inner (withinCity) patch
  for (const patch of patches) {
    for (const v of patch.shape) {
      const node = nodes.get(v);
      if (node && patch.withinCity) node.inner = true;
    }
  }

  // Build edges: walk each patch boundary, add edges between consecutive vertices
  const seen = new Set<string>();
  for (const patch of patches) {
    const s = patch.shape;
    for (let i = 0; i < s.length; i++) {
      const a = s[i];
      const b = s[(i + 1) % s.length];
      const key = edgeKey(a, b);
      if (seen.has(key)) continue;
      seen.add(key);

      const nodeA = nodes.get(a);
      const nodeB = nodes.get(b);
      if (!nodeA || !nodeB) continue;
      if (nodeA.blocked || nodeB.blocked) continue;

      const w = distance(a, b);
      nodeA.edges.push({ to: nodeB, weight: w });
      nodeB.edges.push({ to: nodeA, weight: w });
    }
  }

  const innerNodes: GraphNode[] = [];
  const outerNodes: GraphNode[] = [];
  for (const node of nodes.values()) {
    if (node.inner) innerNodes.push(node);
    else outerNodes.push(node);
  }

  return { nodes, innerNodes, outerNodes };
}

function edgeKey(a: Point, b: Point): string {
  const ax = Math.round(a.x * 10), ay = Math.round(a.y * 10);
  const bx = Math.round(b.x * 10), by = Math.round(b.y * 10);
  if (ax < bx || (ax === bx && ay < by)) return `${ax},${ay}|${bx},${by}`;
  return `${bx},${by}|${ax},${ay}`;
}

// A* shortest path. `useInner` restricts traversal to inner or outer nodes.
// `gateSet` lists vertices that are always traversable regardless of inner/outer.
export function aStar(
  start: Point,
  goal: Point,
  graph: Graph,
  useInner: boolean,
  gateSet?: Set<Point>,
): Point[] | null {
  const startNode = graph.nodes.get(start);
  const goalNode = graph.nodes.get(goal);
  if (!startNode || !goalNode) return null;

  const allowed = (n: GraphNode) =>
    (gateSet !== undefined && gateSet.has(n.point)) ||
    (useInner ? n.inner : !n.inner);
  if (!allowed(startNode) || !allowed(goalNode)) return null;

  const dist = new Map<GraphNode, number>();
  const prev = new Map<GraphNode, GraphNode>();
  const open = new MinHeap<GraphNode>((a, b) => {
    const fa = (dist.get(a) ?? Infinity) + distance(a.point, goal);
    const fb = (dist.get(b) ?? Infinity) + distance(b.point, goal);
    return fa - fb;
  });

  dist.set(startNode, 0);
  open.push(startNode);

  while (!open.isEmpty()) {
    const current = open.pop()!;
    if (current === goalNode) break;

    const dCurr = dist.get(current) ?? Infinity;
    for (const { to, weight } of current.edges) {
      if (!allowed(to)) continue;
      const newDist = dCurr + weight;
      if (newDist < (dist.get(to) ?? Infinity)) {
        dist.set(to, newDist);
        prev.set(to, current);
        open.push(to);
      }
    }
  }

  // Reconstruct path
  const path: Point[] = [];
  let curr: GraphNode | undefined = goalNode;
  while (curr) {
    path.unshift(curr.point);
    curr = prev.get(curr);
    if (curr === startNode) { path.unshift(curr.point); break; }
  }

  return path.length >= 2 ? path : null;
}

// Simple binary min-heap
class MinHeap<T> {
  private data: T[] = [];
  constructor(private compare: (a: T, b: T) => number) {}

  push(item: T): void {
    this.data.push(item);
    this.bubbleUp(this.data.length - 1);
  }

  pop(): T | undefined {
    if (this.data.length === 0) return undefined;
    const top = this.data[0];
    const last = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = last;
      this.siftDown(0);
    }
    return top;
  }

  isEmpty(): boolean { return this.data.length === 0; }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.compare(this.data[i], this.data[parent]) >= 0) break;
      [this.data[i], this.data[parent]] = [this.data[parent], this.data[i]];
      i = parent;
    }
  }

  private siftDown(i: number): void {
    const n = this.data.length;
    while (true) {
      let smallest = i;
      const l = 2 * i + 1, r = 2 * i + 2;
      if (l < n && this.compare(this.data[l], this.data[smallest]) < 0) smallest = l;
      if (r < n && this.compare(this.data[r], this.data[smallest]) < 0) smallest = r;
      if (smallest === i) break;
      [this.data[i], this.data[smallest]] = [this.data[smallest], this.data[i]];
      i = smallest;
    }
  }
}
