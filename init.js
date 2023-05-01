import { assert } from "./util.js";
let hasInitPassed = false;
const onInitFns = [];
// TODO(@darzu): convert all uses of onInit into em.registerInit ?
export function onInit(fn) {
    assert(!hasInitPassed, `trying to add an init fn but init has already happened!`);
    onInitFns.push(fn);
}
export function callInitFns(em) {
    assert(!hasInitPassed, "double init");
    hasInitPassed = true;
    onInitFns.forEach((fn) => fn(em));
}
//# sourceMappingURL=init.js.map