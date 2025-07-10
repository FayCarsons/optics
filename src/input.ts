import { vec2 } from 'gl-matrix';
import { Scene } from './scene';

export namespace Input {
  // Drag state for canvas interactions
  export interface DragState {
    entityId: string;
    entityType: 'player' | 'entity'
    startPosition: vec2;
    currentPosition: vec2;
    isDragging: boolean;
  }

  type Preset = 'one_mirror' | 'two_mirrors' | 'three_mirrors'

  // Action types for scene updates
  export type Action =
    | { type: 'ADD_OBJECT' }
    | { type: 'RUN_SIMULATION' }
    | { type: 'REFRESH_SCENE' }
    | { type: 'LOAD_PRESET', preset: Preset }
    | { type: 'MOVE_ENTITY', entityId: string, position: vec2 }
    | { type: 'SELECT_ENTITY', entityId: string }
    | { type: 'DESELECT_ALL' }
    | { type: 'START_DRAG', entityId: string, position: vec2 }
    | { type: 'UPDATE_DRAG', position: vec2 }
    | { type: 'END_DRAG' };

  // Input state management
  export interface State {
    dragState: DragState | null;
    selectedEntity: Scene.Entity | Scene.Player | null;
    mousePosition: vec2;
    pendingActions: Action[];
    isMouseDown: boolean;
    showRays: boolean;
    showVirtualImages: boolean;
  }

  interface Config {
    gridSize: number
    snapDistance: number
    validPositions?: vec2[]
  }

  const CLICK_RADIUS = 20


  // Input system class
  export class Handler {
    private state: State;
    private canvas: HTMLCanvasElement;
    private quantizeConfig: Config;
    private entities: Scene.Entity[] = [];
    private player: Scene.Player | null = null;
    private batchTimer: number | null = null;
    private readonly batchDelayMs = 1; // ~60fps batching

    constructor(canvas: HTMLCanvasElement, private onChange: (actions: Action[]) => void, quantizeConfig: Config = { gridSize: 128, snapDistance: 10 }) {
      this.canvas = canvas;
      this.quantizeConfig = quantizeConfig;
      this.state = {
        dragState: null,
        selectedEntity: null,
        mousePosition: vec2.create(),
        pendingActions: [],
        isMouseDown: false,
        showRays: true,
        showVirtualImages: true
      };

      this.setupEventListeners();
      this.initGUI();
    }

    private setupEventListeners(): void {
      this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
      this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
      this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
      this.canvas.addEventListener('mouseleave', this.handleMouseLeave.bind(this));
    }

    private getCanvasCoordinates(event: MouseEvent): vec2 {
      const rect = this.canvas.getBoundingClientRect();
      return vec2.fromValues(
        event.clientX - rect.left,
        event.clientY - rect.top
      );
    }

    private findEntityAtPosition(position: vec2): Scene.Entity | Scene.Player | null {
      if (this.player) {
        const distance = vec2.distance(position, this.player.position);
        if (distance <= Scene.PLAYER_RADIUS) {
          return this.player;
        }
      }

      // Check entities
      for (const entity of this.entities) {
        const distance = vec2.distance(position, entity.position);
        if (distance <= CLICK_RADIUS) {
          return entity;
        }
      }
      return null;
    }

    private handleMouseDown(event: MouseEvent): void {
      const mousePos = this.getCanvasCoordinates(event);
      vec2.copy(this.state.mousePosition, mousePos);
      this.state.isMouseDown = true;

      const entity = this.findEntityAtPosition(mousePos);
      if (entity) {
        const entityId = entity.tag === 'player' ? 'player' : entity.id;
        this.addAction({ type: 'SELECT_ENTITY', entityId });
        this.addAction({ type: 'START_DRAG', entityId, position: mousePos });
      } else {
        this.addAction({ type: 'DESELECT_ALL' });
      }
    }

    private handleMouseMove(event: MouseEvent): void {
      const mousePos = this.getCanvasCoordinates(event);
      vec2.copy(this.state.mousePosition, mousePos);

      if (this.state.isMouseDown && this.state.dragState) {
        this.addAction({ type: 'UPDATE_DRAG', position: mousePos });
      }
    }

    private handleMouseUp(): void {
      this.state.isMouseDown = false;

      if (this.state.dragState) {
        this.addAction({
          type: 'MOVE_ENTITY',
          entityId: this.state.dragState.entityId,
          position: this.state.mousePosition
        });
        this.addAction({ type: 'END_DRAG' });
      }
    }

