import { HasAudioDef } from "../audio.js";
import { EM } from "../entity-manager.js";
import { onInit } from "../init.js";
import { assert } from "../util.js";
const DEFAULT_SOUND_PATH = "assets/sounds/";
export const SoundPaths = [
    "cannonS.mp3",
    "cannonL.mp3",
    "stonebreak.wav",
    "woodbreak.mp3",
];
const SoundLoaderDef = EM.defineComponent("soundLoader", () => {
    return {
        promise: null,
    };
});
export const SoundSetDef = EM.defineComponent("soundSet", (soundSet) => soundSet);
async function loadSoundsData() {
    console.log("loading sound data");
    // TODO(@darzu): PERF. Load on demand instead of all at once
    const soundPromises = SoundPaths.map(async (name) => {
        const path = `${DEFAULT_SOUND_PATH}${name}`;
        // return getBytes(path);
        // Decode asynchronously
        return new Promise((resolve, _) => {
            var request = new XMLHttpRequest();
            request.open("GET", path, true);
            request.responseType = "arraybuffer";
            request.onload = function () {
                new AudioContext().decodeAudioData(request.response, function (buffer) {
                    resolve(buffer);
                });
            };
            request.send();
        });
    });
    const sounds = await Promise.all(soundPromises);
    const set = {};
    for (let i = 0; i < SoundPaths.length; i++) {
        set[SoundPaths[i]] = sounds[i];
    }
    return set;
}
// TODO(@darzu): use registerInit so this only runs if needed
onInit(async (em) => {
    em.addResource(SoundLoaderDef);
    console.log("awaiting has audio");
    await em.whenResources(HasAudioDef);
    console.log("have audio");
    // start loading of sounds
    const { soundLoader } = await em.whenResources(SoundLoaderDef);
    assert(!soundLoader.promise, "somehow we're double loading sounds");
    const soundsPromise = loadSoundsData();
    soundLoader.promise = soundsPromise;
    soundsPromise.then((result) => {
        em.addResource(SoundSetDef, result);
    }, (failureReason) => {
        // TODO(@darzu): fail more gracefully
        throw `Failed to load sounds: ${failureReason}`;
    });
});
//# sourceMappingURL=sound-loader.js.map