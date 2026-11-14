// Waypoint graph for the bots: ~36 hand-placed nodes on the lanes, corners,
// site entries, hold spots and plant spots. Paths are BFS over this tiny graph
// (no A* needed — the graph is small and every edge costs the same). Bots move
// node to node with the same moveBody collision code as the player.
// Tags: spawn | lane | hold | peek | site-a | site-b | plant | cover.
const NODES = [
  // id, x, z, tags
  [0, 0, 14.5, 'spawn'], [1, -6, 13, 'spawn'], [2, 6, 13, 'spawn'],
  [3, -16, 8, 'lane'], [4, -16, 2, 'lane'], [5, -16, -4, 'lane'],
  [6, -8, 6, 'lane'], [7, -8, -2, 'peek'], [8, -8, -8, 'hold'],
  [9, 0, 6, 'lane'], [10, 0, 0, 'lane'], [11, 0, -6, 'peek'],
  [12, 8, 6, 'lane'], [13, 8, -2, 'peek'], [14, 8, -8, 'hold'],
  [15, 16, 8, 'lane'], [16, 16, 2, 'lane'], [17, 16, -4, 'lane'],
  [18, -16, -10, 'site-a'], [19, -13, -10, 'plant'], [20, -19, -10, 'plant'],
  [21, 16, -10, 'site-b'], [22, 13.5, -10, 'plant'], [23, 19, -7.5, 'plant'],
  [24, -16, -13.5, 'spawn'], [25, -4, -14, 'spawn'], [26, 4, -14, 'spawn'],
  [27, 16, -13.5, 'spawn'], [28, 0, -13, 'spawn'],
  [29, -12, -12, 'hold'], [30, -12, -6, 'hold'], [31, 12, -12, 'hold'],
  [32, 12, -6, 'hold'], [33, -4, -10, 'peek'], [34, 4, -10, 'peek'],
  [35, -2, 4, 'cover'], [36, 2, -4, 'cover'],
];
// Edges are listed once per pair; BFS treats them as undirected.
const EDGES = [
  [0, 1], [0, 2], [0, 3], [0, 9], [0, 15], [1, 3], [1, 6], [2, 12], [2, 15],
  [3, 4], [4, 5], [5, 18], [5, 30], [6, 7], [6, 9], [7, 8], [7, 11],
  [8, 18], [8, 33], [9, 10], [10, 11], [10, 35], [11, 36], [11, 33], [11, 34],
  [12, 13], [12, 15], [13, 14], [13, 17], [14, 34], [14, 32],
  [15, 16], [16, 17], [17, 21], [17, 32], [18, 19], [18, 20], [18, 29],
  [19, 29], [20, 29], [21, 22], [21, 23], [21, 31], [22, 31], [23, 31],
  [24, 18], [24, 29], [25, 28], [25, 33], [26, 28], [26, 34], [27, 21],
  [27, 31], [28, 33], [28, 34], [29, 30], [30, 33], [31, 32], [32, 34],
  [33, 30], [34, 32], [35, 9], [35, 6], [36, 11], [36, 13],
];

export function createNav() {
  const byId = new Map(NODES.map((n) => [n[0], { id: n[0], x: n[1], z: n[2], tags: n[3] }]));
  const adj = new Map([...byId.keys()].map((id) => [id, []]));
  for (const [a, b] of EDGES) {
    adj.get(a).push(b);
    adj.get(b).push(a);
  }
  // BFS from `from` to `to`; returns an array of node ids (excluding `from`).
  function path(from, to) {
    if (from === to) return [to];
    const prev = new Map([[from, -1]]);
    const queue = [from];
    while (queue.length) {
      const cur = queue.shift();
      for (const next of adj.get(cur) ?? []) {
        if (prev.has(next)) continue;
        prev.set(next, cur);
        if (next === to) {
          const out = [to];
          let walk = cur;
          while (walk !== from && walk !== -1) { out.unshift(walk); walk = prev.get(walk); }
          return out;
        }
        queue.push(next);
      }
    }
    return [to];
  }
  function nearestNode(x, z) {
    let best = 0;
    let bestD = Infinity;
    for (const n of byId.values()) {
      const d = (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z);
      if (d < bestD) { bestD = d; best = n.id; }
    }
    return best;
  }
  function nodesWith(tag) {
    return [...byId.values()].filter((n) => n.tags === tag).map((n) => n.id);
  }
  return { byId, path, nearestNode, nodesWith };
}

// Pick a hold node for a defender near a site, preferring the site's own holds.
export function pickHoldNode(nav, rng, site) {
  const holds = site === 'A' ? [29, 30, 8] : [31, 32, 14];
  return holds[Math.floor(rng() * holds.length)];
}
