// map.js - Forest map generation, BFS path validation, and tile state

const TILE = {
  TREE: 0,
  PATH: 1,
  GROVE: 2,   // Dense bushes/mist: evades creatures
  SHRINE: 3,  // Unveils fog
  FIREFLY: 4, // Collectible light resource
  EXIT: 5     // Goal
};

class ForestMap {
  constructor(width = 24, height = 24) {
    this.width = width;
    this.height = height;
    this.grid = [];        // 2D array of TILE types
    this.revealed = [];    // 2D array of booleans (permanently discovered)
    this.visible = [];     // 2D array of booleans (currently illuminated)
    this.playerStart = { x: 2, y: 2 };
    this.exitPos = { x: width - 3, y: height - 3 };
    this.shrines = [];     // array of {x, y, active: true}
    this.fireflies = [];   // array of {x, y, collected: false}
    this.groves = [];      // array of {x, y}
    this.creatures = [];   // initial spawn points
  }

  // Generate a guaranteed solvable, atmospheric forest
  generate() {
    let attempts = 0;
    const maxAttempts = 100;

    while (attempts < maxAttempts) {
      attempts++;
      this.initEmptyGrid();

      // 1. Carve primary winding path from start to exit
      this.playerStart = { x: 2, y: 2 };
      this.exitPos = { x: this.width - 3, y: this.height - 3 };

      this.carveTrunkPath(this.playerStart, this.exitPos);

      // 2. Carve multiple natural branch loops and clearings
      this.carveClearingsAndLoops();

      // 3. Verify solvability using BFS
      const shortestPath = this.findPath(this.playerStart, this.exitPos);
      if (shortestPath && shortestPath.length >= 22) {
        // Map is nicely winding and guaranteed solvable!
        this.populateFeatures(shortestPath);
        this.initFog();
        return true;
      }
    }

    // Fallback safe corridor generation if loop takes too many attempts
    this.generateFallbackMap();
    this.initFog();
    return true;
  }

  initEmptyGrid() {
    this.grid = Array.from({ length: this.height }, () =>
      Array.from({ length: this.width }, () => TILE.TREE)
    );
    this.shrines = [];
    this.fireflies = [];
    this.groves = [];
    this.creatures = [];
  }

  initFog() {
    this.revealed = Array.from({ length: this.height }, () =>
      Array.from({ length: this.width }, () => false)
    );
    this.visible = Array.from({ length: this.height }, () =>
      Array.from({ length: this.width }, () => false)
    );
  }

  carveTrunkPath(start, goal) {
    let curr = { ...start };
    this.grid[curr.y][curr.x] = TILE.PATH;

    // Meandering random walk with directional bias toward goal
    while (curr.x !== goal.x || curr.y !== goal.y) {
      const candidates = [];
      if (curr.x < goal.x) candidates.push({ x: curr.x + 1, y: curr.y, weight: 3 });
      if (curr.x > goal.x) candidates.push({ x: curr.x - 1, y: curr.y, weight: 1 });
      if (curr.y < goal.y) candidates.push({ x: curr.x, y: curr.y + 1, weight: 3 });
      if (curr.y > goal.y) candidates.push({ x: curr.x, y: curr.y - 1, weight: 1 });

      // Add sideways meander opportunities
      if (curr.x > 1 && curr.x <= goal.x) candidates.push({ x: curr.x - 1, y: curr.y, weight: 1 });
      if (curr.y > 1 && curr.y <= goal.y) candidates.push({ x: curr.x, y: curr.y - 1, weight: 1 });

      // Weighted random selection
      const totalWeight = candidates.reduce((s, c) => s + c.weight, 0);
      let rand = Math.random() * totalWeight;
      let next = candidates[0];
      for (const cand of candidates) {
        if (rand < cand.weight) {
          next = cand;
          break;
        }
        rand -= cand.weight;
      }

      // Keep within bounds with a 1-tile tree border
      const nx = Math.max(1, Math.min(this.width - 2, next.x));
      const ny = Math.max(1, Math.min(this.height - 2, next.y));
      curr = { x: nx, y: ny };
      this.grid[curr.y][curr.x] = TILE.PATH;
    }

    this.grid[start.y][start.x] = TILE.PATH;
    this.grid[goal.y][goal.x] = TILE.EXIT;
  }

