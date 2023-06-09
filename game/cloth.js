import { EM } from "../entity-manager.js";
import { vec3 } from "../gl-matrix.js";
import { PositionDef } from "../physics/transform.js";
import { SyncDef, AuthorityDef, MeDef } from "../net/components.js";
import { FinishedDef } from "../build.js";
import { AssetsDef } from "./assets.js";
import { SpringType, SpringGridDef, ForceDef } from "./spring.js";
import { onInit } from "../init.js";
import { normalizeMesh, unshareProvokingVerticesWithMap, } from "../render/mesh.js";
import { RenderableConstructDef, RenderableDef, } from "../render/renderer-ecs.js";
import { RendererDef } from "../render/renderer-ecs.js";
import { ColorDef } from "../color.js";
export const ClothConstructDef = EM.defineComponent("clothConstruct", (c) => {
    var _a, _b, _c, _d, _e;
    return ({
        location: (_a = c.location) !== null && _a !== void 0 ? _a : vec3.fromValues(0, 0, 0),
        color: (_b = c.color) !== null && _b !== void 0 ? _b : vec3.fromValues(0, 0, 0),
        rows: (_c = c.rows) !== null && _c !== void 0 ? _c : 2,
        columns: (_d = c.columns) !== null && _d !== void 0 ? _d : 2,
        distance: (_e = c.distance) !== null && _e !== void 0 ? _e : 1,
    });
});
export const ClothLocalDef = EM.defineComponent("clothLocal", (posMap) => ({
    posMap: posMap !== null && posMap !== void 0 ? posMap : new Map(),
}));
EM.registerSerializerPair(ClothConstructDef, (clothConstruct, buf) => {
    buf.writeVec3(clothConstruct.location);
    buf.writeVec3(clothConstruct.color);
    buf.writeUint16(clothConstruct.rows);
    buf.writeUint16(clothConstruct.columns);
    buf.writeFloat32(clothConstruct.distance);
}, (clothConstruct, buf) => {
    buf.readVec3(clothConstruct.location);
    buf.readVec3(clothConstruct.color);
    clothConstruct.rows = buf.readUint16();
    clothConstruct.columns = buf.readUint16();
    clothConstruct.distance = buf.readFloat32();
});
function clothMesh(cloth) {
    let x = 0;
    let y = 0;
    let i = 0;
    const pos = [];
    const tri = [];
    const colors = [];
    const lines = [];
    const uvs = [];
    while (y < cloth.rows) {
        if (x == cloth.columns) {
            x = 0;
            y = y + 1;
            continue;
        }
        pos.push(vec3.fromValues(x * cloth.distance, y * cloth.distance, 0));
        uvs.push([x / (cloth.columns - 1), y / (cloth.rows - 1)]);
        // add triangles
        if (y > 0) {
            if (x > 0) {
                // front
                tri.push(vec3.fromValues(i, i - 1, i - cloth.columns));
                colors.push(vec3.fromValues(0, 0, 0));
                // back
                tri.push(vec3.fromValues(i - cloth.columns, i - 1, i));
                colors.push(vec3.fromValues(0, 0, 0));
            }
            if (x < cloth.columns - 1) {
                // front
                tri.push(vec3.fromValues(i, i - cloth.columns, i - cloth.columns + 1));
                colors.push(vec3.fromValues(0, 0, 0));
                // back
                tri.push(vec3.fromValues(i - cloth.columns + 1, i - cloth.columns, i));
                colors.push(vec3.fromValues(0, 0, 0));
            }
        }
        // add lines
        if (x > 0) {
            lines.push([i - 1, i]);
        }
        if (y > 0) {
            lines.push([i - cloth.columns, i]);
        }
        x = x + 1;
        i = i + 1;
    }
    const { mesh, posMap } = unshareProvokingVerticesWithMap({
        pos,
        tri,
        quad: [],
        colors,
        lines,
        uvs,
    });
    return { mesh: normalizeMesh(mesh), posMap };
}
export function callClothSystems(em) {
    em.callSystem("buildCloths");
    em.callSystem("updateClothMesh");
}
onInit((em) => {
    em.registerSystem([ClothConstructDef], [MeDef, AssetsDef], (cloths, res) => {
        for (let cloth of cloths) {
            if (FinishedDef.isOn(cloth))
                continue;
            em.ensureComponentOn(cloth, PositionDef, cloth.clothConstruct.location);
            em.ensureComponentOn(cloth, ColorDef, cloth.clothConstruct.color);
            const { mesh, posMap } = clothMesh(cloth.clothConstruct);
            em.ensureComponentOn(cloth, ClothLocalDef, posMap);
            em.ensureComponentOn(cloth, RenderableConstructDef, mesh);
            em.ensureComponentOn(cloth, SpringGridDef, SpringType.SimpleDistance, cloth.clothConstruct.rows, cloth.clothConstruct.columns, [
                0,
                cloth.clothConstruct.columns - 1,
                cloth.clothConstruct.rows * (cloth.clothConstruct.columns - 1),
                cloth.clothConstruct.rows * cloth.clothConstruct.columns - 1,
            ], cloth.clothConstruct.distance);
            em.ensureComponentOn(cloth, ForceDef);
            em.ensureComponentOn(cloth, AuthorityDef, res.me.pid);
            em.ensureComponentOn(cloth, SyncDef);
            cloth.sync.dynamicComponents = [ClothConstructDef.id];
            cloth.sync.fullComponents = [PositionDef.id, ForceDef.id];
            em.ensureComponentOn(cloth, FinishedDef);
        }
    }, "buildCloths");
    em.registerSystem([ClothConstructDef, ClothLocalDef, SpringGridDef, RenderableDef], [RendererDef], (cloths, { renderer }) => {
        for (let cloth of cloths) {
            // NOTE: this cast is only safe so long as we're sure this mesh isn't being shared
            const m = cloth.renderable.meshHandle.readonlyMesh;
            m.pos.forEach((p, i) => {
                const originalIndex = cloth.clothLocal.posMap.get(i);
                return vec3.copy(p, cloth.springGrid.positions[originalIndex]);
            });
            renderer.renderer.updateMesh(cloth.renderable.meshHandle, m);
        }
    }, "updateClothMesh");
});
//# sourceMappingURL=cloth.js.map