import type { ConcealmentRequest, ConcealmentResolution } from "./types";
import { resolveConcealmentCheck } from "./resolution";

export function establishConcealment(
  request: Omit<ConcealmentRequest, "mode">,
): ConcealmentResolution {
  return resolveConcealmentCheck({ ...request, mode: "established" });
}

export function shouldRerollEstablishedConcealment(change: {
  readonly newAttempt?: boolean;
  readonly deliberateReconstruction?: boolean;
  readonly methodMateriallyChanged?: boolean;
}): boolean {
  return Boolean(
    change.newAttempt || change.deliberateReconstruction || change.methodMateriallyChanged,
  );
}
