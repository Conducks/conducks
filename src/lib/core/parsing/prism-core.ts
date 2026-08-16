
export type { PrismRequest, SpectrumNode, PrismSpectrum } from "@/contracts/index.js";
import type { PrismRequest, PrismSpectrum } from "@/contracts/index.js";

/**
 * Conducks — Prism Core Interface (Base)
 */
export abstract class ConducksPrism {
  public abstract readonly id: string;
  public abstract readonly version: string;
  public abstract readonly extensions: string[];

  public abstract reflect(request: PrismRequest): Promise<PrismSpectrum>;
}
