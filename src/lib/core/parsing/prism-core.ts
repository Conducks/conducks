
export type { PrismRequest, SpectrumNode, PrismSpectrum } from "@/contracts/index.js";
import type { PrismRequest, PrismSpectrum } from "@/contracts/index.js";

/**
 * Conducks — Prism Core Interface (Base)
 */
export abstract class ConducksPrism {
  public abstract readonly id: string;
  public abstract readonly version: string;
  public abstract readonly extensions: string[];

  /** The one operation every language lens implements: source in, structural spectrum out. */
  public abstract reflect(request: PrismRequest): Promise<PrismSpectrum>;
}
