import { EM } from "../entity-manager.js";
import { vec3 } from "../sprig-matrix.js";
import { onInit } from "../init.js";
export const PartyDef = EM.defineComponent("party", () => ({
    pos: vec3.create(),
    dir: vec3.create(),
}));
onInit((em) => {
    em.addResource(PartyDef);
});
//# sourceMappingURL=party.js.map