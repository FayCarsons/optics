import { Lesson } from './lesson.js';
import { SceneBuilder } from './scene.js';

function main(): void {
    const scene =
        SceneBuilder
            .make()
            .addPlayer([400, 300])
            .addEntity([375, 264])
            .addEntity([400, 250])
            .addMirror([300, 200], [300, 400])
            .addMirror([500, 200], [500, 400])
            .build()

    Lesson.run(scene)
}

document.addEventListener('DOMContentLoaded', main);