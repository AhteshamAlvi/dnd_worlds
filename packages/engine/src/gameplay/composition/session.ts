/*
 * Work done once, for one preparation, and then thrown away.
 *
 *
 * WHY THERE IS NO PERSISTENT CACHE HERE
 *
 * The obvious optimisation for a system like this is to remember results
 * between actions, and it is a trap. A rules result cached across actions is a
 * result computed against a world that has since changed — the archer moved,
 * the torch went out, the target dropped Ten — and the cache has no way to
 * know. Invalidating it correctly requires tracking every input of every
 * projection, which is strictly more work than recomputing, and getting it
 * subtly wrong produces the worst class of bug this engine can have: a
 * mechanically wrong answer that is reproducible, explainable and stale.
 *
 * So the scope is one preparation. Within it the world is frozen by the
 * snapshot, which is exactly the condition that makes memoization safe: the
 * inputs cannot change, so an identical question has an identical answer by
 * construction. Outside it, nothing survives.
 *
 * A session is created per preparation and held by the caller. There is
 * deliberately no module-level instance — a singleton here would be the
 * cross-action cache by another name, with the added property that nobody
 * could see it in a call signature.
 *
 *
 * WHY NOTHING DEPENDS ON IT BEING THERE
 *
 * Memoization is a performance property and never a correctness one. Every
 * projector in this domain is pure, so computing the same thing twice produces
 * the same answer — the session saves the work and changes no result. Code
 * that only worked because a value was cached would be code with a hidden
 * dependency on call order, which is why `resolve` takes a thunk it may call
 * rather than a promise of having been called.
 */

import { digestOf } from "./digest";


export interface CompositionSession {
  /**
   * The value for this key, computing it only if it has not been computed.
   *
   * The thunk is not called when the key is already resolved. That is the
   * whole mechanism, and it is also how "an unrequested projection is never
   * evaluated" is observable: a projection nobody asks for has no `resolve`
   * call, so its cost is never paid.
   */
  resolve<T>(key: string, compute: () => T): T;

  /** Which projections this preparation actually asked for, in request order. */
  resolvedKeys(): readonly string[];

  /** How many times the underlying work ran. Diagnostics and tests only. */
  computeCount(): number;
}


export function createCompositionSession(): CompositionSession {
  const values = new Map<string, unknown>();
  const order: string[] = [];
  let computes = 0;

  return {
    resolve<T>(key: string, compute: () => T): T {
      if (values.has(key)) return values.get(key) as T;

      computes += 1;

      const value = compute();

      values.set(key, value);
      order.push(key);

      return value;
    },

    resolvedKeys: () => [...order],
    computeCount: () => computes,
  };
}


/**
 * A stable key for one projection of one thing.
 *
 * The parts are fingerprinted rather than concatenated, so a key can safely be
 * built from structured inputs — a step, a distance, an environment snapshot —
 * without a delimiter in somebody's id splitting one key into two.
 */
export function projectionKey(
  projection: string,
  ...parts: readonly unknown[]
): string {
  return `${projection}:${digestOf(parts)}`;
}
