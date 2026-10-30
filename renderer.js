// renderer.js - HTML5 Canvas renderer with dynamic lighting, fog of war, and animations

class GameRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.tileSize = 38;
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
    const width = Math.floor(rect.width || 600);
    const height = Math.floor(rect.height || 600);

    this.pixelRatio = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(width * this.pixelRatio);
    this.canvas.height = Math.floor(height * this.pixelRatio);

    // Dynamic tile size based on screen viewport
    // For smaller screens (phones), tile size stays comfortably tap/read-friendly (36-44px)
    // For large screens, can be 40-48px
    if (width < 450) {
      this.tileSize = 36;
    } else if (width < 700) {
      this.tileSize = 40;
    } else {
      this.tileSize = 46;
    }
  }

  updateCamera(player, mapWidth, mapHeight, dt) {
    const targetX = player.visualX * this.tileSize + this.tileSize / 2 - (this.canvas.width / this.pixelRatio) / 2;
    const targetY = player.visualY * this.tileSize + this.tileSize / 2 - (this.canvas.height / this.pixelRatio) / 2;

    const maxCamX = Math.max(0, mapWidth * this.tileSize - (this.canvas.width / this.pixelRatio));
    const maxCamY = Math.max(0, mapHeight * this.tileSize - (this.canvas.height / this.pixelRatio));

    const clampedTargetX = Math.max(0, Math.min(maxCamX, targetX));
    const clampedTargetY = Math.max(0, Math.min(maxCamY, targetY));

    // Smooth camera interpolation
    const lerpSpeed = this.reduceMotion ? 1.0 : Math.min(1.0, dt * 10);
    this.camX += (clampedTargetX - this.camX) * lerpSpeed;
    this.camY += (clampedTargetY - this.camY) * lerpSpeed;
  }

  render(gameState, dt) {
    this.time += dt;
    const ctx = this.ctx;
    const { forestMap, player, creatures, particleSystem } = gameState;

    // Calculate lantern flicker
    if (!this.reduceMotion) {
      this.flickerOffset = Math.sin(this.time * 7.5) * 0.04 + Math.cos(this.time * 13.2) * 0.03;
    } else {
      this.flickerOffset = 0;
    }

    this.updateCamera(player, forestMap.width, forestMap.height, dt);

    ctx.save();
    ctx.scale(this.pixelRatio, this.pixelRatio);

    // 1. Clear background to dark nocturnal forest void
    ctx.fillStyle = '#060a0f';
    ctx.fillRect(0, 0, this.canvas.width / this.pixelRatio, this.canvas.height / this.pixelRatio);

    ctx.save();
    ctx.translate(-Math.round(this.camX), -Math.round(this.camY));

    // 2. Render Map Tiles
    this.renderTiles(ctx, forestMap, player);

    // 3. Render Shrines & Exit
    this.renderLandmarks(ctx, forestMap);

    // 4. Render Collectibles (Fireflies)
    this.renderFireflies(ctx, forestMap);

    // 5. Render Creatures (only if in visible range or previously spotted)
    this.renderCreatures(ctx, creatures, forestMap);

    // 6. Render Player
    this.renderPlayer(ctx, player);

    // 7. Render Fog of War & Dynamic Lighting
    this.renderLightingAndFog(ctx, forestMap, player);

    // 8. Render Particles & Bursts
    this.renderParticles(ctx, particleSystem, forestMap);

    ctx.restore(); // Restore camera translation

    // 9. Low fuel vignette warning border on screen edges
    this.renderVignetteOverlay(ctx, player.fuel);

    ctx.restore(); // Restore DPI scale
  }

  renderTiles(ctx, map, player) {
    const startCol = Math.max(0, Math.floor(this.camX / this.tileSize));
    const endCol = Math.min(map.width - 1, Math.ceil((this.camX + this.canvas.width / this.pixelRatio) / this.tileSize));
    const startRow = Math.max(0, Math.floor(this.camY / this.tileSize));
    const endRow = Math.min(map.height - 1, Math.ceil((this.camY + this.canvas.height / this.pixelRatio) / this.tileSize));

    for (let y = startRow; y <= endRow; y++) {
      for (let x = startCol; x <= endCol; x++) {
        const isRevealed = map.revealed[y][x];
        if (!isRevealed) continue; // Unrevealed stays black void

        const isCurrentlyVisible = map.visible[y][x];
        const screenX = x * this.tileSize;
        const screenY = y * this.tileSize;
        const tileType = map.grid[y][x];

        // Base tile ground
        ctx.save();
        if (tileType === TILE.TREE) {
          this.drawTreeTile(ctx, screenX, screenY, isCurrentlyVisible, x, y);
        } else if (tileType === TILE.GROVE) {
          this.drawGroveTile(ctx, screenX, screenY, isCurrentlyVisible);
        } else {
          // Path, Firefly, Shrine, Exit ground
          this.drawPathTile(ctx, screenX, screenY, isCurrentlyVisible, x, y);
        }
        ctx.restore();
      }
    }
  }

  drawPathTile(ctx, x, y, isVisible, gx, gy) {
    // Subtle flagstone / forest trail
    const size = this.tileSize;
    ctx.fillStyle = isVisible ? '#121d26' : '#0b131a';
    ctx.fillRect(x, y, size, size);

    // Faint cobblestone texture details
    ctx.fillStyle = isVisible ? '#182733' : '#0e1820';
    const seed = (gx * 37 + gy * 17) % 7;
    if (seed === 0) {
      ctx.fillRect(x + 4, y + 4, size / 2 - 4, size / 2 - 4);
    } else if (seed === 3) {
      ctx.fillRect(x + size / 2 + 2, y + size / 2 + 2, size / 2 - 5, size / 2 - 5);
    }

    // Tile border
    ctx.strokeStyle = isVisible ? 'rgba(30, 48, 64, 0.4)' : 'rgba(15, 25, 35, 0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
  }

  drawTreeTile(ctx, x, y, isVisible, gx, gy) {
    const size = this.tileSize;
    ctx.fillStyle = isVisible ? '#091510' : '#050c09';
    ctx.fillRect(x, y, size, size);

    const cx = x + size / 2;
    const cy = y + size / 2;
    const r = size * 0.42;

    // Outer pine foliage shadow
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = isVisible ? '#102e21' : '#0a1a13';
    ctx.fill();

    // Inner foliage layer
    ctx.beginPath();
    ctx.arc(cx, cy - 2, r * 0.75, 0, Math.PI * 2);
    ctx.fillStyle = isVisible ? '#16402e' : '#0d241a';
    ctx.fill();

    // Subtle pine needle cluster hint
    ctx.beginPath();
    ctx.arc(cx, cy - 4, r * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = isVisible ? '#1d543d' : '#102e21';
    ctx.fill();
  }

  drawGroveTile(ctx, x, y, isVisible) {
    const size = this.tileSize;
    // Ground
    ctx.fillStyle = isVisible ? '#0d231b' : '#071510';
    ctx.fillRect(x, y, size, size);

    // Dense fern / bush silhouettes
    ctx.fillStyle = isVisible ? '#194d38' : '#0f2f22';
    const cx = x + size / 2;
    const cy = y + size / 2;

    // Multiple lush foliage clusters
    ctx.beginPath();
    ctx.arc(cx - size * 0.2, cy, size * 0.25, 0, Math.PI * 2);
    ctx.arc(cx + size * 0.2, cy + 2, size * 0.22, 0, Math.PI * 2);
    ctx.arc(cx, cy - size * 0.15, size * 0.28, 0, Math.PI * 2);
    ctx.fill();

    // Foliage highlight
    ctx.fillStyle = isVisible ? 'rgba(52, 211, 153, 0.25)' : 'rgba(52, 211, 153, 0.08)';
    ctx.beginPath();
    ctx.arc(cx, cy - 2, size * 0.16, 0, Math.PI * 2);
    ctx.fill();

    // Small mist wisps in grove
    ctx.fillStyle = isVisible ? 'rgba(167, 243, 208, 0.15)' : 'rgba(167, 243, 208, 0.05)';
    ctx.fillRect(x + 3, y + size - 6, size - 6, 3);
  }

  renderLandmarks(ctx, map) {
    const size = this.tileSize;

    // 1. Shrines
    for (const shrine of map.shrines) {
      if (!map.revealed[shrine.y][shrine.x]) continue;
      const isVisible = map.visible[shrine.y][shrine.x];
      const sx = shrine.x * size;
      const sy = shrine.y * size;
      const cx = sx + size / 2;
      const cy = sy + size / 2;

      // Stone base dolmen
      ctx.fillStyle = isVisible ? '#273544' : '#17222c';
      ctx.fillRect(cx - size * 0.32, cy - size * 0.3, size * 0.64, size * 0.65);

      // Stone pillar detail
      ctx.fillStyle = isVisible ? '#38495a' : '#222f3b';
      ctx.fillRect(cx - size * 0.22, cy - size * 0.38, size * 0.44, size * 0.2);

      // Glowing rune monolith
      if (shrine.active) {
        const pulse = this.reduceMotion ? 0.7 : 0.65 + Math.sin(this.time * 3 + shrine.x) * 0.3;
        ctx.fillStyle = `rgba(52, 211, 153, ${pulse})`;
        ctx.shadowColor = '#34d399';
        ctx.shadowBlur = isVisible ? 12 : 6;

        // Ancient rune diamond
        ctx.beginPath();
        ctx.moveTo(cx, cy - size * 0.18);
        ctx.lineTo(cx + size * 0.14, cy);
        ctx.lineTo(cx, cy + size * 0.18);
        ctx.lineTo(cx - size * 0.14, cy);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
      } else {
        // Dormant/activated shrine
        ctx.fillStyle = '#475569';
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

      // Stone arch gateway
      ctx.fillStyle = isVisible ? '#2d3748' : '#1a202c';
      // Left and right pillars
      ctx.fillRect(ex + 4, ey + 4, size * 0.22, size - 8);
      ctx.fillRect(ex + size - 4 - size * 0.22, ey + 4, size * 0.22, size - 8);
      // Top lintel
      ctx.fillRect(ex + 4, ey + 4, size - 8, size * 0.2);

      // Beacon / portal light inside arch
      const portalPulse = this.reduceMotion ? 0.8 : 0.6 + Math.sin(this.time * 4) * 0.3;
      const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, size * 0.45);
      grad.addColorStop(0, `rgba(254, 240, 138, ${portalPulse})`);
      grad.addColorStop(0.6, `rgba(251, 191, 36, ${portalPulse * 0.7})`);
      grad.addColorStop(1, 'rgba(251, 191, 36, 0)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.45, 0, Math.PI * 2);
      ctx.fill();

      // Gate star emblem
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  renderFireflies(ctx, map) {
    const size = this.tileSize;

    for (const firefly of map.fireflies) {
      if (firefly.collected || !map.visible[firefly.y][firefly.x]) continue;

      const fx = firefly.x * size + size / 2;
      const bob = this.reduceMotion ? 0 : Math.sin(this.time * 5 + firefly.x * 2) * 4;
      const fy = firefly.y * size + size / 2 + bob;

      // Outer aura
      const auraPulse = this.reduceMotion ? 0.4 : 0.35 + Math.sin(this.time * 6 + firefly.y) * 0.2;
      const grad = ctx.createRadialGradient(fx, fy, 1, fx, fy, size * 0.45);
      grad.addColorStop(0, `rgba(253, 224, 71, ${auraPulse + 0.3})`);
      grad.addColorStop(0.5, `rgba(52, 211, 153, ${auraPulse * 0.6})`);
      grad.addColorStop(1, 'rgba(52, 211, 153, 0)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(fx, fy, size * 0.45, 0, Math.PI * 2);
      ctx.fill();

      // Bright core firefly body
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(fx, fy, size * 0.1, 0, Math.PI * 2);
      ctx.fill();

      // Delicate fairy wings
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      const wingFlap = this.reduceMotion ? 2 : Math.sin(this.time * 18) * 3;
      ctx.beginPath();
      ctx.ellipse(fx - 3, fy - 4, 3, Math.abs(wingFlap) + 1, -Math.PI / 4, 0, Math.PI * 2);
      ctx.ellipse(fx + 3, fy - 4, 3, Math.abs(wingFlap) + 1, Math.PI / 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  renderCreatures(ctx, creatures, map) {
    const size = this.tileSize;

    for (const c of creatures) {
      // Creatures are hidden in the fog unless currently illuminated!
      const isVisible = map.visible[c.y][c.x] || (map.visible[c.prevY] && map.visible[c.prevY][c.prevX]);
      if (!isVisible) continue;

      const cx = c.visualX * size + size / 2;
      const cy = c.visualY * size + size / 2;
      const breath = this.reduceMotion ? 0 : Math.sin(this.time * 4 + c.id) * 2;

      ctx.save();
      // Shadow body
      ctx.fillStyle = 'rgba(10, 10, 15, 0.95)';
      ctx.shadowColor = c.state === 'hunt' ? 'rgba(239, 68, 68, 0.6)' : 'rgba(0, 0, 0, 0.8)';
      ctx.shadowBlur = c.state === 'hunt' ? 14 : 6;

      ctx.beginPath();
      // Menacing horned beast silhouette
      const r = size * 0.32 + breath * 0.5;
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      // Horns / ears
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.7, cy - r * 0.5);
      ctx.lineTo(cx - r * 1.1, cy - r * 1.2);
      ctx.lineTo(cx - r * 0.2, cy - r * 0.8);
      ctx.moveTo(cx + r * 0.7, cy - r * 0.5);
      ctx.lineTo(cx + r * 1.1, cy - r * 1.2);
      ctx.lineTo(cx + r * 0.2, cy - r * 0.8);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Glowing predatory eyes
      const eyeColor = c.state === 'hunt' ? '#ef4444' : (c.state === 'stunned' ? '#a855f7' : '#f59e0b');
      ctx.fillStyle = eyeColor;
      ctx.shadowColor = eyeColor;
      ctx.shadowBlur = 8;

      if (c.state === 'stunned') {
        // Spinning stars or swirl eyes
        ctx.beginPath();
        ctx.arc(cx - 5, cy - 2, 2.5, 0, Math.PI * 2);
        ctx.arc(cx + 5, cy - 2, 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Stunned stars circling overhead
        const starAngle = this.time * 5;
        ctx.fillStyle = '#fde047';
        for (let i = 0; i < 3; i++) {
          const sa = starAngle + (i * Math.PI * 2) / 3;
          const sx = cx + Math.cos(sa) * (size * 0.35);
          const sy = cy - size * 0.45 + Math.sin(sa) * 4;
          ctx.beginPath();
          ctx.arc(sx, sy, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        // Slit eyes
        ctx.beginPath();
        ctx.ellipse(cx - 5, cy - 2, 2.8, 3.5, 0, 0, Math.PI * 2);
        ctx.ellipse(cx + 5, cy - 2, 2.8, 3.5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Inner slit pupils
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

    // Subtle character shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(px, py + size * 0.3, size * 0.28, size * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();

    // Cloaked traveler body
    const bodyY = py - bob;
    ctx.fillStyle = player.inGrove ? '#1e3a2e' : '#1e293b';
    ctx.beginPath();
    ctx.arc(px, bodyY, size * 0.26, 0, Math.PI * 2);
    ctx.fill();

    // Hood / Hat
    ctx.fillStyle = player.inGrove ? '#13281f' : '#0f172a';
    ctx.beginPath();
    ctx.arc(px, bodyY - 3, size * 0.2, 0, Math.PI * 2);
    ctx.fill();

    // Facing indicator or scarf
    let lx = px + size * 0.22;
    let ly = bodyY;
    if (player.facing === 'left') {
      lx = px - size * 0.22;
    } else if (player.facing === 'up') {
      ly = bodyY - size * 0.15;
    } else if (player.facing === 'down') {
      ly = bodyY + size * 0.15;
    }

    // Handheld Lantern
    // Lantern frame
    ctx.fillStyle = '#78350f';
    ctx.fillRect(lx - 4, ly - 5, 8, 10);

    // Glowing core of the lantern
    const lanternFuelRatio = player.fuel / player.maxFuel;
    const coreColor = lanternFuelRatio > 0.3 ? '#fef08a' : (lanternFuelRatio > 0.1 ? '#f59e0b' : '#ef4444');
    ctx.fillStyle = coreColor;
    ctx.shadowColor = coreColor;
    ctx.shadowBlur = 10;
    ctx.fillRect(lx - 2.5, ly - 3, 5, 6);
    ctx.shadowBlur = 0;

    // Metal cap & ring
    ctx.fillStyle = '#451a03';
    ctx.fillRect(lx - 4.5, ly - 6.5, 9, 2);
    ctx.fillRect(lx - 4.5, ly + 5, 9, 2);

    ctx.restore();
  }

  renderLightingAndFog(ctx, map, player) {
    const size = this.tileSize;
    const px = player.visualX * size + size / 2;
    const py = player.visualY * size + size / 2;

    // Lantern vision radius in pixels
    let baseTiles = 3.6;
    if (player.fuel <= 20) baseTiles = 2.1;
    else if (player.fuel <= 50) baseTiles = 2.8;

    const flicker = 1.0 + this.flickerOffset;
    const lightRadius = baseTiles * size * flicker;

    // We use a temporary fog canvas mask or compositing
    // Draw darkness across the visible viewport
    const startX = this.camX - 100;
    const startY = this.camY - 100;
    const w = this.canvas.width / this.pixelRatio + 200;
    const h = this.canvas.height / this.pixelRatio + 200;

    // Create radial light gradient
    const lightGrad = ctx.createRadialGradient(px, py, lightRadius * 0.1, px, py, lightRadius);
    lightGrad.addColorStop(0, 'rgba(255, 237, 160, 0.18)');
    lightGrad.addColorStop(0.4, 'rgba(245, 158, 11, 0.08)');
    lightGrad.addColorStop(0.7, 'rgba(13, 27, 42, 0.4)');
    lightGrad.addColorStop(1, 'rgba(6, 10, 15, 0.94)');

    // Overlay soft ambient darkness for revealed tiles not in active sight
    // and pitch darkness for unrevealed tiles
    const startCol = Math.max(0, Math.floor(this.camX / this.tileSize));
    const endCol = Math.min(map.width - 1, Math.ceil((this.camX + this.canvas.width / this.pixelRatio) / this.tileSize));
    const startRow = Math.max(0, Math.floor(this.camY / this.tileSize));
    const endRow = Math.min(map.height - 1, Math.ceil((this.camY + this.canvas.height / this.pixelRatio) / this.tileSize));

    for (let y = startRow; y <= endRow; y++) {
      for (let x = startCol; x <= endCol; x++) {
        const tx = x * size;
        const ty = y * size;

        if (!map.revealed[y][x]) {
          // Complete pitch darkness
          ctx.fillStyle = '#060a0f';
          ctx.fillRect(tx, ty, size, size);
        } else if (!map.visible[y][x]) {
          // Fog of exploration / memory fog
          ctx.fillStyle = 'rgba(7, 12, 18, 0.72)';
          ctx.fillRect(tx, ty, size, size);
        }
      }
    }

    // Warm lantern light glow overlay onto active vision
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const lanternWarmth = ctx.createRadialGradient(px, py, 2, px, py, lightRadius * 0.85);
    const warmthAlpha = player.fuel > 20 ? 0.22 : 0.12;
    lanternWarmth.addColorStop(0, `rgba(251, 191, 36, ${warmthAlpha})`);
    lanternWarmth.addColorStop(0.6, `rgba(217, 119, 6, ${warmthAlpha * 0.4})`);
    lanternWarmth.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = lanternWarmth;
    ctx.beginPath();
    ctx.arc(px, py, lightRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  renderParticles(ctx, particleSystem, map) {
    const size = this.tileSize;

    // Ambient night spores
    for (const s of particleSystem.ambientSpores) {
      const sx = s.x * size;
      const sy = s.y * size;

      // Only draw if within current view
      if (
        sx < this.camX - 20 ||
        sx > this.camX + this.canvas.width / this.pixelRatio + 20 ||
        sy < this.camY - 20 ||
        sy > this.camY + this.canvas.height / this.pixelRatio + 20
      ) {
        continue;
      }

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

    // Deep forest ambient vignette
    const grad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.7);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    grad.addColorStop(1, 'rgba(3, 7, 12, 0.65)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Critical low fuel heartbeat pulse
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
