// renderer.js - HTML5 Canvas renderer with dynamic lighting, fog of war, and animations

class GameRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.tileSize = 44;
    this.camX = 0;
    this.camY = 0;
    this.flickerOffset = 0;
    this.time = 0;
    this.reduceMotion = false;

    // Handle high-DPI displays
    this.pixelRatio = window.devicePixelRatio || 1;
    this.resize();
  }

  setReduceMotion(enabled) {
    this.reduceMotion = enabled;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.floor(rect.width || window.innerWidth || 600);
    const height = Math.floor(rect.height || window.innerHeight || 600);

    this.pixelRatio = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(width * this.pixelRatio);
    this.canvas.height = Math.floor(height * this.pixelRatio);

    // Responsive tile sizing
    const minDim = Math.min(width, height);
    if (minDim < 450) {
      this.tileSize = 36;
    } else if (minDim < 700) {
      this.tileSize = 42;
    } else {
      this.tileSize = 48;
    }
  }

  updateCamera(player, mapWidth, mapHeight, dt) {
    const viewW = this.canvas.width / this.pixelRatio;
    const viewH = this.canvas.height / this.pixelRatio;

    // Keep player and lantern perfectly centered in the viewport
    const targetX = player.visualX * this.tileSize + this.tileSize / 2 - viewW / 2;
    const targetY = player.visualY * this.tileSize + this.tileSize / 2 - viewH / 2;

    if (!this.camInitialized) {
      this.camX = targetX;
      this.camY = targetY;
      this.camInitialized = true;
      return;
    }

    // Smooth camera interpolation
    const lerpSpeed = this.reduceMotion ? 1.0 : Math.min(1.0, dt * 10);
    this.camX += (targetX - this.camX) * lerpSpeed;
    this.camY += (targetY - this.camY) * lerpSpeed;
  }

  render(gameState, dt) {
    this.time += dt;
    const ctx = this.ctx;
    const { forestMap, player, creatures, particleSystem } = gameState;

    // Calculate subtle lantern flicker
    if (!this.reduceMotion) {
      this.flickerOffset = Math.sin(this.time * 7.5) * 0.04 + Math.cos(this.time * 13.2) * 0.03;
    } else {
      this.flickerOffset = 0;
    }

    this.updateCamera(player, forestMap.width, forestMap.height, dt);

    ctx.save();
    ctx.scale(this.pixelRatio, this.pixelRatio);

    // 1. Dark nocturnal background void
    ctx.fillStyle = '#060a0f';
    ctx.fillRect(0, 0, this.canvas.width / this.pixelRatio, this.canvas.height / this.pixelRatio);

    ctx.save();
    ctx.translate(-Math.round(this.camX), -Math.round(this.camY));

    // 2. Render Map Tiles
    this.renderTiles(ctx, forestMap);

    // 3. Render Shrines & Exit
    this.renderLandmarks(ctx, forestMap);

    // 4. Render Collectibles (Fireflies)
    this.renderFireflies(ctx, forestMap);

    // 5. Render Creatures (only if in visible range)
    this.renderCreatures(ctx, creatures, forestMap);

    // 6. Render Player
    this.renderPlayer(ctx, player);

    // 7. Render Dynamic Lighting & Fog of War
    this.renderLightingAndFog(ctx, forestMap, player);

    // 8. Render Spores & Flash Bursts
    this.renderParticles(ctx, particleSystem);

    ctx.restore(); // Restore camera offset

    // 9. Edge Vignette & low fuel heartbeat
    this.renderVignetteOverlay(ctx, player.fuel);

    ctx.restore(); // Restore DPI scale
  }

  renderTiles(ctx, map) {
    const size = this.tileSize;

    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const isRevealed = map.revealed[y][x];
        if (!isRevealed) continue; // Unrevealed stays black void

        const isCurrentlyVisible = map.visible[y][x];
        const screenX = x * size;
        const screenY = y * size;
        const tileType = map.grid[y][x];

        ctx.save();
        if (tileType === TILE.TREE) {
          this.drawTreeTile(ctx, screenX, screenY, isCurrentlyVisible, x, y);
        } else if (tileType === TILE.GROVE) {
          this.drawGroveTile(ctx, screenX, screenY, isCurrentlyVisible);
        } else {
          this.drawPathTile(ctx, screenX, screenY, isCurrentlyVisible, x, y);
        }
        ctx.restore();
      }
    }
  }

  drawPathTile(ctx, x, y, isVisible, gx, gy) {
    const size = this.tileSize;

    // Base ground
    ctx.fillStyle = isVisible ? '#1b2d3d' : '#0e1822';
    ctx.fillRect(x, y, size, size);

    // Cobblestone flagstone block
    ctx.fillStyle = isVisible ? '#274158' : '#142332';
    ctx.fillRect(x + 2, y + 2, size - 4, size - 4);

    // Flagstone inner border
    ctx.strokeStyle = isVisible ? 'rgba(84, 128, 168, 0.45)' : 'rgba(35, 55, 75, 0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 2.5, y + 2.5, size - 5, size - 5);

    // Moss / trail stone variations
    const seed = (gx * 37 + gy * 19) % 5;
    if (seed === 0) {
      ctx.fillStyle = isVisible ? '#225540' : '#112b20';
      ctx.fillRect(x + 5, y + 5, 5, 5);
    } else if (seed === 2) {
      ctx.fillStyle = isVisible ? '#225540' : '#112b20';
      ctx.fillRect(x + size - 10, y + size - 10, 5, 5);
    }
  }

  drawTreeTile(ctx, x, y, isVisible, gx, gy) {
    const size = this.tileSize;
    // Dark forest earth
    ctx.fillStyle = isVisible ? '#0c1f17' : '#06120d';
    ctx.fillRect(x, y, size, size);

    const cx = x + size / 2;
    const cy = y + size / 2;
    const r = size * 0.45;

    // Ground shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + size * 0.2, r * 0.75, r * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Outer pine needles
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = isVisible ? '#1b4a35' : '#0f291d';
    ctx.fill();

    // Mid pine canopy
    ctx.beginPath();
    ctx.arc(cx, cy - 2, r * 0.72, 0, Math.PI * 2);
    ctx.fillStyle = isVisible ? '#246347' : '#143828';
    ctx.fill();

    // Top crown highlight
    ctx.beginPath();
    ctx.arc(cx, cy - 5, r * 0.44, 0, Math.PI * 2);
    ctx.fillStyle = isVisible ? '#348e65' : '#1c523a';
    ctx.fill();
  }

  drawGroveTile(ctx, x, y, isVisible) {
    const size = this.tileSize;
    ctx.fillStyle = isVisible ? '#103024' : '#081c14';
    ctx.fillRect(x, y, size, size);

    const cx = x + size / 2;
    const cy = y + size / 2;

    // Dense bush clusters
    ctx.fillStyle = isVisible ? '#1b5a3f' : '#0f3826';
    ctx.beginPath();
    ctx.arc(cx - size * 0.22, cy, size * 0.26, 0, Math.PI * 2);
    ctx.arc(cx + size * 0.22, cy + 2, size * 0.24, 0, Math.PI * 2);
    ctx.arc(cx, cy - size * 0.16, size * 0.28, 0, Math.PI * 2);
    ctx.fill();

    // Lush highlight
    ctx.fillStyle = isVisible ? '#34d399' : 'rgba(52, 211, 153, 0.4)';
    ctx.beginPath();
    ctx.arc(cx, cy - 3, size * 0.15, 0, Math.PI * 2);
    ctx.fill();

    // Ground mist ribbon
    ctx.fillStyle = isVisible ? 'rgba(167, 243, 208, 0.3)' : 'rgba(167, 243, 208, 0.1)';
    ctx.fillRect(x + 3, y + size - 8, size - 6, 4);
  }

  renderLandmarks(ctx, map) {
    const size = this.tileSize;

    // 1. Shrines
    for (const shrine of map.shrines) {
      if (!map.revealed[shrine.y][shrine.x]) continue;
      const isVisible = map.visible[shrine.y][shrine.x];
      const cx = shrine.x * size + size / 2;
      const cy = shrine.y * size + size / 2;

      // Stone dolmen base
      ctx.fillStyle = isVisible ? '#334155' : '#1e293b';
      ctx.fillRect(cx - size * 0.35, cy - size * 0.32, size * 0.7, size * 0.65);

      // Monolith cap
      ctx.fillStyle = isVisible ? '#475569' : '#283548';
      ctx.fillRect(cx - size * 0.25, cy - size * 0.42, size * 0.5, size * 0.2);

      // Glowing cyan rune
      if (shrine.active) {
        const pulse = this.reduceMotion ? 0.8 : 0.65 + Math.sin(this.time * 3 + shrine.x) * 0.35;
        ctx.fillStyle = `rgba(52, 211, 153, ${pulse})`;
        ctx.shadowColor = '#34d399';
        ctx.shadowBlur = isVisible ? 16 : 8;

        ctx.beginPath();
        ctx.moveTo(cx, cy - size * 0.18);
        ctx.lineTo(cx + size * 0.16, cy);
        ctx.lineTo(cx, cy + size * 0.18);
        ctx.lineTo(cx - size * 0.16, cy);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
      } else {
        ctx.fillStyle = '#64748b';
        ctx.beginPath();
        ctx.arc(cx, cy, size * 0.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 2. Exit Gate
    if (map.revealed[map.exitPos.y][map.exitPos.x]) {
      const isVisible = map.visible[map.exitPos.y][map.exitPos.x];
      const ex = map.exitPos.x * size;
      const ey = map.exitPos.y * size;
      const cx = ex + size / 2;
      const cy = ey + size / 2;

      // Stone Gateway Arch
      ctx.fillStyle = isVisible ? '#475569' : '#283548';
      ctx.fillRect(ex + 4, ey + 4, size * 0.24, size - 8);
      ctx.fillRect(ex + size - 4 - size * 0.24, ey + 4, size * 0.24, size - 8);
      ctx.fillRect(ex + 4, ey + 4, size - 8, size * 0.22);

      // Sunlit portal rays
      const portalPulse = this.reduceMotion ? 0.85 : 0.7 + Math.sin(this.time * 4) * 0.3;
      const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, size * 0.5);
      grad.addColorStop(0, `rgba(254, 240, 138, ${portalPulse})`);
      grad.addColorStop(0.5, `rgba(251, 191, 36, ${portalPulse * 0.7})`);
      grad.addColorStop(1, 'rgba(251, 191, 36, 0)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.5, 0, Math.PI * 2);
      ctx.fill();

      // Gateway Star Emblem
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#fde047';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.14, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  renderFireflies(ctx, map) {
    const size = this.tileSize;

    for (const firefly of map.fireflies) {
      if (firefly.collected || !map.visible[firefly.y][firefly.x]) continue;

      const fx = firefly.x * size + size / 2;
      const bob = this.reduceMotion ? 0 : Math.sin(this.time * 5 + firefly.x * 2) * 4;
      const fy = firefly.y * size + size / 2 + bob;

      // Outer radial aura
      const pulse = this.reduceMotion ? 0.5 : 0.45 + Math.sin(this.time * 6 + firefly.y) * 0.25;
      const grad = ctx.createRadialGradient(fx, fy, 1, fx, fy, size * 0.5);
      grad.addColorStop(0, `rgba(254, 240, 138, ${pulse + 0.3})`);
      grad.addColorStop(0.5, `rgba(52, 211, 153, ${pulse * 0.6})`);
      grad.addColorStop(1, 'rgba(52, 211, 153, 0)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(fx, fy, size * 0.5, 0, Math.PI * 2);
      ctx.fill();

      // Glowing body
      ctx.fillStyle = '#fef08a';
      ctx.shadowColor = '#fde047';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(fx, fy, size * 0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Wings
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      const wingFlap = this.reduceMotion ? 2 : Math.sin(this.time * 20) * 3;
      ctx.beginPath();
      ctx.ellipse(fx - 3, fy - 4, 3, Math.abs(wingFlap) + 1, -Math.PI / 4, 0, Math.PI * 2);
      ctx.ellipse(fx + 3, fy - 4, 3, Math.abs(wingFlap) + 1, Math.PI / 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  renderCreatures(ctx, creatures, map) {
    const size = this.tileSize;

    for (const c of creatures) {
      const isVisible = map.visible[c.y][c.x] || (map.visible[c.prevY] && map.visible[c.prevY][c.prevX]);
      if (!isVisible) continue;

      const cx = c.visualX * size + size / 2;
      const cy = c.visualY * size + size / 2;
      const breath = this.reduceMotion ? 0 : Math.sin(this.time * 4 + c.id) * 2;

      ctx.save();
      ctx.fillStyle = 'rgba(10, 15, 22, 0.95)';
      ctx.shadowColor = c.state === 'hunt' ? 'rgba(239, 68, 68, 0.7)' : 'rgba(0, 0, 0, 0.8)';
      ctx.shadowBlur = c.state === 'hunt' ? 16 : 8;

      const r = size * 0.32 + breath * 0.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      // Beast Horns
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.7, cy - r * 0.5);
      ctx.lineTo(cx - r * 1.1, cy - r * 1.2);
      ctx.lineTo(cx - r * 0.2, cy - r * 0.8);
      ctx.moveTo(cx + r * 0.7, cy - r * 0.5);
      ctx.lineTo(cx + r * 1.1, cy - r * 1.2);
      ctx.lineTo(cx + r * 0.2, cy - r * 0.8);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Predatory glowing eyes
      const eyeColor = c.state === 'hunt' ? '#ef4444' : (c.state === 'stunned' ? '#c084fc' : '#f59e0b');
      ctx.fillStyle = eyeColor;
      ctx.shadowColor = eyeColor;
      ctx.shadowBlur = 10;

      if (c.state === 'stunned') {
        ctx.beginPath();
        ctx.arc(cx - 5, cy - 2, 2.5, 0, Math.PI * 2);
        ctx.arc(cx + 5, cy - 2, 2.5, 0, Math.PI * 2);
        ctx.fill();

        const starAngle = this.time * 5;
        ctx.fillStyle = '#fde047';
        for (let i = 0; i < 3; i++) {
          const sa = starAngle + (i * Math.PI * 2) / 3;
          const sx = cx + Math.cos(sa) * (size * 0.35);
          const sy = cy - size * 0.45 + Math.sin(sa) * 4;
          ctx.beginPath();
          ctx.arc(sx, sy, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.beginPath();
        ctx.ellipse(cx - 5, cy - 2, 3, 4, 0, 0, Math.PI * 2);
        ctx.ellipse(cx + 5, cy - 2, 3, 4, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#000000';
        ctx.fillRect(cx - 5.5, cy - 4.5, 1.2, 5);
        ctx.fillRect(cx + 4.5, cy - 4.5, 1.2, 5);
      }

      ctx.restore();
    }
  }

  renderPlayer(ctx, player) {
    const size = this.tileSize;
    const px = player.visualX * size + size / 2;
    const py = player.visualY * size + size / 2;
    const bob = (player.moveProgress < 1.0 && !this.reduceMotion) ? Math.sin(player.moveProgress * Math.PI) * 4 : 0;

    ctx.save();

    // Warm radial lantern glow halo surrounding player
    const aura = ctx.createRadialGradient(px, py, 2, px, py, size * 1.3);
    aura.addColorStop(0, 'rgba(254, 240, 138, 0.4)');
    aura.addColorStop(0.5, 'rgba(245, 158, 11, 0.2)');
    aura.addColorStop(1, 'rgba(245, 158, 11, 0)');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(px, py, size * 1.3, 0, Math.PI * 2);
    ctx.fill();

    // Character shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.beginPath();
    ctx.ellipse(px, py + size * 0.28, size * 0.3, size * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();

    // Cloaked traveler
    const bodyY = py - bob;
    ctx.fillStyle = player.inGrove ? '#1e4839' : '#334155';
    ctx.beginPath();
    ctx.arc(px, bodyY, size * 0.28, 0, Math.PI * 2);
    ctx.fill();

    // Cowl / hood
    ctx.fillStyle = player.inGrove ? '#2d6a4f' : '#475569';
    ctx.beginPath();
    ctx.arc(px, bodyY - 3, size * 0.22, 0, Math.PI * 2);
    ctx.fill();

    // Adventurer gold brooch
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.arc(px, bodyY - 1, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Handheld lantern
    let lx = px + size * 0.25;
    let ly = bodyY + 2;
    if (player.facing === 'left') lx = px - size * 0.25;
    else if (player.facing === 'up') ly = bodyY - size * 0.2;
    else if (player.facing === 'down') ly = bodyY + size * 0.2;

    // Glowing core of the lantern
    const lanternFuelRatio = player.fuel / player.maxFuel;
    const coreColor = lanternFuelRatio > 0.3 ? '#fef08a' : (lanternFuelRatio > 0.1 ? '#f59e0b' : '#ef4444');
    ctx.fillStyle = coreColor;
    ctx.shadowColor = coreColor;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(lx, ly, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Lantern brass cage
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(lx - 4, ly - 6, 8, 12);

    ctx.restore();
  }

  renderLightingAndFog(ctx, map, player) {
    const size = this.tileSize;
    const px = player.visualX * size + size / 2;
    const py = player.visualY * size + size / 2;

    let baseTiles = 3.6;
    if (player.fuel <= 20) baseTiles = 2.1;
    else if (player.fuel <= 50) baseTiles = 2.8;

    const flicker = 1.0 + this.flickerOffset;
    const lightRadius = baseTiles * size * flicker;

    // Fog overlay for unrevealed and memory tiles
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const tx = x * size;
        const ty = y * size;

        if (!map.revealed[y][x]) {
          // Unexplored deep void
          ctx.fillStyle = '#060a0f';
          ctx.fillRect(tx, ty, size, size);
        } else if (!map.visible[y][x]) {
          // Explored memory fog
          ctx.fillStyle = 'rgba(6, 12, 18, 0.72)';
          ctx.fillRect(tx, ty, size, size);
        }
      }
    }

    // Warm radial lantern illumination onto active vision
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const lanternWarmth = ctx.createRadialGradient(px, py, 2, px, py, lightRadius);
    const warmthAlpha = player.fuel > 20 ? 0.28 : 0.16;
    lanternWarmth.addColorStop(0, `rgba(254, 240, 138, ${warmthAlpha})`);
    lanternWarmth.addColorStop(0.4, `rgba(245, 158, 11, ${warmthAlpha * 0.7})`);
    lanternWarmth.addColorStop(0.8, `rgba(180, 83, 9, ${warmthAlpha * 0.2})`);
    lanternWarmth.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = lanternWarmth;
    ctx.beginPath();
    ctx.arc(px, py, lightRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  renderParticles(ctx, particleSystem) {
    const size = this.tileSize;

    // Ambient spores
    for (const s of particleSystem.ambientSpores) {
      const sx = s.x * size;
      const sy = s.y * size;

      ctx.fillStyle = s.isSparks ? `rgba(253, 224, 71, ${s.alpha})` : `rgba(110, 231, 183, ${s.alpha})`;
      ctx.beginPath();
      ctx.arc(sx, sy, s.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // Flash wave bursts
    for (const b of particleSystem.bursts) {
      const bx = b.x * size + size / 2;
      const by = b.y * size + size / 2;
      const r = b.radius * size;

      ctx.save();
      ctx.strokeStyle = `rgba(254, 240, 138, ${b.alpha})`;
      ctx.lineWidth = 4;
      ctx.shadowColor = '#fef08a';
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(bx, by, r, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = `rgba(254, 240, 138, ${b.alpha * 0.25})`;
      ctx.fill();
      ctx.restore();
    }
  }

  renderVignetteOverlay(ctx, fuel) {
    const w = this.canvas.width / this.pixelRatio;
    const h = this.canvas.height / this.pixelRatio;

    // Subtle edge vignette
    const grad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.max(w, h) * 0.75);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    grad.addColorStop(1, 'rgba(3, 7, 12, 0.6)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Critical fuel heartbeat warning pulse
    if (fuel <= 20 && fuel > 0) {
      const pulse = this.reduceMotion ? 0.3 : 0.25 + Math.sin(this.time * 6) * 0.15;
      const redGrad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.65);
      redGrad.addColorStop(0, 'rgba(239, 68, 68, 0)');
      redGrad.addColorStop(1, `rgba(185, 28, 28, ${pulse})`);

      ctx.fillStyle = redGrad;
      ctx.fillRect(0, 0, w, h);
    }
  }
}

window.GameRenderer = GameRenderer;
