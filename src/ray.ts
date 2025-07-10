import { vec2 } from "gl-matrix"
import { Scene } from "./scene"

export namespace Ray {
    export type Ray = {
        origin: vec2
        direction: vec2
        history: vec2[]
        entityId?: string
    }

    const EPSILON = 1e-6;
    const MAX_BOUNCES = 10;

    type Intersection = {
        point: vec2;
        distance: number;
        normal: vec2;
        mirrorId?: string;
        entityId?: string;
    };

    function rayLineIntersection(rayOrigin: vec2, rayDirection: vec2, lineStart: vec2, lineEnd: vec2): Intersection | null {
        const lineDir = vec2.create();
        vec2.sub(lineDir, lineEnd, lineStart);

        const rayToLineStart = vec2.create();
        vec2.sub(rayToLineStart, lineStart, rayOrigin);

        const cross1 = rayDirection[0] * lineDir[1] - rayDirection[1] * lineDir[0];

        if (Math.abs(cross1) < EPSILON) {
            return null;
        }

        const cross2 = rayToLineStart[0] * lineDir[1] - rayToLineStart[1] * lineDir[0];
        const t = cross2 / cross1;

        if (t < EPSILON) {
            return null;
        }

        const cross3 = rayToLineStart[0] * rayDirection[1] - rayToLineStart[1] * rayDirection[0];
        const u = cross3 / cross1;

        if (u < 0 || u > 1) {
            return null;
        }

        const intersection = vec2.create();
        vec2.scaleAndAdd(intersection, rayOrigin, rayDirection, t);

        const normal = vec2.create();
        vec2.set(normal, -lineDir[1], lineDir[0]);
        vec2.normalize(normal, normal);

        return {
            point: intersection,
            distance: t,
            normal
        };
    }

    function rayCircleIntersection(rayOrigin: vec2, rayDirection: vec2, center: vec2, radius: number): Intersection | null {
        const toCenter = vec2.create();
        vec2.sub(toCenter, center, rayOrigin);

        const projLength = vec2.dot(toCenter, rayDirection);
        if (projLength < 0) {
            return null;
        }

        const projection = vec2.create();
        vec2.scale(projection, rayDirection, projLength);

        const closestPoint = vec2.create();
        vec2.add(closestPoint, rayOrigin, projection);

        const distanceToCenter = vec2.distance(closestPoint, center);
        if (distanceToCenter > radius) {
            return null;
        }

        const halfChord = Math.sqrt(radius * radius - distanceToCenter * distanceToCenter);
        const intersectionDistance = projLength - halfChord;

        if (intersectionDistance < EPSILON) {
            return null;
        }

        const intersection = vec2.create();
        vec2.scaleAndAdd(intersection, rayOrigin, rayDirection, intersectionDistance);

        const normal = vec2.create();
        vec2.sub(normal, intersection, center);
        vec2.normalize(normal, normal);

        return {
            point: intersection,
            distance: intersectionDistance,
            normal
        };
    }

    function reflect(direction: vec2, normal: vec2): vec2 {
        const reflected = vec2.create();
        const dot = vec2.dot(direction, normal);
        vec2.scaleAndAdd(reflected, direction, normal, -2 * dot);
        return reflected;
    }

    function rayTriangleIntersection(rayOrigin: vec2, rayDirection: vec2, vertices: [vec2, vec2, vec2]): Intersection | null {
        const [v0, v1, v2] = vertices;

        for (let i = 0; i < 3; i++) {
            const edgeStart = vertices[i];
            const edgeEnd = vertices[(i + 1) % 3];

            const edgeIntersection = rayLineIntersection(rayOrigin, rayDirection, edgeStart, edgeEnd);
            if (edgeIntersection) {
                const normal = vec2.create();
                const edge1 = vec2.create();
                const edge2 = vec2.create();
                vec2.sub(edge1, v1, v0);
                vec2.sub(edge2, v2, v0);

                const cross = edge1[0] * edge2[1] - edge1[1] * edge2[0];
                if (cross > 0) {
                    vec2.set(normal, edge2[1] - edge1[1], edge1[0] - edge2[0]);
                } else {
                    vec2.set(normal, edge1[1] - edge2[1], edge2[0] - edge1[0]);
                }
                vec2.normalize(normal, normal);

                return {
                    point: edgeIntersection.point,
                    distance: edgeIntersection.distance,
                    normal
                };
            }
        }

        return null;
    }

