import { AnimateToDef } from "../animate-to.js";
import { ColorDef } from "../color.js";
import { createRef } from "../em_helpers.js";
import { EM } from "../entity-manager.js";
import { vec3, vec2 } from "../gl-matrix.js";
import { PhysicsParentDef, PositionDef, RotationDef, } from "../physics/transform.js";
import { createTextureReader } from "../render/cpu-texture.js";
import { createJfaPipelines } from "../render/pipelines/std-jump-flood.js";
import { unwrapPipeline, unwrapPipeline2, uvMaskTex, uvToNormTex, uvToPosTex, UVUNWRAP_MASK, } from "../render/pipelines/xp-uv-unwrap.js";
import { RenderableConstructDef, RenderableDef, RenderDataOceanDef, RendererDef, } from "../render/renderer-ecs.js";
import { tempVec2, tempVec3 } from "../temp-pool.js";
import { quatFromUpForward, randNormalVec2, } from "../utils-3d.js";
import { AssetsDef } from "./assets.js";
export const OceanDef = EM.defineComponent("ocean", (o) => {
    return o;
});
export const UVPosDef = EM.defineComponent("uvPos", (uv) => uv !== null && uv !== void 0 ? uv : vec2.create());
EM.registerSerializerPair(UVPosDef, (o, buf) => buf.writeVec2(o), (o, buf) => buf.readVec2(o));
export const UVDirDef = EM.defineComponent("uvDir", (dir) => dir !== null && dir !== void 0 ? dir : vec2.fromValues(0, 1));
EM.registerSerializerPair(UVDirDef, (o, buf) => buf.writeVec2(o), (o, buf) => buf.readVec2(o));
// const BouyDef = EM.defineComponent(
//   "bouy",
//   (uv: vec2 = [0, 0], child?: Ref<[typeof PositionDef]>) => ({
//     uv: uv,
//     child: child ?? createRef(0, [PositionDef]),
//   })
// );
export const oceanJfa = createJfaPipelines(uvMaskTex, "exterior");
export async function initOcean() {
    const res = await EM.whenResources(RendererDef, AssetsDef);
    const ocean = EM.newEntity();
    let oceanEntId = ocean.id; // hacky?
    EM.ensureComponentOn(ocean, RenderableConstructDef, res.assets.ocean.mesh, 
    // TODO(@darzu): needed?
    true, 0, UVUNWRAP_MASK, "ocean");
    EM.ensureComponentOn(ocean, ColorDef, [0.1, 0.3, 0.8]);
    //EM.ensureComponentOn(ocean, PositionDef, [12000, 180, 0]);
    EM.ensureComponentOn(ocean, PositionDef);
    let ocean2 = await EM.whenEntityHas(ocean, RenderableDef, RenderDataOceanDef);
    // TODO(@darzu):
    const preOceanGPU = performance.now();
    res.renderer.renderer.updateOceanUniform(ocean2.renderable.meshHandle, ocean2.renderDataOcean);
    res.renderer.renderer.submitPipelines([ocean2.renderable.meshHandle], 
    // [unwrapPipeline, unwrapPipeline2]
    [unwrapPipeline, unwrapPipeline2, ...oceanJfa.allPipes()]);
    // read from one-time jobs
    // TODO(@darzu): what's the right way to handle these jobs
    const readPromises = [
        res.renderer.renderer.readTexture(uvToPosTex),
        res.renderer.renderer.readTexture(uvToNormTex),
        res.renderer.renderer.readTexture(oceanJfa.sdfTex),
    ];
    const [uvToPosData, uvToNormData, sdfData] = await Promise.all(readPromises);
    const timeOceanGPU = performance.now() - preOceanGPU;
    console.log(`ocean GPU round-trip: ${timeOceanGPU.toFixed(2)}ms`);
    // TODO(@darzu): Account for the 1px border in the texture!!!
    const uvToPosReader = createTextureReader(uvToPosData, uvToPosTex.size, 3, uvToPosTex.format);
    const uvToNormReader = createTextureReader(uvToNormData, uvToNormTex.size, 3, uvToNormTex.format);
    const sdfReader = createTextureReader(sdfData, oceanJfa.sdfTex.size, 1, oceanJfa.sdfTex.format);
    // console.log("adding OceanDef");
    // TODO(@darzu): hacky hacky way to do this
    const oceanRes = EM.addSingletonComponent(OceanDef, {
        ent: createRef(oceanEntId, [PositionDef]),
        uvToPos: (out, uv) => {
            const x = uv[0] * uvToPosReader.size[0];
            const y = uv[1] * uvToPosReader.size[1];
            // console.log(`${x},${y}`);
            return uvToPosReader.sample(out, x, y);
        },
        uvToNorm: (out, uv) => {
            const x = uv[0] * uvToNormReader.size[0];
            const y = uv[1] * uvToNormReader.size[1];
            // console.log(`${x},${y}`);
            return uvToNormReader.sample(out, x, y);
        },
        uvToEdgeDist: (uv) => {
            const x = uv[0] * uvToNormReader.size[0];
            const y = uv[1] * uvToNormReader.size[1];
            return sdfReader.sample(NaN, x, y);
        },
        // TODO: enforce programmatically that sum(Q_i * A_i * w_i) <= 1.0
        gerstnerWaves: [
            createGerstnerWave(1.08, 10, randNormalVec2(vec2.create()), 0.5 / 20.0, 0.5),
            createGerstnerWave(1.08, 10, randNormalVec2(vec2.create()), 0.5 / 20.0, 0.5),
            createGerstnerWave(1.08, 2, randNormalVec2(vec2.create()), 0.5 / 4.0, 1),
            //createGerstnerWave(1, 0.5, randNormalVec2(vec2.create()), 0.5 / 1.0, 3),
        ],
    });
    res.renderer.renderer.updateGerstnerWaves(oceanRes.gerstnerWaves);
    res.renderer.renderer.updateScene({
        numGerstnerWaves: oceanRes.gerstnerWaves.length,
    });
    // TODO(@darzu): Gerstner on CPU
    // res.time.time
}
// TODO(@darzu): maintain compatibility with std-ocean.wgsl
function gerstner(waves, uv, t) {
    let displacement = vec3.fromValues(0.0, 0.0, 0.0);
    let normal = vec3.fromValues(0.0, 0.0, 0.0);
    for (let i = 0; i < waves.length; i++) {
        let w = waves[i];
        const WDuv_phi_t = w.w * vec2.dot(w.D, uv) + w.phi * t;
        const cos_WDuv_phi_t = Math.cos(WDuv_phi_t);
        const sin_WDuv_phi_t = Math.sin(WDuv_phi_t);
        displacement[0] += w.Q * w.A + w.D[0] * cos_WDuv_phi_t;
        displacement[1] += w.A * sin_WDuv_phi_t;
        displacement[2] += w.Q * w.A + w.D[1] * cos_WDuv_phi_t;
        normal[0] += -1.0 * w.D[0] * w.w * w.A * cos_WDuv_phi_t;
        normal[1] += w.Q * w.w * w.A * sin_WDuv_phi_t;
        normal[2] += -1.0 * w.D[1] * w.w * w.A * cos_WDuv_phi_t;
    }
    normal[1] = 1.0 - normal[1];
    vec3.normalize(normal, normal);
    return [displacement, normal];
}
EM.registerSystem([UVPosDef, PositionDef], [OceanDef], (es, res) => {
    // console.log("runOcean");
    for (let e of es) {
        // TODO(@darzu): need some notion of UV parenting?
        if (PhysicsParentDef.isOn(e) && e.physicsParent.id !== 0)
            continue;
        if (AnimateToDef.isOn(e))
            continue;
        // console.log(`copying: ${e.id}`);
        const newPos = res.ocean.uvToPos(tempVec3(), e.uvPos);
        // if (e.id > 10001) {
        //   // [-347.83,25.77,126.72]
        //   // [-347.83,25.77,126.72]
        //   console.log(
        //     `moving: ${e.id} at uv ${vec2Dbg(e.uvPos)} from ${vec3Dbg(
        //       e.position
        //     )} to ${vec3Dbg(newPos)}`
        //   );
        // }
        if (!vec3.exactEquals(newPos, vec3.ZEROS)) {
            vec3.copy(e.position, newPos);
            // console.log(`moving to: ${vec3Dbg(e.position)}`);
        }
    }
}, "oceanUVtoPos");
EM.registerSystem([UVPosDef, UVDirDef, PositionDef, RotationDef], [OceanDef], (es, res) => {
    // console.log("runOcean");
    for (let e of es) {
        // TODO(@darzu): need some notion of UV parenting?
        if (PhysicsParentDef.isOn(e) && e.physicsParent.id !== 0)
            continue;
        if (AnimateToDef.isOn(e))
            continue;
        // console.log(`copying: ${e.id}`);
        // vec2.normalize(e.uvDir, e.uvDir);
        const scaledUVDir = vec2.scale(tempVec2(), e.uvDir, 0.0001);
        const aheadUV = vec2.add(tempVec2(), e.uvPos, scaledUVDir);
        const aheadPos = res.ocean.uvToPos(tempVec3(), aheadUV);
        // TODO(@darzu): want SDF-based bounds checking
        if (!vec3.exactEquals(aheadPos, vec3.ZEROS)) {
            const forwardish = vec3.sub(tempVec3(), aheadPos, e.position);
            const newNorm = res.ocean.uvToNorm(tempVec3(), e.uvPos);
            quatFromUpForward(e.rotation, newNorm, forwardish);
            // console.log(
            //   `UVDir ${[e.uvDir[0], e.uvDir[1]]} -> ${quatDbg(e.rotation)}`
            // );
        }
    }
}, "oceanUVDirToRot");
function createGerstnerWave(Q, A, D, w, phi) {
    return { D, Q, A, w, phi, padding1: 0, padding2: 0 };
}
// TODO(@darzu): debug movement on the ocean
// EM.registerSystem(
//   [UVPosDef, UVDirDef, PositionDef, RotationDef],
//   [OceanDef, InputsDef],
//   (es, res) => {
//     // console.log("runOcean");
//     for (let e of es) {
//       // TODO(@darzu): debug moving
//       // console.log("moving buoy!");
//       let speed = 0.001;
//       const deltaUV = vec2.zero(tempVec2());
//       if (res.inputs.keyDowns["shift"]) speed *= 5;
//       if (res.inputs.keyDowns["arrowright"]) deltaUV[1] -= speed;
//       if (res.inputs.keyDowns["arrowleft"]) deltaUV[1] += speed;
//       if (res.inputs.keyDowns["arrowup"]) deltaUV[0] += speed;
//       if (res.inputs.keyDowns["arrowdown"]) deltaUV[0] -= speed;
//       if (deltaUV[0] !== 0.0 || deltaUV[1] !== 0.0) {
//         const newUV = vec2.add(tempVec2(), e.uvPos, deltaUV);
//         // TODO(@darzu): need a better way to see if UV is out of map bounds
//         const newPos = res.ocean.uvToPos(tempVec3(), newUV);
//         if (!vec3.exactEquals(newPos, vec3.ZEROS)) {
//           vec2.copy(e.uvPos, newUV);
//           vec2.copy(e.uvDir, deltaUV);
//         }
//       }
//     }
//   },
//   "runOcean"
// );
// TODO(@darzu): ocean texture posibilities:
// [x] 2D voronoi texture to CPU
// [x] 2D normals texture
// [ ] 3D->3D voronoi texture
// [ ] 3D->2D voronoi seeds lookup texture
// [ ] 3D normals texture ?
//# sourceMappingURL=ocean.js.map