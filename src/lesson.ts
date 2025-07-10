import { vec2 } from "gl-matrix"
import { Input } from "./input"
import { Renderer } from "./renderer"
import { Scene } from "./scene"
import { Ray } from "./ray"
import { Virtual } from "./virtual"

export namespace Lesson {
    // Runtime state that includes computed rays and virtual images
    export type RenderableScene = Scene.Scene & {
        readonly rays: Ray.Ray[]
        readonly virtualImages: Virtual.VirtualImage[]
    }

    export type Lesson = {
        canvas: HTMLCanvasElement
        scene: Scene.Scene
        inputHandler: Input.Handler
        renderer: Renderer.Renderer
    }

    // Pipeline functions
    export function withRays(scene: Scene.Scene, enabled: boolean): Scene.Scene & { rays: Ray.Ray[] } {
        const rays = enabled ? Ray.trace(scene) : []
        return { ...scene, rays }
    }

    export function withVirtualImages(sceneWithRays: Scene.Scene & { rays: Ray.Ray[] }, bounds: vec2, enabled: boolean): RenderableScene {
        const virtualImages = enabled ? Virtual.calculateVirtualImages(sceneWithRays, bounds) : []
        return { ...sceneWithRays, virtualImages }
    }

    export function processScene(scene: Scene.Scene, bounds: vec2, settings: { showRays: boolean, showVirtualImages: boolean }): RenderableScene {
        const raysAdded = withRays(scene, settings.showRays)
        const virtualImagesAdded = withVirtualImages(raysAdded, bounds, settings.showVirtualImages)
        return virtualImagesAdded
    }

    // Pure scene manipulation functions
    export function moveEntity(scene: Scene.Scene, { entityId, position }: { entityId: string, position: vec2 }): Scene.Scene {
        if (entityId === 'player') {
            return {
                ...scene,
                player: {
                    ...scene.player,
                    position: vec2.clone(position)
                }
            };
        }

        const entityIndex = scene.entities.findIndex(entity => entity.id === entityId);

        if (entityIndex !== -1) {
            const newEntities = [...scene.entities];
            newEntities[entityIndex] = Scene.entity(position, `entity_${scene.entities.length + 1}`);
            return {
                ...scene,
                entities: newEntities
            };
        }

        return scene; // Entity not found, return unchanged
    }

    export function addEntity(scene: Scene.Scene, position: vec2): Scene.Scene {
        const newEntity = Scene.entity(position, `entity_${scene.entities.length + 1}`);

        return {
            ...scene,
            entities: [...scene.entities, newEntity]
        };
    }

    export function run(initialScene: Scene.Scene): void {
        const canvas = document.getElementById('lesson') as HTMLCanvasElement | null
        if (!canvas) {
            alert('Could not find canvas! This should be impossible')
            return
        }

        // Get the actual rendered size from CSS
        const rect = canvas.getBoundingClientRect();
        const bounds = vec2.fromValues(rect.width, rect.height)

        const inputHandler = new Input.Handler(canvas, handleInput)
        const renderer = Renderer.make(canvas)

        let lesson = {
            canvas,
            scene: initialScene,
            inputHandler,
            renderer
        }

        function handleAction(action: Input.Action) {
            switch (action.type) {
                case 'MOVE_ENTITY': {
                    const scene = moveEntity(lesson.scene, action)
                    lesson.inputHandler.setEntities(Scene.entities(scene), scene.player)
                    lesson = { ...lesson, scene }
                    break
                }
                case 'ADD_OBJECT': {
                    const newPosition = vec2.fromValues(400, 250)
                    const scene = addEntity(lesson.scene, newPosition)
                    lesson.inputHandler.setEntities(Scene.entities(scene), scene.player)
                    lesson = { ...lesson, scene }
                    break
                }
                case 'RUN_SIMULATION': {
                    // Scene doesn't change, just reprocess
                    break
                }
                case 'REFRESH_SCENE': {
                    const scene = { ...initialScene }
                    lesson.inputHandler.setEntities(Scene.entities(scene), scene.player)
                    lesson = { ...lesson, scene }
                    break
                }
                case 'LOAD_PRESET': {
                    let scene: Scene.Scene;
                    switch (action.preset) {
                        case 'one_mirror':
                            scene = Scene.Presets.singleMirror();
                            break;
                        case 'two_mirrors':
                            scene = Scene.Presets.twoMirrors();
                            break;
                        case 'three_mirrors':
                            scene = Scene.Presets.threeMirrors();
                            break;
                        default:
                            scene = lesson.scene;
                    }
                    lesson.inputHandler.setEntities(Scene.entities(scene), scene.player)
                    lesson = { ...lesson, scene }
                    break
                }
                case 'SELECT_ENTITY': {
                    // Selection is handled by input handler state
                    break
                }
                case 'DESELECT_ALL': {
                    // Deselection is handled by input handler state
                    break
                }
                case 'START_DRAG': {
                    // Drag start is handled by input handler state
                    break
                }
                case 'UPDATE_DRAG': {
                    // Drag update is handled by input handler state
                    break
                }
                case 'END_DRAG': {
                    // Drag end is handled by input handler state
                    break
                }
                default: {
                    console.error('Unreachable case!', action)
                }
            }
        }

        function handleInput(actions: Input.Action[]) {
            actions.forEach(action => {
                handleAction(action)
                lesson.inputHandler.updateState(action)
            })

            // Process scene through pipeline and render
            const settings = {
                showRays: lesson.inputHandler.showRays(),
                showVirtualImages: lesson.inputHandler.showVirtualImages()
            }
            const renderableScene = processScene(lesson.scene, bounds, settings)

            lesson.renderer.render(
                renderableScene,
                lesson.inputHandler.getSelectedEntity(),
                lesson.inputHandler.getDragState(),
                lesson.inputHandler.getDragPreviewPosition()
            )
        }

        // Initialize input handler with current scene entities
        lesson.inputHandler.setEntities(Scene.entities(lesson.scene), lesson.scene.player)

        // Initial render
        const initialSettings = {
            showRays: lesson.inputHandler.showRays(),
            showVirtualImages: lesson.inputHandler.showVirtualImages()
        }
        const renderable = processScene(lesson.scene, bounds, initialSettings)

        lesson.renderer.render(
            renderable,
            lesson.inputHandler.getSelectedEntity(),
            lesson.inputHandler.getDragState(),
            lesson.inputHandler.getDragPreviewPosition()
        )
    }
}