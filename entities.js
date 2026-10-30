// entities.js - Player, Creature AI, and Particle Systems

class Player {
  constructor(x = 2, y = 2) {
    this.x = x;
    this.y = y;
    this.visualX = x;
    this.visualY = y;
    this.prevX = x;
    this.prevY = y;
    this.moveProgress = 1.0; // 0 to 1 for smooth interpolation
    this.fuel = 65;
    this.maxFuel = 100;
    this.flashes = 2;
    this.maxFlashes = 3;
    this.steps = 0;
    this.facing = 'down'; // 'up', 'down', 'left', 'right'
    this.inGrove = false;
  }

  reset(x, y) {
    this.x = x;
    this.y = y;
    this.visualX = x;
    this.visualY = y;
    this.prevX = x;
    this.prevY = y;
    this.moveProgress = 1.0;
    this.fuel = 65;
    this.flashes = 2;
    this.steps = 0;
    this.facing = 'down';
    this.inGrove = false;
  }

  moveTo(nx, ny) {
    this.prevX = this.x;
    this.prevY = this.y;
    this.x = nx;
    this.y = ny;
    this.moveProgress = 0.0;
    this.steps++;

    if (nx > this.prevX) this.facing = 'right';
    else if (nx < this.prevX) this.facing = 'left';
    else if (ny > this.prevY) this.facing = 'down';
    else if (ny < this.prevY) this.facing = 'up';
  }

  drainFuel(amount = 1) {
    this.fuel = Math.max(0, this.fuel - amount);
    return this.fuel;
  }

  addFuel(amount) {
    const prev = this.fuel;
    this.fuel = Math.min(this.maxFuel, this.fuel + amount);
    return this.fuel - prev;
  }

  updateInterpolation(dt) {
    if (this.moveProgress < 1.0) {
      this.moveProgress = Math.min(1.0, this.moveProgress + dt * 10);
      // Smooth ease-out curve
      const t = 1 - Math.pow(1 - this.moveProgress, 3);
      this.visualX = this.prevX + (this.x - this.prevX) * t;
      this.visualY = this.prevY + (this.y - this.prevY) * t;
    } else {
      this.visualX = this.x;
      this.visualY = this.y;
    }
  }
}

class Creature {
  constructor(id, x, y) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.visualX = x;
    this.visualY = y;
    this.prevX = x;
    this.prevY = y;
    this.moveProgress = 1.0;
    this.state = 'wander'; // 'wander', 'hunt', 'stunned'
    this.stunnedTurns = 0;
    this.lastDir = { dx: 0, dy: 1 };
  }

  stun(turns = 3) {
    this.stunnedTurns = turns;
    this.state = 'stunned';
  }

  update(forestMap, player, otherCreatures) {
    if (this.stunnedTurns > 0) {
      this.stunnedTurns--;
      if (this.stunnedTurns === 0) {
        this.state = 'wander';
      }
      return { moved: false, state: this.state };
    }

    const distToPlayer = Math.hypot(this.x - player.x, this.y - player.y);
    const occupiedByOthers = new Set(
      otherCreatures
        .filter(c => c.id !== this.id)
        .map(c => `${c.x},${c.y}`)
    );

    // Evade mechanic: If player is hiding in a grove and creature isn't right next to them, creature loses track!
    const isPlayerDetected = distToPlayer <= 5.5 && (!player.inGrove || distToPlayer <= 1.5);

    let nextStep = null;
    let becameAlert = false;

    if (isPlayerDetected) {
      if (this.state !== 'hunt') {
        becameAlert = true;
      }
      this.state = 'hunt';

      // Find path towards player using BFS
      const path = this.findPathTo(forestMap, { x: player.x, y: player.y }, occupiedByOthers);
      if (path && path.length > 1) {
        nextStep = path[1];
      }
    } else {
      this.state = 'wander';
      // Wander randomly or follow current corridor
      nextStep = this.chooseWanderStep(forestMap, occupiedByOthers);
    }

    if (nextStep) {
      this.prevX = this.x;
      this.prevY = this.y;
      this.x = nextStep.x;
      this.y = nextStep.y;
      this.moveProgress = 0.0;
      this.lastDir = { dx: this.x - this.prevX, dy: this.y - this.prevY };
    }

    return {
      moved: !!nextStep,
      state: this.state,
      becameAlert: becameAlert
    };
  }

  chooseWanderStep(forestMap, occupiedByOthers) {
    const dirs = [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 }
    ];

    const validNeighbors = [];
    for (const d of dirs) {
      const nx = this.x + d.dx;
      const ny = this.y + d.dy;
      if (forestMap.isPassable(nx, ny) && !occupiedByOthers.has(`${nx},${ny}`)) {
        // Bias towards continuing forward to avoid jittering back and forth
        const isForward = d.dx === this.lastDir.dx && d.dy === this.lastDir.dy;
        const isBackward = d.dx === -this.lastDir.dx && d.dy === -this.lastDir.dy;
        const weight = isForward ? 4 : (isBackward ? 1 : 2);
        validNeighbors.push({ x: nx, y: ny, weight });
      }
    }

    if (validNeighbors.length === 0) return null;

    const totalWeight = validNeighbors.reduce((s, n) => s + n.weight, 0);
    let rand = Math.random() * totalWeight;
    for (const neighbor of validNeighbors) {
      if (rand < neighbor.weight) return neighbor;
      rand -= neighbor.weight;
    }
    return validNeighbors[0];
  }

  findPathTo(forestMap, target, occupiedByOthers) {
    const queue = [[{ x: this.x, y: this.y }]];
    const visited = Array.from({ length: forestMap.height }, () =>
      Array.from({ length: forestMap.width }, () => false)
    );
    visited[this.y][this.x] = true;

    const dirs = [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 }
    ];

    while (queue.length > 0) {
      const path = queue.shift();
      const curr = path[path.length - 1];

      if (curr.x === target.x && curr.y === target.y) {
        return path;
      }

      for (const d of dirs) {
        const nx = curr.x + d.dx;
        const ny = curr.y + d.dy;

        if (
          nx >= 0 && nx < forestMap.width &&
          ny >= 0 && ny < forestMap.height &&
          !visited[ny][nx] &&
          forestMap.isPassable(nx, ny)
        ) {
          // Avoid tiles occupied by other creatures unless it's the target tile (player)
          if (occupiedByOthers.has(`${nx},${ny}`) && (nx !== target.x || ny !== target.y)) {
            continue;
          }
          visited[ny][nx] = true;
          queue.push([...path, { x: nx, y: ny }]);
        }
      }
    }
    return null;
  }

  updateInterpolation(dt) {
    if (this.moveProgress < 1.0) {
      this.moveProgress = Math.min(1.0, this.moveProgress + dt * 8);
      const t = 1 - Math.pow(1 - this.moveProgress, 3);
      this.visualX = this.prevX + (this.x - this.prevX) * t;
      this.visualY = this.prevY + (this.y - this.prevY) * t;
    } else {
      this.visualX = this.x;
      this.visualY = this.y;
    }
  }
}