    private handleMouseLeave(): void {
      this.state.isMouseDown = false;
      if (this.state.dragState) {
        this.addAction({ type: 'END_DRAG' });
      }
    }

    private addAction(action: Action): void {
      this.state.pendingActions.push(action);
      this.scheduleBatchedOnChange();
    }

    private scheduleBatchedOnChange(): void {
      // Clear existing timer if one is pending
      if (this.batchTimer !== null) {
        clearTimeout(this.batchTimer);
      }

      // Schedule a new batched onChange call
      // For some reason TS thinks this is a NodeJS `Timeout` type, it isn't though it's a number!
      this.batchTimer = setTimeout(() => {
        this.batchTimer = null;

        // Only call onChange if we have pending actions
        if (this.state.pendingActions.length > 0) {
          const actions = [...this.state.pendingActions];
          this.state.pendingActions = []; // Clear actions after copying
          this.onChange(actions);
        }
      }, this.batchDelayMs) as unknown as number
    }

    // GUI button handlers - these should be immediate, not batched
    public addEntity(): void {
      this.addActionImmediate({ type: 'ADD_OBJECT' });
    }

    public runSimulation(): void {
      this.addActionImmediate({ type: 'RUN_SIMULATION' });
    }

    public refreshScene(): void {
      this.addActionImmediate({ type: 'REFRESH_SCENE' });
    }

    public loadPreset(preset: Preset): void {
      this.addActionImmediate({ type: 'LOAD_PRESET', preset });
    }

    // Add action immediately without batching (for buttons and important events)
    private addActionImmediate(action: Action): void {
      this.state.pendingActions.push(action);
      this.flushPendingActions();
    }

    // Update entities for collision detection
    public setEntities(entities: Scene.Entity[], player: Scene.Player): void {
      this.entities = entities;
      this.player = player;
    }

    // Get and clear pending actions (called by main loop)
    public getAndClearActions(): Action[] {
      const actions = [...this.state.pendingActions];
      this.state.pendingActions = [];
      return actions;
    }

    // Force immediate flush of pending actions (useful for urgent events)
    public flushPendingActions(): void {
      if (this.batchTimer !== null) {
        clearTimeout(this.batchTimer);
        this.batchTimer = null;
      }

      if (this.state.pendingActions.length > 0) {
        const actions = [...this.state.pendingActions];
        this.state.pendingActions = [];
        this.onChange(actions);
        actions.forEach(action => this.updateState(action))
      }
    }

    // Update internal state from actions
    public updateState(action: Action): void {
      switch (action.type) {
        case 'SELECT_ENTITY':
          if (action.entityId === 'player') {
            this.state.selectedEntity = this.player;
          } else {
            this.state.selectedEntity = this.entities.find(e => e.id === action.entityId) || null;
          }
          break;

        case 'DESELECT_ALL':
          this.state.selectedEntity = null;
          break;

        case 'START_DRAG':
          this.state.dragState = {
            entityId: action.entityId,
            entityType: action.entityId == 'player' ? 'player' : 'entity',
            startPosition: vec2.clone(action.position),
            currentPosition: vec2.clone(action.position),
            isDragging: true
          };
          break;

        case 'UPDATE_DRAG':
          if (this.state.dragState) {
            vec2.copy(this.state.dragState.currentPosition, action.position);
          }
          break;

        case 'END_DRAG':
          this.state.dragState = null;
          break;
      }
    }

    // Getters for renderer
    public getSelectedEntity(): Scene.Entity | Scene.Player | null {
      return this.state.selectedEntity;
    }

    public getDragState(): DragState | null {
      return this.state.dragState;
    }

    public getMousePosition(): vec2 {
      return this.state.mousePosition;
    }

    // Set valid positions for quantization (for game objectives)
    public setValidPositions(positions: vec2[]): void {
      this.quantizeConfig.validPositions = positions;
    }

    // Preview position during drag (for renderer)
    public getDragPreviewPosition(): vec2 | null {
      return this.state.dragState?.currentPosition ?? null
    }

    // Getters for settings
    public showRays(): boolean {
      return this.state.showRays;
    }

    public showVirtualImages(): boolean {
      return this.state.showVirtualImages;
    }

    public setShowRays(show: boolean): void {
      this.state.showRays = show;
      this.triggerRender(); // Trigger re-render
    }

    public setShowVirtualImages(show: boolean): void {
      this.state.showVirtualImages = show;
      this.triggerRender(); // Trigger re-render
    }

    private triggerRender(): void {
      // Force an immediate render by calling onChange with empty actions
      this.onChange([]);
    }