    function findNearestIntersection(rayOrigin: vec2, rayDirection: vec2, scene: Scene.Scene, ignorePlayer: boolean = false): Intersection | null {
        let nearest: Intersection | null = null;
        let minDistance = Infinity;

        for (const mirror of scene.mirrors) {
            const intersection = rayLineIntersection(rayOrigin, rayDirection, mirror.start, mirror.end);
            if (intersection && intersection.distance < minDistance) {
                intersection.mirrorId = mirror.id;
                nearest = intersection;
                minDistance = intersection.distance;
            }
        }

        if (!ignorePlayer) {
            const playerIntersection = rayCircleIntersection(rayOrigin, rayDirection, scene.player.position, Scene.PLAYER_RADIUS);
            if (playerIntersection && playerIntersection.distance < minDistance) {
                nearest = playerIntersection;
                minDistance = playerIntersection.distance;
            }
        }

        for (const entity of scene.entities) {
            const entityIntersection = rayTriangleIntersection(rayOrigin, rayDirection, entity.vertices);
            if (entityIntersection && entityIntersection.distance < minDistance) {
                entityIntersection.entityId = entity.id;
                nearest = entityIntersection;
                minDistance = entityIntersection.distance;
            }
        }

        return nearest;
    }

    function traceRay(origin: vec2, direction: vec2, scene: Scene.Scene, maxBounces: number = MAX_BOUNCES): Ray | null {
        const ray: Ray = {
            origin: vec2.clone(origin),
            direction: vec2.clone(direction),
            history: [vec2.clone(origin)]
        };

        let currentOrigin = vec2.clone(origin);
        let currentDirection = vec2.clone(direction);
        let bounces = 0;
        let hitMirror = false;

        while (bounces < maxBounces) {
            const intersection = findNearestIntersection(currentOrigin, currentDirection, scene, true);

            if (!intersection) {
                break;
            }

            ray.history.push(vec2.clone(intersection.point));

            if (intersection.mirrorId) {
                hitMirror = true;
                const reflectedDirection = reflect(currentDirection, intersection.normal);
                currentOrigin = vec2.clone(intersection.point);
                currentDirection = reflectedDirection;
                bounces++;
            } else {
                if (hitMirror && intersection.entityId) {
                    ray.entityId = intersection.entityId;
                    return ray;
                }
                break;
            }
        }

        return null;
    }

    function lastIntersection(ray: Ray): vec2 {
        return ray.history[ray.history.length - 1]
    }

    export function trace(scene: Scene.Scene): Ray[] {
        const rays: Ray[] = [];
        const rayCount = 128;

        for (let i = 0; i < rayCount; i++) {
            const angle = (i / rayCount) * Math.PI * 2;
            const direction = vec2.fromValues(Math.cos(angle), Math.sin(angle));

            const ray = traceRay(scene.player.position, direction, scene);
            if (ray && ray.history.length > 1 && ray.entityId) {
                rays.push(ray);
            }
        }

        // Return only one ray for each entity, have that be the ray which intersects it closest to its center
        return scene.entities.map(entity =>
            rays.filter(ray => ray.entityId === entity.id).sort((rayA, rayB) => {
                const intersectionDistanceA = vec2.dist(lastIntersection(rayA), entity.position)
                const intersectionDistanceB = vec2.dist(lastIntersection(rayB), entity.position)
                return intersectionDistanceA - intersectionDistanceB
            })[0]
        ).filter(Boolean)
    }
}