class ParticleSystem {
  constructor(width = 24, height = 24) {
    this.mapWidth = width;
    this.mapHeight = height;
    this.ambientSpores = [];
    this.bursts = [];
    this.initSpores(40);
  }

  initSpores(count) {
    this.ambientSpores = [];
    for (let i = 0; i < count; i++) {
      this.ambientSpores.push({
        x: Math.random() * this.mapWidth,
        y: Math.random() * this.mapHeight,
        vx: (Math.random() - 0.5) * 0.15,
        vy: -0.05 - Math.random() * 0.1,
        alpha: 0.1 + Math.random() * 0.35,
        baseAlpha: 0.2 + Math.random() * 0.3,
        size: 1.5 + Math.random() * 2.5,
        pulseSpeed: 1 + Math.random() * 2,
        pulseOffset: Math.random() * Math.PI * 2
      });
    }
  }

  triggerFlashBurst(x, y, radius = 5) {
    this.bursts.push({
      x,
      y,
      radius: 0.5,
      maxRadius: radius,
      alpha: 0.9,
      duration: 0.6,
      elapsed: 0
    });
  }

  triggerCollectBurst(x, y) {
    for (let i = 0; i < 14; i++) {
      const angle = (Math.PI * 2 / 14) * i + Math.random() * 0.2;
      const speed = 1.2 + Math.random() * 1.5;
      this.ambientSpores.push({
        x: x + 0.5,
        y: y + 0.5,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        alpha: 0.9,
        baseAlpha: 0.9,
        size: 3 + Math.random() * 2,
        decay: 1.5,
        isSparks: true
      });
    }
  }

  update(dt, reduceMotion = false) {
    if (reduceMotion) return;

    // Update ambient spores
    for (let i = this.ambientSpores.length - 1; i >= 0; i--) {
      const s = this.ambientSpores[i];
      s.x += s.vx * dt;
      s.y += s.vy * dt;

      if (s.isSparks) {
        s.alpha -= dt * s.decay;
        s.vx *= 0.92;
        s.vy *= 0.92;
        if (s.alpha <= 0.05) {
          this.ambientSpores.splice(i, 1);
        }
      } else {
        // Wrap around map borders
        if (s.x < 0) s.x = this.mapWidth;
        if (s.x > this.mapWidth) s.x = 0;
        if (s.y < 0) s.y = this.mapHeight;
        if (s.y > this.mapHeight) s.y = 0;
      }
    }

    // Update flash waves
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.elapsed += dt;
      const progress = b.elapsed / b.duration;
      b.radius = b.maxRadius * progress;
      b.alpha = 0.9 * (1 - progress);
      if (progress >= 1.0) {
        this.bursts.splice(i, 1);
      }
    }
  }
}

window.Player = Player;
window.Creature = Creature;
window.ParticleSystem = ParticleSystem;
