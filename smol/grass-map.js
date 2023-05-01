import { EM } from "../entity-manager.js";
import { CY } from "../render/gpu-registry.js";
import { RendererDef } from "../render/renderer-ecs.js";
import { assert } from "../util.js";
import { randColor } from "../utils-game.js";
import { MapsDef } from "./map-loader.js";
import { ScoreDef } from "./score.js";
const WIDTH = 1024;
const HEIGHT = 512;
export const GrassMapTexPtr = CY.createTexture("grassMap", {
    size: [WIDTH, HEIGHT],
    format: "r32float",
});
export const GrassMapDef = EM.defineComponent("grassMap", (name, map) => ({
    name,
    map,
}));
export async function setMap(em, name) {
    const res = await em.whenResources(MapsDef, RendererDef, ScoreDef);
    const map = res.maps[name];
    let buf = map.bytes;
    // yikes
    // buf = buf.slice(0x8a);
    // const view = new Uint32Array(buf.buffer);
    // assert(view.length === WIDTH * HEIGHT, "map has bad size");
    assert(buf.length === WIDTH * HEIGHT * 4, "map has bad size");
    assert(map.width === WIDTH, `map.width: ${map.width}`);
    assert(map.height === HEIGHT, `map.height: ${map.height}`);
    const W = 2;
    const texBuf = new Float32Array(map.width * map.height);
    let totalPurple = 0;
    for (let x = 0; x < map.width; x += 1) {
        for (let y = 0; y < map.height; y += 1) {
            const rIdx = x * 4 + y * map.width * 4;
            const r = buf[rIdx + 0];
            const g = buf[rIdx + 1];
            const b = buf[rIdx + 2];
            // console.log(r, g, b);
            // note: we flip y b/c we're mapping to x/z
            const outIdx = x + (map.height - 1 - y) * map.width;
            // TODO(@darzu): texture should probably be ints
            // r,g,b each range from 0-255
            if (x <= W ||
                y <= W ||
                x >= map.width - 1 - W ||
                y >= map.height - 1 - W) {
                texBuf[outIdx] = 1.0;
            }
            else if (g > 100) {
                texBuf[outIdx] = 0.0;
            }
            else if (r > 100 && b > 100) {
                texBuf[outIdx] = 0.5;
                totalPurple++;
            }
            else if (r > 100) {
                texBuf[outIdx] = 1.0;
            }
        }
    }
    const texResource = res.renderer.renderer.getCyResource(GrassMapTexPtr);
    texResource.queueUpdate(texBuf);
    const grassMap = em.ensureResource(GrassMapDef, name, texBuf);
    res.score.totalPurple = totalPurple;
    res.score.cutPurple = 0;
    grassMap.map = texBuf;
    grassMap.name = name;
    // set random secondary/teriary colors
    const purpleness = (c) => c[0] * c[2];
    let secColor = randColor();
    while (purpleness(secColor) > 0.05)
        secColor = randColor();
    let terColor = randColor();
    while (purpleness(terColor) > 0.05)
        terColor = randColor();
    // secColor = V(1, 1, 1);
    res.renderer.renderer.updateScene({
        secColor,
        terColor,
    });
}
//# sourceMappingURL=grass-map.js.map