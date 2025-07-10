import { vec2 } from 'gl-matrix';
import { Input } from './input.js';
import { Scene } from './scene.js';
import { Ray } from './ray.js';
import type { Virtual } from './virtual.js';
import { Lesson } from './lesson.js';

export namespace Renderer {
  export interface RenderOptions {
    showRays: boolean;
    showVirtualImages: boolean;
  }

  // Color constants
  const Colors = {
    PLAYER: '#2563eb',          // Dark cool blue
    PLAYER_SELECTED: '#1d4ed8', // Darker blue when selected
    OBJECT: '#dc2626',          // Warm red
    OBJECT_SELECTED: '#b91c1c', // Darker red when selected
    MIRROR: '#a5b4fc',          // Pale blue
    RAY: '#fbbf24',             // Golden yellow
    RAY_FAINT: '#fef3c7',       // Faint yellow for guides
    VIRTUAL_IMAGE: '#6b7280',   // Gray for virtual images
    DRAG_PREVIEW: '#10b981',    // Green for drag preview
    BACKGROUND: '#ffffff',      // White background
    GRID: '#f3f4f6'            // Light gray for grid
  } as const;

  export class Renderer {
    private ctx: CanvasRenderingContext2D;
    private canvas: HTMLCanvasElement;
    private options: RenderOptions;

    constructor(canvas: HTMLCanvasElement, options: Partial<RenderOptions> = {}) {
      this.canvas = canvas;
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Failed to get 2D rendering context');
      }
      this.ctx = context;

      this.options = {
        showRays: true,
        showVirtualImages: true,
        ...options
      };

      this.setupCanvas();
    }

    private setupCanvas(): void {
      // Set canvas size to match CSS size for proper scaling
      const rect = this.canvas.getBoundingClientRect();
      this.canvas.width = rect.width;
      this.canvas.height = rect.height;

      // Set rendering quality
      this.ctx.imageSmoothingEnabled = true;
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';
    }

    public render(
      scene: Lesson.RenderableScene,
      selectedEntity: Scene.Entity | Scene.Player | null = null,
      dragState: Input.DragState | null = null,
      dragPreviewPosition: vec2 | null = null
    ): void {
      this.clearCanvas();

      // Render in order: mirrors, rays, virtual images, objects, player
      this.renderMirrors(scene.mirrors);

      // Always render rays and virtual images if they exist in the scene
      // The scene pipeline controls whether they're computed or not
      this.renderRays(scene.rays);
      this.renderVirtualImages(scene.virtualImages);

      this.renderObjects(scene.entities, selectedEntity);
      this.renderPlayer(scene.player, selectedEntity);

      // Render input feedback
      if (dragState && dragPreviewPosition) {
        this.renderDragPreview(dragState, dragPreviewPosition);
      }
    }