  carveClearingsAndLoops() {
    // Pick 6-8 random points on existing paths and branch out
    const pathTiles = [];
    for (let y = 1; y < this.height - 1; y++) {
      for (let x = 1; x < this.width - 1; x++) {
        if (this.grid[y][x] === TILE.PATH) {
          pathTiles.push({ x, y });
        }
      }
    }

    const numBranches = Math.min(10, pathTiles.length);
    for (let i = 0; i < numBranches; i++) {
      const origin = pathTiles[Math.floor(Math.random() * pathTiles.length)];
      let branchLen = 4 + Math.floor(Math.random() * 6);
      let bx = origin.x;
      let by = origin.y;

      const dirs = [
        { dx: 1, dy: 0 },
        { dx: -1, dy: 0 },
        { dx: 0, dy: 1 },
        { dx: 0, dy: -1 }
      ];

      for (let s = 0; s < branchLen; s++) {
        const d = dirs[Math.floor(Math.random() * dirs.length)];
        const nx = bx + d.dx;
        const ny = by + d.dy;

        if (nx >= 1 && nx < this.width - 1 && ny >= 1 && ny < this.height - 1) {
          this.grid[ny][nx] = TILE.PATH;
          bx = nx;
          by = ny;
        }
      }

      // Occasionally carve a 2x2 clearing at the end of the branch
      if (Math.random() < 0.5 && bx > 1 && bx < this.width - 2 && by > 1 && by < this.height - 2) {
        this.grid[by][bx] = TILE.PATH;
        this.grid[by + 1][bx] = TILE.PATH;
        this.grid[by][bx + 1] = TILE.PATH;
        this.grid[by + 1][bx + 1] = TILE.PATH;
      }
    }
  }

  populateFeatures(primaryPath) {
    const primarySet = new Set(primaryPath.map(p => `${p.x},${p.y}`));
    const allPaths = [];

    for (let y = 1; y < this.height - 1; y++) {
      for (let x = 1; x < this.width - 1; x++) {
        if (this.grid[y][x] === TILE.PATH) {
          const distToStart = Math.hypot(x - this.playerStart.x, y - this.playerStart.y);
          const distToExit = Math.hypot(x - this.exitPos.x, y - this.exitPos.y);
          allPaths.push({ x, y, distToStart, distToExit, isPrimary: primarySet.has(`${x},${y}`) });
        }
      }
    }

    // 1. Shrines: 2 to 3 shrines positioned in clearings or branch ends
    const shrineCandidates = allPaths.filter(p =>
      !p.isPrimary && p.distToStart >= 6 && p.distToExit >= 4
    );
    this.shuffle(shrineCandidates);
    const shrineCount = Math.min(3, shrineCandidates.length);
    for (let i = 0; i < shrineCount; i++) {
      const p = shrineCandidates[i];
      this.grid[p.y][p.x] = TILE.SHRINE;
      this.shrines.push({ x: p.x, y: p.y, active: true });
    }

    // 2. Groves (Dense stealth thickets): 6-8 scattered across the woods
    const groveCandidates = allPaths.filter(p =>
      this.grid[p.y][p.x] === TILE.PATH && p.distToStart >= 3
    );
    this.shuffle(groveCandidates);
    const groveCount = Math.min(7, groveCandidates.length);
    for (let i = 0; i < groveCount; i++) {
      const p = groveCandidates[i];
      this.grid[p.y][p.x] = TILE.GROVE;
      this.groves.push({ x: p.x, y: p.y });
    }

    // 3. Fireflies: 7-9 placed both along pathways and rewarding side explorations
    const fireflyCandidates = allPaths.filter(p =>
      this.grid[p.y][p.x] === TILE.PATH && p.distToStart >= 3 && p.distToExit >= 2
    );
    this.shuffle(fireflyCandidates);
    const fireflyCount = Math.min(8, fireflyCandidates.length);
    for (let i = 0; i < fireflyCount; i++) {
      const p = fireflyCandidates[i];
      this.grid[p.y][p.x] = TILE.FIREFLY;
      this.fireflies.push({ x: p.x, y: p.y, collected: false });
    }

    // 4. Creatures: 3 roamers starting sufficiently far from the player (>9 tiles)
    const creatureCandidates = allPaths.filter(p =>
      (this.grid[p.y][p.x] === TILE.PATH || this.grid[p.y][p.x] === TILE.GROVE) &&
      p.distToStart >= 9 && p.distToExit >= 3
    );
    this.shuffle(creatureCandidates);
    const creatureCount = Math.min(3, creatureCandidates.length);
    for (let i = 0; i < creatureCount; i++) {
      const p = creatureCandidates[i];
      this.creatures.push({ x: p.x, y: p.y });
    }
  }