    // Cleanup method to clear timers
    public destroy(): void {
      if (this.batchTimer !== null) {
        clearTimeout(this.batchTimer);
        this.batchTimer = null;
      }

      // Remove event listeners
      this.canvas.removeEventListener('mousedown', this.handleMouseDown.bind(this));
      this.canvas.removeEventListener('mousemove', this.handleMouseMove.bind(this));
      this.canvas.removeEventListener('mouseup', this.handleMouseUp.bind(this));
      this.canvas.removeEventListener('mouseleave', this.handleMouseLeave.bind(this));
    }

    initGUI(this: Input.Handler): void {
      // Create a simple GUI
      const gui = document.createElement('div');
      gui.className = 'gui-container';

      // First row: main controls and checkboxes
      const firstRow = document.createElement('div');
      firstRow.className = 'gui-row';

      // Add Object button
      const addEntityBtn = document.createElement('button');
      addEntityBtn.className = 'gui-button';
      addEntityBtn.textContent = 'Add Object';
      addEntityBtn.onclick = () => this.addEntity();
      firstRow.appendChild(addEntityBtn);

      // Refresh button
      const refreshBtn = document.createElement('button');
      refreshBtn.className = 'gui-button gui-button-secondary';
      refreshBtn.textContent = 'Refresh Scene';
      refreshBtn.onclick = () => this.refreshScene();
      firstRow.appendChild(refreshBtn);

      // Presets section
      const presetsSection = document.createElement('div');
      presetsSection.className = 'gui-section';

      const presetsLabel = document.createElement('div');
      presetsLabel.className = 'gui-section-label';
      presetsLabel.textContent = 'Presets';
      presetsSection.appendChild(presetsLabel);

      const presetsContent = document.createElement('div');
      presetsContent.className = 'gui-section-content';

      const singleBtn = document.createElement('button');
      singleBtn.className = 'gui-button';
      singleBtn.textContent = 'Single Mirror';
      singleBtn.onclick = () => this.loadPreset('one_mirror');
      presetsContent.appendChild(singleBtn);

      const defaultBtn = document.createElement('button');
      defaultBtn.className = 'gui-button';
      defaultBtn.textContent = 'Two Mirrors';
      defaultBtn.onclick = () => this.loadPreset('two_mirrors');
      presetsContent.appendChild(defaultBtn);

      const uShapeBtn = document.createElement('button');
      uShapeBtn.className = 'gui-button';
      uShapeBtn.textContent = 'Three Mirrors';
      uShapeBtn.onclick = () => this.loadPreset('three_mirrors');
      presetsContent.appendChild(uShapeBtn);

      presetsSection.appendChild(presetsContent);

      // Show Rays checkbox container
      const rayContainer = document.createElement('div');
      rayContainer.className = 'gui-checkbox-container';

      const rayCheckbox = document.createElement('input');
      rayCheckbox.type = 'checkbox';
      rayCheckbox.id = 'show-rays';
      rayCheckbox.className = 'gui-checkbox';
      rayCheckbox.checked = this.state.showRays;
      rayCheckbox.onchange = () => this.setShowRays(rayCheckbox.checked);

      const rayLabel = document.createElement('label');
      rayLabel.htmlFor = 'show-rays';
      rayLabel.className = 'gui-checkbox-label';
      rayLabel.textContent = 'Show Rays';

      rayContainer.appendChild(rayCheckbox);
      rayContainer.appendChild(rayLabel);
      firstRow.appendChild(rayContainer);

      // Show Virtual Images checkbox container
      const virtualContainer = document.createElement('div');
      virtualContainer.className = 'gui-checkbox-container';

      const virtualCheckbox = document.createElement('input');
      virtualCheckbox.type = 'checkbox';
      virtualCheckbox.id = 'show-virtual-images';
      virtualCheckbox.className = 'gui-checkbox';
      virtualCheckbox.checked = this.state.showVirtualImages;
      virtualCheckbox.onchange = () => this.setShowVirtualImages(virtualCheckbox.checked);

      const virtualLabel = document.createElement('label');
      virtualLabel.htmlFor = 'show-virtual-images';
      virtualLabel.className = 'gui-checkbox-label';
      virtualLabel.textContent = 'Show Virtual Images';

      virtualContainer.appendChild(virtualCheckbox);
      virtualContainer.appendChild(virtualLabel);
      firstRow.appendChild(virtualContainer);

      // Add first row to GUI
      gui.appendChild(firstRow);

      // Second row: presets section
      gui.appendChild(presetsSection);

      // Add to page
      document.body.appendChild(gui);
    }
  }
}
