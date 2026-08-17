
export type { PrismRequest, SpectrumNode, PrismSpectrum } from "@/contracts/index.js";

/**
 * Conducks — the prism vocabulary, re-exported for parsing's internals.
 *
 * The abstract `ConducksPrism` base that used to sit here is gone: nothing ever extended it, and the
 * base every language pack actually uses is `NativeProvider` in `providers/base.ts`. It was a design
 * that was superseded rather than a wire that came loose — checked against the campaign base before
 * removal, where it had the same zero references it has now.
 */