  generateFallbackMap() {
    this.initEmptyGrid();
    this.playerStart = { x: 2, y: 2 };
    this.exitPos = { x: this.width - 3, y: this.height - 3 };

    // Draw snake/zigzag corridor
    for (let y = 2; y <= this.height - 3; y++) {
      for (let x = 2; x <= this.width - 3; x++) {
        if (y % 2 === 0 || (y % 4 === 1 && x === this.width - 3) || (y % 4 === 3 && x === 2)) {
          this.grid[y][x] = TILE.PATH;
        }
      }
    }
    this.grid[this.playerStart.y][this.playerStart.x] = TILE.PATH;
    this.grid[this.exitPos.y][this.exitPos.x] = TILE.EXIT;

    // Add some fireflies & a shrine
    this.grid[4][4] = TILE.FIREFLY;
    this.fireflies.push({ x: 4, y: 4, collected: false });
    this.grid[10][10] = TILE.SHRINE;
    this.shrines.push({ x: 10, y: 10, active: true });
    this.grid[14][6] = TILE.GROVE;
    this.groves.push({ x: 14, y: 6 });
    this.creatures.push({ x: 16, y: 16 });
  }

  // BFS pathfinding to check reachability and distance
  findPath(start, goal) {
    const queue = [[start]];
    const visited = Array.from({ length: this.height }, () =>
      Array.from({ length: this.width }, () => false)
    );
    visited[start.y][start.x] = true;

    const dirs = [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 }
    ];

    while (queue.length > 0) {
      const path = queue.shift();
      const curr = path[path.length - 1];

      if (curr.x === goal.x && curr.y === goal.y) {
        return path;
      }

      for (const d of dirs) {
        const nx = curr.x + d.dx;
        const ny = curr.y + d.dy;

        if (
          nx >= 0 && nx < this.width &&
          ny >= 0 && ny < this.height &&
          !visited[ny][nx] &&
          this.grid[ny][nx] !== TILE.TREE
        ) {
          visited[ny][nx] = true;
          queue.push([...path, { x: nx, y: ny }]);
        }
      }
    }
    return null;
  }

  // Update line-of-sight visibility based on player position and lantern fuel
  updateVisibility(px, py, fuel) {
    // Reset currently visible flags
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        this.visible[y][x] = false;
      }
    }

    // Determine vision radius based on fuel
    let radius = 3.6;
    if (fuel <= 20) {
      radius = 2.1; // Dim and tense, but still see adjacent + diagonals
    } else if (fuel <= 50) {
      radius = 2.8;
    }

    const radSq = radius * radius;
    const rInt = Math.ceil(radius);

    for (let dy = -rInt; dy <= rInt; dy++) {
      for (let dx = -rInt; dx <= rInt; dx++) {
        const distSq = dx * dx + dy * dy;
        if (distSq <= radSq) {
          const nx = px + dx;
          const ny = py + dy;
          if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height) {
            // Line-of-sight check so walls block vision realistically
            if (this.hasLineOfSight(px, py, nx, ny)) {
              this.visible[ny][nx] = true;
              this.revealed[ny][nx] = true;
            }
          }
        }
      }
    }
  }

  // Raycasting line-of-sight using Bresenham's algorithm
  hasLineOfSight(x0, y0, x1, y1) {
    let dx = Math.abs(x1 - x0);
    let dy = Math.abs(y1 - y0);
    let sx = x0 < x1 ? 1 : -1;
    let sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    let cx = x0;
    let cy = y0;

    while (true) {
      if (cx === x1 && cy === y1) return true;
      // If we hit an obstacle before reaching the target tile, LOS is blocked
      if ((cx !== x0 || cy !== y0) && this.grid[cy][cx] === TILE.TREE) {
        return false;
      }
      let e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        cx += sx;
      }
      if (e2 < dx) {
        err += dx;
        cy += sy;
      }
    }
  }

  // Activate a shrine: unveil an expansive 7x7 patch around the shrine permanently
  activateShrine(sx, sy) {
    const shrine = this.shrines.find(s => s.x === sx && s.y === sy);
    if (!shrine || !shrine.active) return false;

    shrine.active = false;
    const revealRadius = 4;
    for (let dy = -revealRadius; dy <= revealRadius; dy++) {
      for (let dx = -revealRadius; dx <= revealRadius; dx++) {
        const nx = sx + dx;
        const ny = sy + dy;
        if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height) {
          this.revealed[ny][nx] = true;
        }
      }
    }
    return true;
  }

  collectFirefly(fx, fy) {
    const firefly = this.fireflies.find(f => f.x === fx && f.y === fy && !f.collected);
    if (!firefly) return false;
    firefly.collected = true;
    this.grid[fy][fx] = TILE.PATH;
    return true;
  }

  isPassable(x, y) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return false;
    return this.grid[y][x] !== TILE.TREE;
  }

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }
}

window.ForestMap = ForestMap;
window.TILE = TILE;
