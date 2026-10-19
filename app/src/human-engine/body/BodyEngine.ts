/**
 * BodyEngine — détient le corps courant (BodyParameters) et le pousse vers le mesh via les drivers de l'avatar
 * et le MorphController. Il ne connaît ni l'UI ni le rendu : on peut changer de GLB (prototype ↔ premium),
 * ou de stratégie GPU/CPU, sans le modifier.
 */
import type { BodyParameters, MorphDriver, MorphValues } from '../core/types';
import { NEUTRAL_BODY, PROTOTYPE_DRIVERS, evaluateDrivers, sanitizeBody } from './BodyParameterMapper';
import type { MorphController } from './MorphController';

export class BodyEngine {
  private params: BodyParameters = { ...NEUTRAL_BODY };
  private drivers: MorphDriver[] = PROTOTYPE_DRIVERS;
  private weights: MorphValues = evaluateDrivers(NEUTRAL_BODY, PROTOTYPE_DRIVERS);
  private controller: MorphController | null = null;

  attach(controller: MorphController, drivers: MorphDriver[] = PROTOTYPE_DRIVERS) {
    this.controller = controller;
    this.drivers = drivers;
    this.push();
  }

  detach() {
    this.controller?.dispose();
    this.controller = null;
  }

  set(p: Partial<BodyParameters>) {
    this.params = sanitizeBody(p, this.params);
    this.push();
  }

  get(): BodyParameters {
    return { ...this.params };
  }

  morphs(): MorphValues {
    return { ...this.weights };
  }

  private push() {
    this.weights = evaluateDrivers(this.params, this.drivers);
    this.controller?.apply(this.weights);
  }
}
