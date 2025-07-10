import { vec2 } from "gl-matrix";

export namespace SceneBuilder {
  type RequiredKeys = 'player' | 'entities' | 'mirrors'

  type HasAllRequired<T> =
    [RequiredKeys] extends [keyof T] ? true : false

  export type Builder<T extends Partial<Scene.Scene>> = {
    with<K extends keyof Scene.Scene>(
      key: K,
      value: Scene.Scene[K]
    ): Builder<T & Pick<Scene.Scene, K>>;
    addPlayer(position: [number, number]): Builder<T & Pick<Scene.Scene, 'player'>>;
    addEntity(position: [number, number]): Builder<T & Pick<Scene.Scene, 'entities'>>;
    addMirror(start: [number, number], end: [number, number]): Builder<T & Pick<Scene.Scene, 'mirrors'>>;
  } & (HasAllRequired<T> extends true ? {
    build(): Scene.Scene
  } : {})

  export function make(): Builder<{}> {
    const builder = <T extends Partial<Scene.Scene>>(current: T): Builder<T> => {
      const withFn = <K extends keyof Scene.Scene>(
        key: K,
        value: Scene.Scene[K]
      ): Builder<T & Pick<Scene.Scene, K>> => {
        return builder({ ...current, [key]: value }) as Builder<T & Pick<Scene.Scene, K>>
      }

      const addPlayer = (position: vec2): Builder<T & Pick<Scene.Scene, 'player'>> => {
        const p = Scene.player(position);
        return builder({ ...current, player: p }) as Builder<T & Pick<Scene.Scene, 'player'>>;
      };

      const addEntity = (position: vec2): Builder<T & Pick<Scene.Scene, 'entities'>> => {
        const current_entities = current.entities ?? []
        const e = Scene.entity(position, `entity_${current_entities.length + 1}`);
        const entities = [...current_entities, e];
        return builder({ ...current, entities }) as Builder<T & Pick<Scene.Scene, 'entities'>>;
      };

      const addMirror = (start: vec2, end: vec2): Builder<T & Pick<Scene.Scene, 'mirrors'>> => {
        const current_mirrors = current.mirrors ?? []
        const m: Scene.Mirror = { start: vec2.clone(start), end: vec2.clone(end), id: `mirror_${current_mirrors.length + 1}` };
        const mirrors = [...current_mirrors, m];
        return builder({ ...current, mirrors }) as Builder<T & Pick<Scene.Scene, 'mirrors'>>;
      };

      const base = {
        with: withFn,
        addPlayer,
        addEntity,
        addMirror,
      } as Builder<T>

      if ('player' in current && 'entities' in current && 'mirrors' in current) {
        return {
          ...base,
          build: () => ({
            ...current,
          }) as Scene.Scene
        }
      }

      return base
    }

    return builder({})
  }
}

export namespace Scene {
  // Pure declarative scene description - no runtime state
  export interface Scene {
    readonly player: Player;
    readonly entities: Entity[];
    readonly mirrors: Mirror[];
  }

  export type Player = {
    readonly tag: 'player'
    readonly position: vec2
  }

  export function player(position: vec2): Player {
    return {
      tag: 'player',
      position
    }
  }

  export type Entity = {
    readonly tag: 'entity'
    readonly id: string;
    readonly position: vec2
    readonly vertices: [vec2, vec2, vec2]; // For intersection tests
  }

  export function entity([x, y]: vec2, id: string): Entity {
    return {
      tag: 'entity',
      id,
      position: vec2.fromValues(x, y),
      vertices: [
        vec2.fromValues(x, y - ENTITY_SIZE),
        vec2.fromValues(x - ENTITY_SIZE, y + ENTITY_SIZE),
        vec2.fromValues(x + ENTITY_SIZE, y + ENTITY_SIZE)
      ]
    }
  }

  export const PLAYER_RADIUS = 12;
  export const ENTITY_SIZE = 8;
  export const MIRROR_SIZE = 10

  export interface Mirror {
    readonly id: string;
    readonly start: vec2;
    readonly end: vec2;
  }

  export function mirror([x, y]: [number, number], id: string): Mirror {
    return {
      id,
      start: vec2.fromValues(x - MIRROR_SIZE, y),
      end: vec2.fromValues(x + MIRROR_SIZE, y)
    }
  }

  // Pure scene query functions - no mutations
  export function entities(scene: Scene): Entity[] {
    return scene.entities;
  }

  export function findEntity(scene: Scene, entityId: string): Entity | Player | null {
    if (entityId === 'player') return scene.player
    else return scene.entities.find(entity => entity.id === entityId) || null;
  }

  export namespace Presets {
    // Preset scene creators
    export function singleMirror(): Scene.Scene {
      return SceneBuilder
        .make()
        .addPlayer([400, 300])
        .addEntity([350, 250])
        .addMirror([300, 200], [300, 400])
        .build();
    }

    export function twoMirrors(): Scene.Scene {
      return SceneBuilder
        .make()
        .addPlayer([400, 300])
        .addEntity([375, 264])
        .addEntity([400, 250])
        .addMirror([300, 200], [300, 400])
        .addMirror([500, 200], [500, 400])
        .build();
    }

    export function threeMirrors(): Scene.Scene {
      return SceneBuilder
        .make()
        .addPlayer([400, 350])
        .addEntity([375, 264])
        .addEntity([400, 250])
        .addMirror([300, 200], [300, 400])
        .addMirror([300, 200], [500, 200])
        .addMirror([500, 200], [500, 400])
        .build();
    }
  }
}
