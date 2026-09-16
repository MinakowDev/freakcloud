import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { usePlayer } from '../../../entities/player/model/player-context';
import { useLikes } from '../../../entities/track/model/likes-context';
import { useCache } from '../../../entities/track/model/cache-context';
import { useTranslation } from '../../../shared/lib/i18n';
import { useArtist } from '../../../entities/artist/model/artist-context';
import { tauriApi } from '../../../shared/api/tauri-client';
import type { Track } from '../../../entities/track/model/types';
import {
  getVisualGraphData,
  boostNode,
  dampenNode,
  blacklistNode,
  getRecentPlayedTracks,
  extractGenresFromTrack,
  type VisualGraphNode,
  type VisualGraphEdge,
} from '../../../entities/track/lib/taste-graph';
import './InteractiveTasteGraph.css';

interface InteractiveTasteGraphProps {
  onNodeSelect?: (node: VisualGraphNode | null) => void;
}

export const InteractiveTasteGraph: React.FC<InteractiveTasteGraphProps> = ({ onNodeSelect }) => {
  const { messages } = useTranslation();
  const m = messages.taste_profile;
  const { playTrack, setWaveMode } = usePlayer();
  const { likedTracks, soundCloudTracks } = useLikes();
  const { cachedTracks } = useCache();
  const { openArtist } = useArtist();

  // Combine user tracks across likes, cache, soundcloud and recent listening history
  const allUserTracks = useMemo(() => {
    const map = new Map<number, Track>();
    const recents = getRecentPlayedTracks();
    [...likedTracks, ...cachedTracks, ...soundCloudTracks, ...recents].forEach((t) => {
      if (t && t.id) {
        map.set(t.id, t);
      }
    });
    return Array.from(map.values());
  }, [likedTracks, cachedTracks, soundCloudTracks]);

  const likedTrackIds = useMemo(() => {
    return new Set(likedTracks.map((t) => t.id));
  }, [likedTracks]);

  // Artist Avatars: map lowercased artist name -> artwork url
  const [asyncAvatars, setAsyncAvatars] = useState<Map<string, string>>(() => new Map());

  const artistAvatarMap = useMemo(() => {
    const map = new Map<string, string>();
    allUserTracks.forEach((t) => {
      if (t?.artist && t?.artwork_url) {
        const lower = t.artist.trim().toLowerCase();
        if (!map.has(lower)) {
          map.set(lower, t.artwork_url.replace('-large.', '-t500x500.'));
        }
      }
    });
    asyncAvatars.forEach((url, name) => {
      if (!map.has(name)) {
        map.set(name, url);
      }
    });
    return map;
  }, [allUserTracks, asyncAvatars]);

  const artistAvatarMapRef = useRef(artistAvatarMap);
  artistAvatarMapRef.current = artistAvatarMap;

  // Cache for loaded HTMLImageElement instances used in canvas render loop
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Graph state in physics memory
  const nodesRef = useRef<VisualGraphNode[]>([]);
  const edgesRef = useRef<VisualGraphEdge[]>([]);

  // Camera state
  const cameraRef = useRef({
    scale: 1.0,
    panX: 0,
    panY: 0,
    isDraggingCanvas: false,
    dragStartX: 0,
    dragStartY: 0,
    draggedNodeId: null as string | null,
    hoveredNodeId: null as string | null,
  });

  const isSleepingRef = useRef<boolean>(false);
  const wakeUpRef = useRef<() => void>(() => {});

  const [scaleDisplay, setScaleDisplay] = useState(1.0);
  const [selectedNode, setSelectedNode] = useState<VisualGraphNode | null>(null);
  const [isPhysicsActive, setIsPhysicsActive] = useState(true);
  const [isLaunchingWave, setIsLaunchingWave] = useState(false);

  // Asynchronously resolve avatars for artist nodes missing in local tracks
  useEffect(() => {
    const missingArtists = nodesRef.current
      .filter((n) => n.type === 'artist' && !artistAvatarMap.has(n.name.trim().toLowerCase()))
      .map((n) => n.name.trim());

    if (missingArtists.length === 0) return;

    let isMounted = true;
    missingArtists.slice(0, 8).forEach((artistName) => {
      tauriApi
        .searchTracks(artistName, 1)
        .then((tracks) => {
          if (!isMounted || !tracks || tracks.length === 0) return;
          const match = tracks.find((t) => Boolean(t.artwork_url));
          const artwork = match?.artwork_url;
          if (artwork) {
            setAsyncAvatars((prev) => {
              const next = new Map(prev);
              next.set(artistName.toLowerCase(), artwork.replace('-large.', '-t500x500.'));
              return next;
            });
          }
        })
        .catch(() => {});
    });

    return () => {
      isMounted = false;
    };
  }, [artistAvatarMap]);

  // 1. Initialize graph data from user tastes
  const reloadData = useCallback(() => {
    const combinedTracks = [...likedTracks, ...cachedTracks];
    const { nodes, edges } = getVisualGraphData(combinedTracks);

    // Retain existing positions if already initialized
    const existingMap = new Map(nodesRef.current.map((n) => [n.id, n]));
    const canvas = canvasRef.current;
    const rect = canvas?.getBoundingClientRect();
    const cx = rect ? rect.width / 2 : 400;
    const cy = rect ? rect.height / 2 : 155;

    nodesRef.current = nodes.map((n, i) => {
      const radius = n.type === 'artist' ? Math.max(16, Math.min(26, n.radius * 1.35)) : n.radius;
      const existing = existingMap.get(n.id);
      if (existing && existing.x !== undefined && existing.y !== undefined) {
        return { ...n, radius, x: existing.x, y: existing.y, vx: existing.vx || 0, vy: existing.vy || 0 };
      }
      // Distribute radially around center
      if (n.type === 'user') {
        return { ...n, radius, x: cx, y: cy, vx: 0, vy: 0 };
      }
      const angle = (i / Math.max(1, nodes.length)) * Math.PI * 2 + Math.random() * 0.4;
      const dist = n.type === 'genre' ? 70 + Math.random() * 35 : 120 + Math.random() * 45;
      return {
        ...n,
        radius,
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist,
        vx: (Math.random() - 0.5) * 0.6,
        vy: (Math.random() - 0.5) * 0.6,
      };
    });

    edgesRef.current = edges;
  }, [likedTracks, cachedTracks]);

  useEffect(() => {
    reloadData();
  }, [reloadData]);

  // 2. Physics & Canvas Render Loop with ResizeObserver
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const updateDimensions = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const targetW = Math.round(rect.width * dpr);
      const targetH = Math.round(rect.height * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
    };
    updateDimensions();

    const ro = new ResizeObserver(() => {
      updateDimensions();
      wakeUpRef.current();
    });
    ro.observe(canvas);

    // Prevent page scrolling when zooming inside graph canvas
    const handleNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
      const newScale = Math.max(0.25, Math.min(3.5, cameraRef.current.scale * zoomFactor));
      cameraRef.current.scale = newScale;
      setScaleDisplay(Math.round(newScale * 100) / 100);
      wakeUpRef.current();
    };

    canvas.addEventListener('wheel', handleNativeWheel, { passive: false });

    const render = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);

      const { scale, panX, panY, hoveredNodeId } = cameraRef.current;
      const cx = w / 2;
      const cy = h / 2;

      // Apply camera transform: centered zoom
      ctx.translate(cx + panX, cy + panY);
      ctx.scale(scale, scale);
      ctx.translate(-cx, -cy);

      // Draw CAD background grid
      const gridSize = 60;
      const startX = cx - 500;
      const endX = cx + 500;
      const startY = cy - 400;
      const endY = cy + 400;

      ctx.beginPath();
      for (let gx = startX; gx <= endX; gx += gridSize) {
        ctx.moveTo(gx, startY);
        ctx.lineTo(gx, endY);
      }
      for (let gy = startY; gy <= endY; gy += gridSize) {
        ctx.moveTo(startX, gy);
        ctx.lineTo(endX, gy);
      }
      ctx.strokeStyle = '#0a0a0a';
      ctx.lineWidth = 1;
      ctx.stroke();

      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      const nodeMap = new Map(nodes.map((n) => [n.id, n]));
      let maxMovement = 0;

      // Physics update (if active)
      if (isPhysicsActive) {
        const kRepel = 2400;
        const springK = 0.015;
        const damping = 0.88;

        // Repulsion between nodes
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const n1 = nodes[i];
            const n2 = nodes[j];
            if (!n1.x || !n1.y || !n2.x || !n2.y) continue;

            const dx = n2.x - n1.x;
            const dy = n2.y - n1.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const minAllowed = n1.radius + n2.radius + 8;

            if (dist < 320) {
              const force = (kRepel / (dist * dist)) * (dist < minAllowed ? 2.5 : 1);
              const fx = (dx / dist) * force;
              const fy = (dy / dist) * force;

              if (n1.type !== 'user' && cameraRef.current.draggedNodeId !== n1.id) {
                n1.vx = (n1.vx || 0) - fx;
                n1.vy = (n1.vy || 0) - fy;
              }
              if (n2.type !== 'user' && cameraRef.current.draggedNodeId !== n2.id) {
                n2.vx = (n2.vx || 0) + fx;
                n2.vy = (n2.vy || 0) + fy;
              }
            }
          }
        }

        // Attraction along edges (springs)
        edges.forEach((e) => {
          const src = nodeMap.get(e.source);
          const tgt = nodeMap.get(e.target);
          if (!src || !tgt || !src.x || !src.y || !tgt.x || !tgt.y) return;

          const dx = tgt.x - src.x;
          const dy = tgt.y - src.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const restLen = src.type === 'user' ? 75 : 50;
          const delta = dist - restLen;
          const force = delta * springK * (e.weight || 0.5);

          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

          if (src.type !== 'user' && cameraRef.current.draggedNodeId !== src.id) {
            src.vx = (src.vx || 0) + fx;
            src.vy = (src.vy || 0) + fy;
          }
          if (tgt.type !== 'user' && cameraRef.current.draggedNodeId !== tgt.id) {
            tgt.vx = (tgt.vx || 0) - fx;
            tgt.vy = (tgt.vy || 0) - fy;
          }
        });

        // Centering gravity towards (cx, cy) and track kinetic movement
        nodes.forEach((n) => {
          if (n.type === 'user') {
            n.x = cx;
            n.y = cy;
            return;
          }
          if (cameraRef.current.draggedNodeId === n.id) return;

          const gDx = cx - (n.x || cx);
          const gDy = cy - (n.y || cy);
          n.vx = ((n.vx || 0) + gDx * 0.001) * damping;
          n.vy = ((n.vy || 0) + gDy * 0.001) * damping;

          const mv = Math.abs(n.vx || 0) + Math.abs(n.vy || 0);
          if (mv > maxMovement) {
            maxMovement = mv;
          }

          n.x = (n.x || cx) + (n.vx || 0);
          n.y = (n.y || cy) + (n.vy || 0);
        });
      }

      // Draw Edges (hairline, high contrast)
      edges.forEach((e) => {
        const src = nodeMap.get(e.source);
        const tgt = nodeMap.get(e.target);
        if (!src || !tgt || src.x === undefined || tgt.x === undefined) return;

        const isHighlighted =
          hoveredNodeId === src.id ||
          hoveredNodeId === tgt.id ||
          selectedNode?.id === src.id ||
          selectedNode?.id === tgt.id;

        ctx.beginPath();
        ctx.moveTo(src.x, src.y!);
        ctx.lineTo(tgt.x, tgt.y!);

        if (isHighlighted) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.2;
        } else {
          ctx.strokeStyle = '#1a1a1a';
          ctx.lineWidth = 0.8;
        }
        ctx.stroke();
      });

      // Draw Nodes (Precision Audio Industrial Monochrome)
      nodes.forEach((n) => {
        if (n.x === undefined || n.y === undefined) return;

        const isHovered = hoveredNodeId === n.id;
        const isSelected = selectedNode?.id === n.id;
        const r = isHovered || isSelected ? n.radius * 1.15 : n.radius;

        if (n.type === 'user') {
          // Center user core: Solid white + outer concentric hairline ring
          ctx.beginPath();
          ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.fill();

          ctx.beginPath();
          ctx.arc(n.x, n.y, r + 6, 0, Math.PI * 2);
          ctx.strokeStyle = '#333333';
          ctx.lineWidth = 1;
          ctx.stroke();
        } else if (n.type === 'genre') {
          // Genre nodes: High contrast white circle
          ctx.beginPath();
          ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
          ctx.fillStyle = isSelected ? '#ffffff' : isHovered ? '#e4e4e7' : '#d4d4d8';
          ctx.fill();

          ctx.beginPath();
          ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
          ctx.strokeStyle = isSelected ? '#ffffff' : '#1a1a1a';
          ctx.lineWidth = isSelected ? 2 : 1;
          ctx.stroke();
        } else {
          // Artist nodes: Render cropped circular artist photo with tactile ring
          const avatarUrl = artistAvatarMapRef.current.get(n.name.trim().toLowerCase());
          let drawnImage = false;

          if (avatarUrl) {
            let img = imageCacheRef.current.get(avatarUrl);
            if (!img) {
              img = new Image();
              img.crossOrigin = 'anonymous';
              img.src = avatarUrl;
              imageCacheRef.current.set(avatarUrl, img);
            }

            if (img.complete && img.naturalWidth > 0) {
              ctx.save();
              ctx.beginPath();
              ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
              ctx.clip();
              ctx.drawImage(img, n.x - r, n.y - r, r * 2, r * 2);
              ctx.restore();
              drawnImage = true;
            }
          }

          if (!drawnImage) {
            // Fallback: Slate circle with first letter watermark
            ctx.beginPath();
            ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
            ctx.fillStyle = isSelected ? '#3f3f46' : isHovered ? '#27272a' : '#18181b';
            ctx.fill();

            ctx.font = `600 ${Math.round(r * 0.85)}px ui-monospace, SFMono-Regular, monospace`;
            ctx.fillStyle = isSelected ? '#ffffff' : isHovered ? '#a1a1aa' : '#52525b';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(n.name.charAt(0).toUpperCase(), n.x, n.y);
          }

          // Outer ring border
          ctx.beginPath();
          ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
          ctx.strokeStyle = isSelected
            ? '#ffffff'
            : isHovered
            ? '#f7e479'
            : 'rgba(255, 255, 255, 0.25)';
          ctx.lineWidth = isSelected ? 2.5 : isHovered ? 2 : 1;
          ctx.stroke();
        }

        // Node Label in JetBrains Mono / Technical font
        if (scale > 0.45 || isHovered || isSelected || n.type === 'genre') {
          ctx.font = `${isHovered || isSelected ? '600 11px' : '500 10px'} ui-monospace, SFMono-Regular, "JetBrains Mono", monospace`;
          ctx.fillStyle = isSelected ? '#ffffff' : isHovered ? '#e4e4e7' : '#71717a';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(n.name, n.x, n.y + r + 4);
        }
      });

      ctx.restore();

      // Kinetic Energy Sleep Algorithm:
      // When node movement is below threshold (< 0.025) and no active user drag/pan is ongoing
      const isInteracting = cameraRef.current.isDraggingCanvas || !!cameraRef.current.draggedNodeId;
      if (isPhysicsActive && !isInteracting && maxMovement < 0.025) {
        isSleepingRef.current = true;
        animId = 0;
        return; // Physics converged: enter sleep mode (0.0% CPU/GPU cycles)
      }

      isSleepingRef.current = false;
      animId = requestAnimationFrame(render);
    };

    const wakeUp = () => {
      if (isSleepingRef.current || animId === 0) {
        isSleepingRef.current = false;
        if (animId) cancelAnimationFrame(animId);
        animId = requestAnimationFrame(render);
      }
    };
    wakeUpRef.current = wakeUp;

    render();

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
      canvas.removeEventListener('wheel', handleNativeWheel);
    };
  }, [isPhysicsActive, selectedNode]);

  // 3. Mouse Interaction (Pan, Zoom, Drag Node, Select Node)
  const screenToWorld = useCallback((screenX: number, screenY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    const { scale, panX, panY } = cameraRef.current;
    const cx = w / 2;
    const cy = h / 2;

    const x = (screenX - rect.left - cx - panX) / scale + cx;
    const y = (screenY - rect.top - cy - panY) / scale + cy;
    return { x, y };
  }, []);

  const findNodeAt = useCallback((worldX: number, worldY: number) => {
    for (let i = nodesRef.current.length - 1; i >= 0; i--) {
      const n = nodesRef.current[i];
      if (n.x === undefined || n.y === undefined) continue;
      const dx = worldX - n.x;
      const dy = worldY - n.y;
      if (dx * dx + dy * dy <= (n.radius + 6) * (n.radius + 6)) {
        return n;
      }
    }
    return null;
  }, []);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    wakeUpRef.current();
    const world = screenToWorld(e.clientX, e.clientY);
    const clickedNode = findNodeAt(world.x, world.y);

    if (clickedNode) {
      cameraRef.current.draggedNodeId = clickedNode.id;
      setSelectedNode(clickedNode);
      if (onNodeSelect) onNodeSelect(clickedNode);
    } else {
      cameraRef.current.isDraggingCanvas = true;
      cameraRef.current.dragStartX = e.clientX - cameraRef.current.panX;
      cameraRef.current.dragStartY = e.clientY - cameraRef.current.panY;
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const cam = cameraRef.current;
    const world = screenToWorld(e.clientX, e.clientY);

    // Drag node
    if (cam.draggedNodeId) {
      wakeUpRef.current();
      const node = nodesRef.current.find((n) => n.id === cam.draggedNodeId);
      if (node) {
        node.x = world.x;
        node.y = world.y;
        node.vx = 0;
        node.vy = 0;
      }
      return;
    }

    // Drag canvas (Pan)
    if (cam.isDraggingCanvas) {
      wakeUpRef.current();
      cam.panX = e.clientX - cam.dragStartX;
      cam.panY = e.clientY - cam.dragStartY;
      return;
    }

    // Hover detection
    const hovered = findNodeAt(world.x, world.y);
    const newHoveredId = hovered ? hovered.id : null;
    if (cam.hoveredNodeId !== newHoveredId) {
      cam.hoveredNodeId = newHoveredId;
      wakeUpRef.current();
    }
  };

  const handleMouseUp = () => {
    wakeUpRef.current();
    cameraRef.current.isDraggingCanvas = false;
    cameraRef.current.draggedNodeId = null;
  };

  // Zoom Toolbar Handlers
  const handleZoomIn = () => {
    const newScale = Math.min(3.5, cameraRef.current.scale * 1.25);
    cameraRef.current.scale = newScale;
    setScaleDisplay(Math.round(newScale * 100) / 100);
  };

  const handleZoomOut = () => {
    const newScale = Math.max(0.25, cameraRef.current.scale * 0.8);
    cameraRef.current.scale = newScale;
    setScaleDisplay(Math.round(newScale * 100) / 100);
  };

  const handleZoomReset = () => {
    cameraRef.current.scale = 1.0;
    cameraRef.current.panX = 0;
    cameraRef.current.panY = 0;
    setScaleDisplay(1.0);
  };

  // Find up to 3 listened tracks matching the inspected vertex
  const nodeTracks = useMemo(() => {
    if (!selectedNode) return [];
    const query = selectedNode.name.toLowerCase();

    if (selectedNode.type === 'artist') {
      return allUserTracks
        .filter((t) => t.artist && t.artist.toLowerCase() === query)
        .slice(0, 3);
    }

    if (selectedNode.type === 'genre') {
      return allUserTracks
        .filter((t) => {
          const genres = extractGenresFromTrack(t);
          return (
            genres.some((g) => g.toLowerCase() === query) ||
            (t.genre && t.genre.toLowerCase().includes(query))
          );
        })
        .slice(0, 3);
    }

    // Core user node: top 3 tracks
    return allUserTracks.slice(0, 3);
  }, [selectedNode, allUserTracks]);

  // Action handlers for selected node
  const handleBoost = () => {
    if (!selectedNode || selectedNode.type === 'user') return;
    boostNode(selectedNode.type, selectedNode.name);
    reloadData();
  };

  const handleDampen = () => {
    if (!selectedNode || selectedNode.type === 'user') return;
    dampenNode(selectedNode.type, selectedNode.name);
    reloadData();
  };

  const handleBlacklist = () => {
    if (!selectedNode || selectedNode.type === 'user') return;
    blacklistNode(selectedNode.type, selectedNode.name);
    setSelectedNode(null);
    reloadData();
  };

  // Launch Personal Wave seeded by this node
  const handlePlayWaveForNode = async () => {
    if (!selectedNode || selectedNode.type === 'user') return;
    try {
      setIsLaunchingWave(true);
      const query = selectedNode.name;
      const tracks = await tauriApi.searchTracks(query, 25);
      if (tracks.length > 0) {
        await playTrack(tracks[0], tracks);
        setWaveMode(true);
      }
    } catch (err) {
      console.error('[InteractiveTasteGraph] Failed to launch wave for node:', err);
    } finally {
      setIsLaunchingWave(false);
    }
  };

  return (
    <div className="interactive-taste-graph">
      {/* Floating View Controls */}
      <div className="itg-toolbar">
        <button
          type="button"
          onClick={handleZoomIn}
          className="itg-tool-btn"
          title={m.zoom_in || 'Приблизить'}
        >
          <i className="ri-zoom-in-line" />
        </button>
        <button
          type="button"
          onClick={handleZoomOut}
          className="itg-tool-btn"
          title={m.zoom_out || 'Отдалить'}
        >
          <i className="ri-zoom-out-line" />
        </button>
        <button
          type="button"
          onClick={handleZoomReset}
          className="itg-tool-btn"
          title={m.zoom_fit || 'Центрировать 100%'}
        >
          <i className="ri-aspect-ratio-line" />
        </button>
        <span className="itg-zoom-label">{Math.round(scaleDisplay * 100)}%</span>
        <button
          type="button"
          onClick={() => setIsPhysicsActive(!isPhysicsActive)}
          className={`itg-tool-btn ${isPhysicsActive ? 'itg-tool-btn--active' : ''}`}
          title={isPhysicsActive ? (m.pause_physics || 'Пауза') : (m.resume_physics || 'Физика')}
        >
          <i className={isPhysicsActive ? 'ri-pause-line' : 'ri-play-line'} />
        </button>
      </div>

      {/* Main Canvas */}
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />

      {/* Node Details Inspector (Tactile Neumorphic) */}
      {selectedNode && (
        <div className="itg-inspector">
          <div className="itg-inspector__header">
            <div>
              <span className="itg-inspector__badge">
                {selectedNode.type === 'genre'
                  ? (m.node_genre || 'Микрожанр')
                  : selectedNode.type === 'artist'
                    ? (m.node_artist || 'Исполнитель')
                    : (m.node_user || 'Центр вкуса')}
              </span>
              {selectedNode.type === 'artist' ? (
                <button
                  type="button"
                  onClick={() => openArtist(selectedNode.name)}
                  className="itg-inspector__title itg-inspector__title--clickable hover:underline hover:text-white text-left transition-colors flex items-center gap-1.5 focus:outline-none"
                  title={messages.artist?.open_card_hint || 'Открыть карточку артиста'}
                >
                  <span>{selectedNode.name}</span>
                  <i className="ri-arrow-right-up-line text-xs opacity-60" />
                </button>
              ) : (
                <h4 className="itg-inspector__title">{selectedNode.name}</h4>
              )}
            </div>
            <button
              type="button"
              className="itg-inspector__close"
              onClick={() => setSelectedNode(null)}
              title={messages.auth?.cancel || 'Закрыть'}
            >
              <i className="ri-close-line" />
            </button>
          </div>

          {selectedNode.type !== 'user' && (
            <>
              <div className="itg-inspector__stats">
                <div className="itg-inspector__stat-item">
                  <span className="itg-inspector__stat-value">{selectedNode.weight}</span>
                  <span className="itg-inspector__stat-label">{m.weight_label || 'Вес'}</span>
                </div>
                <div className="itg-inspector__stat-item">
                  <span className="itg-inspector__stat-value">{selectedNode.listenCount}</span>
                  <span className="itg-inspector__stat-label">{m.tracks_label || 'Треков'}</span>
                </div>
                <div className="itg-inspector__stat-item">
                  <span className="itg-inspector__stat-value">{selectedNode.likeCount}</span>
                  <span className="itg-inspector__stat-label">{m.likes_label || 'Лайков'}</span>
                </div>
              </div>

              {/* Listened Tracks Preview (up to 3) */}
              {nodeTracks.length > 0 && (
                <div className="itg-inspector__tracks">
                  <span className="itg-inspector__section-label">
                    {m.listened_tracks || 'Прослушано'} [{nodeTracks.length}]
                  </span>
                  <div className="itg-inspector__track-list">
                    {nodeTracks.map((track) => (
                      <div
                        key={track.id}
                        className="itg-track-row"
                        onClick={() => playTrack(track, nodeTracks)}
                        title={`Воспроизвести: ${track.title}`}
                      >
                        <div className="itg-track-row__cover">
                          {track.artwork_url ? (
                            <img src={track.artwork_url} alt="" className="itg-track-row__img" />
                          ) : (
                            <i className="ri-music-2-line itg-track-row__icon" />
                          )}
                          <div className="itg-track-row__play-overlay">
                            <i className="ri-play-fill" />
                          </div>
                        </div>
                        <div className="itg-track-row__info">
                          <span className="itg-track-row__title">{track.title}</span>
                          {track.artist ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openArtist(track.artist);
                              }}
                              className="itg-track-row__artist hover:underline hover:text-white text-left transition-colors focus:outline-none"
                              title={`Открыть карточку артиста: ${track.artist}`}
                            >
                              {track.artist}
                            </button>
                          ) : null}
                        </div>
                        {likedTrackIds.has(track.id) && (
                          <i className="ri-heart-fill itg-track-row__liked" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="itg-inspector__actions">
                <button
                  type="button"
                  className="itg-btn-neu itg-btn-neu--wave"
                  onClick={handlePlayWaveForNode}
                  disabled={isLaunchingWave}
                  title={m.wave_tooltip || m.play_wave || 'Запустить волну'}
                >
                  <i className={`ri-play-fill ${isLaunchingWave ? 'animate-spin' : ''}`} />
                  <span>{isLaunchingWave ? '...' : (m.wave_btn || 'Волна')}</span>
                </button>

                {selectedNode.type === 'artist' && (
                  <button
                    type="button"
                    className="itg-btn-neu itg-btn-neu--icon"
                    onClick={() => openArtist(selectedNode.name)}
                    title={messages.artist?.card_title || 'Карточка артиста'}
                  >
                    <i className="ri-user-star-line text-zinc-300" />
                  </button>
                )}

                <button
                  type="button"
                  className="itg-btn-neu itg-btn-neu--icon"
                  onClick={handleBoost}
                  title={m.boost_tooltip || m.boost || 'Буст (+)'}
                >
                  <i className="ri-arrow-up-line" />
                </button>

                <button
                  type="button"
                  className="itg-btn-neu itg-btn-neu--icon"
                  onClick={handleDampen}
                  title={m.dampen_tooltip || m.dampen || 'Снизить (-)'}
                >
                  <i className="ri-arrow-down-line" />
                </button>

                <button
                  type="button"
                  className="itg-btn-neu itg-btn-neu--icon itg-btn-neu--danger"
                  onClick={handleBlacklist}
                  title={m.blacklist_tooltip || m.blacklist || 'В чёрный список'}
                >
                  <i className="ri-forbid-line" />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
