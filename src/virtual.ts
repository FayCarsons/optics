import { vec2 } from "gl-matrix";
import type { Scene } from "./scene";

export namespace Virtual {
    export interface VirtualImage {
        readonly originalId: string
        readonly originalType: 'player' | 'entity' | 'mirror'
        readonly position: vec2
        readonly bounces: number
        readonly isVisible: boolean
        readonly mirrorChain: string[]
        readonly virtualRoom: number
        readonly mirrorData?: {
            start: vec2
            end: vec2
        }
    }

    function reflectPointAcrossMirror(point: vec2, mirror: Scene.Mirror): vec2 {
        const mirrorDir = vec2.create();
        vec2.sub(mirrorDir, mirror.end, mirror.start);
        vec2.normalize(mirrorDir, mirrorDir);

        const normal = vec2.create();
        vec2.set(normal, -mirrorDir[1], mirrorDir[0]);

        const toPoint = vec2.create();
        vec2.sub(toPoint, point, mirror.start);

        const distanceToMirror = vec2.dot(toPoint, normal);

        const reflected = vec2.create();
        vec2.scaleAndAdd(reflected, point, normal, -2 * distanceToMirror);

        return reflected;
    }

    function reflectMirrorAcrossMirror(mirror: Scene.Mirror, reflectingMirror: Scene.Mirror): Scene.Mirror {
        const reflectedStart = reflectPointAcrossMirror(mirror.start, reflectingMirror);
        const reflectedEnd = reflectPointAcrossMirror(mirror.end, reflectingMirror);

        return {
            id: mirror.id,
            start: reflectedStart,
            end: reflectedEnd
        };
    }

    function isPointInBounds([width, height]: vec2, point: vec2): boolean {
        return point[0] >= -width && point[0] <= width * 2 &&
            point[1] >= -height && point[1] <= height * 2;
    }

    function createVirtualRoom(
        bounds: vec2,
        currentRoomState: { player: Scene.Player; entities: Scene.Entity[]; mirrors: Scene.Mirror[] },
        reflectingMirror: Scene.Mirror,
        roomNumber: number,
        mirrorChain: string[]
    ): VirtualImage[] {
        const virtualImages: VirtualImage[] = [];

        const virtualPlayer = reflectPointAcrossMirror(currentRoomState.player.position, reflectingMirror);
        if (isPointInBounds(bounds, virtualPlayer)) {
            virtualImages.push({
                originalId: 'player',
                originalType: 'player',
                position: virtualPlayer,
                bounces: roomNumber,
                isVisible: true,
                mirrorChain: [...mirrorChain, reflectingMirror.id],
                virtualRoom: roomNumber
            });
        }

        for (const entity of currentRoomState.entities) {
            const virtualEntity = reflectPointAcrossMirror(entity.position, reflectingMirror);
            if (isPointInBounds(bounds, virtualEntity)) {
                virtualImages.push({
                    originalId: entity.id,
                    originalType: 'entity',
                    position: virtualEntity,
                    bounces: roomNumber,
                    isVisible: true,
                    mirrorChain: [...mirrorChain, reflectingMirror.id],
                    virtualRoom: roomNumber
                });
            }
        }

        for (const mirror of currentRoomState.mirrors) {
            const virtualMirror = reflectMirrorAcrossMirror(mirror, reflectingMirror);
            const mirrorCenter = vec2.create();
            vec2.add(mirrorCenter, virtualMirror.start, virtualMirror.end);
            vec2.scale(mirrorCenter, mirrorCenter, 0.5);

            if (isPointInBounds(bounds, virtualMirror.start) || isPointInBounds(bounds, virtualMirror.end) || isPointInBounds(bounds, mirrorCenter)) {
                virtualImages.push({
                    originalId: mirror.id,
                    originalType: 'mirror',
                    position: mirrorCenter,
                    bounces: roomNumber,
                    isVisible: true,
                    mirrorChain: [...mirrorChain, reflectingMirror.id],
                    virtualRoom: roomNumber,
                    mirrorData: {
                        start: vec2.clone(virtualMirror.start),
                        end: vec2.clone(virtualMirror.end)
                    }
                });
            }
        }

        return virtualImages;
    }

    function calculateVirtualRoomsRecursive(
        bounds: vec2,
        currentRoom: { player: Scene.Player; entities: Scene.Entity[]; mirrors: Scene.Mirror[] },
        originalMirrors: Scene.Mirror[],
        roomNumber: number,
        mirrorChain: string[]
    ): VirtualImage[] {
        const virtualImages: VirtualImage[] = [];

        for (const mirror of originalMirrors) {
            if (mirrorChain.includes(mirror.id)) {
                continue;
            }

            const roomImages = createVirtualRoom(bounds, currentRoom, mirror, roomNumber, mirrorChain);
            virtualImages.push(...roomImages);

            const nextRoom = {
                player: {
                    ...currentRoom.player,
                    position: reflectPointAcrossMirror(currentRoom.player.position, mirror)
                },
                entities: currentRoom.entities.map(entity => ({
                    ...entity,
                    position: reflectPointAcrossMirror(entity.position, mirror)
                })),
                mirrors: currentRoom.mirrors.map(m =>
                    reflectMirrorAcrossMirror(m, mirror)
                )
            };

            const nestedImages = calculateVirtualRoomsRecursive(bounds,
                nextRoom,
                originalMirrors,
                roomNumber + 1,
                [...mirrorChain, mirror.id]
            );
            virtualImages.push(...nestedImages);
        }

        return virtualImages;
    }

    export function calculateVirtualImages(scene: Scene.Scene, bounds: vec2): VirtualImage[] {
        const currentRoom = {
            player: scene.player,
            entities: scene.entities,
            mirrors: scene.mirrors
        };

        return calculateVirtualRoomsRecursive(bounds, currentRoom, scene.mirrors, 1, []);
    }
}