    private clearCanvas(): void {
      this.ctx.fillStyle = Colors.BACKGROUND;
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    private renderPlayer(player: Scene.Player, selectedEntity: Scene.Entity | Scene.Player | null): void {
      const isSelected = selectedEntity?.tag === 'player';

      this.ctx.fillStyle = isSelected ? Colors.PLAYER_SELECTED : Colors.PLAYER;
      this.ctx.strokeStyle = isSelected ? Colors.PLAYER_SELECTED : Colors.PLAYER;
      this.ctx.lineWidth = 2;

      this.ctx.beginPath();
      this.ctx.arc(player.position[0], player.position[1], Scene.PLAYER_RADIUS, 0, 2 * Math.PI);
      this.ctx.fill();

      // Selection indicator
      if (isSelected) {
        this.ctx.strokeStyle = Colors.PLAYER_SELECTED;
        this.ctx.lineWidth = 3;
        this.ctx.setLineDash([5, 5]);
        this.ctx.beginPath();
        this.ctx.arc(player.position[0], player.position[1], Scene.PLAYER_RADIUS + 5, 0, 2 * Math.PI);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
      }
    }

    private renderObjects(objects: Scene.Entity[], selectedEntity: Scene.Entity | Scene.Player | null): void {
      for (const obj of objects) {
        this.renderTriangle(obj, selectedEntity?.tag === 'entity' && selectedEntity?.id === obj.id);
      }
    }

    private renderTriangle(obj: Scene.Entity, isSelected: boolean): void {
      this.ctx.fillStyle = isSelected ? Colors.OBJECT_SELECTED : Colors.OBJECT;
      this.ctx.strokeStyle = isSelected ? Colors.OBJECT_SELECTED : Colors.OBJECT;
      this.ctx.lineWidth = 2;

      const [v0, v1, v2] = obj.vertices;

      this.ctx.beginPath();
      this.ctx.moveTo(v0[0], v0[1]);
      this.ctx.lineTo(v1[0], v1[1]);
      this.ctx.lineTo(v2[0], v2[1]);
      this.ctx.closePath();
      this.ctx.fill();

      // Selection indicator
      if (isSelected) {
        this.ctx.strokeStyle = Colors.OBJECT_SELECTED;
        this.ctx.lineWidth = 3;
        this.ctx.setLineDash([5, 5]);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
      }
    }

    private renderMirrors(mirrors: Scene.Mirror[]): void {
      this.ctx.strokeStyle = Colors.MIRROR;
      this.ctx.lineWidth = 4;
      this.ctx.lineCap = 'round';

      for (const mirror of mirrors) {
        this.ctx.beginPath();
        this.ctx.moveTo(mirror.start[0], mirror.start[1]);
        this.ctx.lineTo(mirror.end[0], mirror.end[1]);
        this.ctx.stroke();
      }
    }

    private renderRays(rays: Ray.Ray[]): void {
      for (const ray of rays) {
        if (ray.history.length < 2) continue; // Skip rays with insufficient history

        const segmentCount = ray.history.length - 1; // Number of segments between points

        // Draw each segment with appropriate styling
        for (let i = 0; i < segmentCount; i++) {
          const isDirectRay = true; // First segment is direct from source

          const color = isDirectRay ? Colors.RAY : Colors.RAY_FAINT;

          this.ctx.strokeStyle = this.addAlpha(color, 1);
          this.ctx.lineWidth = 4;

          // Draw line segment
          this.ctx.beginPath();
          this.ctx.moveTo(ray.history[i][0], ray.history[i][1]);
          this.ctx.lineTo(ray.history[i + 1][0], ray.history[i + 1][1]);
          this.ctx.stroke();
        }

      }
    }

    private renderVirtualImages(virtualImages: Virtual.VirtualImage[]): void {
      for (const image of virtualImages) {
        if (!image.isVisible) continue;

        const alpha = Math.max(0.3, 1 - (image.bounces * 0.1));
        this.ctx.fillStyle = this.addAlpha(Colors.VIRTUAL_IMAGE, alpha);
        this.ctx.strokeStyle = this.addAlpha(Colors.VIRTUAL_IMAGE, alpha);
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([3, 3]);

        if (image.originalType === 'player') {
          // Render virtual player as faded circle
          this.ctx.beginPath();
          this.ctx.arc(image.position[0], image.position[1], Scene.PLAYER_RADIUS, 0, 2 * Math.PI);
          this.ctx.fill();
          this.ctx.stroke();
        } else if (image.originalType === 'entity') {
          // Render virtual entity as faded triangle
          const size = Scene.ENTITY_SIZE;
          const x = image.position[0];
          const y = image.position[1];

          this.ctx.beginPath();
          this.ctx.moveTo(x, y - size);
          this.ctx.lineTo(x - size, y + size);
          this.ctx.lineTo(x + size, y + size);
          this.ctx.closePath();
          this.ctx.fill();
          this.ctx.stroke();
        } else if (image.originalType === 'mirror' && image.mirrorData) {
          // Render virtual mirror as faded line
          this.ctx.lineWidth = 3;
          this.ctx.beginPath();
          this.ctx.moveTo(image.mirrorData.start[0], image.mirrorData.start[1]);
          this.ctx.lineTo(image.mirrorData.end[0], image.mirrorData.end[1]);
          this.ctx.stroke();
        }
      }

      this.ctx.setLineDash([]);
    }

    private renderDragPreview(dragState: Input.DragState, previewPosition: vec2): void {
      this.ctx.fillStyle = this.addAlpha(Colors.DRAG_PREVIEW, 0.7);
      this.ctx.strokeStyle = Colors.DRAG_PREVIEW;
      this.ctx.lineWidth = 2;
      this.ctx.setLineDash([5, 5]);

      // Draw preview based on entity type
      // For now, assume it's a triangle (object)
      const x = previewPosition[0];
      const y = previewPosition[1];

      if (dragState.entityId === 'player') {
        this.ctx.beginPath()
        this.ctx.arc(dragState.currentPosition[0], dragState.currentPosition[1], Scene.PLAYER_RADIUS, 0, 2 * Math.PI);
        this.ctx.stroke()
        this.ctx.closePath()
      } else {
        this.ctx.beginPath();
        this.ctx.moveTo(x, y - Scene.ENTITY_SIZE);
        this.ctx.lineTo(x - Scene.ENTITY_SIZE, y + Scene.ENTITY_SIZE);
        this.ctx.lineTo(x + Scene.ENTITY_SIZE, y + Scene.ENTITY_SIZE);
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.stroke();
      }



      this.ctx.setLineDash([]);
    }

    private addAlpha(color: string, alpha: number): string {
      // Convert hex to rgba
      const hex = color.replace('#', '');
      const r = parseInt(hex.substr(0, 2), 16);
      const g = parseInt(hex.substr(2, 2), 16);
      const b = parseInt(hex.substr(4, 2), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    // Update render options
    public setOptions(options: Partial<RenderOptions>): void {
      this.options = { ...this.options, ...options };
    }

    // Get canvas dimensions
    public getCanvasSize(): { width: number; height: number } {
      return {
        width: this.canvas.width,
        height: this.canvas.height
      };
    }

    // Resize handler
    public resize(): void {
      this.setupCanvas();
    }
  }

  // Factory function for creating renderer
  export function make(canvas: HTMLCanvasElement, options?: Partial<RenderOptions>): Renderer {
    return new Renderer(canvas, options);
  }
}