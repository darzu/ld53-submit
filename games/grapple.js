import { V } from "../sprig-matrix.js";
import { PositionDef, } from "../physics/transform.js";
import { RenderableConstructDef } from "../render/renderer-ecs.js";
import { AssetsDef } from "../assets.js";
import { ColorDef } from "../color-ecs.js";
const DBG_GRAPPLE = false;
export async function registerGrappleDbgSystems(em) {
    if (!DBG_GRAPPLE)
        return;
    const res = await em.whenResources(AssetsDef);
    const h = em.new();
    em.ensureComponentOn(h, PositionDef, V(0, 0, 0));
    em.ensureComponentOn(h, ColorDef, V(0.1, 0.1, 0.1));
    em.ensureComponentOn(h, RenderableConstructDef, res.assets.grappleHook.proto);
    const g = em.new();
    em.ensureComponentOn(g, PositionDef, V(0, 0, 0));
    em.ensureComponentOn(g, ColorDef, V(0.1, 0.1, 0.1));
    em.ensureComponentOn(g, RenderableConstructDef, res.assets.grappleGun.proto);
}
//# sourceMappingURL=grapple.js.map