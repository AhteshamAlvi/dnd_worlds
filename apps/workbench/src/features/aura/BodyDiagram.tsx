/*
 * BodyDiagram — a plain humanoid silhouette washed with the current aura
 * density.
 *
 * Honest about its limits: the engine's Body is a single 100-SU whole, so
 * every part of this figure carries the *same* density. It is drawn in parts
 * anyway because regional subdivision is the next thing to land, and when it
 * does only the fill logic changes, not the shape.
 *
 * The opacity mapping below is the one calculation the workbench is permitted
 * to do, because it is pure presentation — it decides how dark a shape looks,
 * never what a number is.
 */

import { formatNumber } from "../../utilities/format";

interface BodyDiagramProps {
  // Null when the pipeline did not get far enough to produce a density.
  auraPerSurfaceUnit: number | null;
  surfaceUnits: number | null;
}

// Density at which the silhouette reaches full strength. Chosen for legibility
// across the fixture range, not derived from any rule.
const FULL_INTENSITY_DENSITY = 40;

function intensityFor(density: number | null): number {
  if (density === null || !Number.isFinite(density) || density <= 0) {
    return 0.05;
  }

  const ratio = density / FULL_INTENSITY_DENSITY;
  return Math.min(0.9, Math.max(0.08, ratio));
}

export function BodyDiagram({
  auraPerSurfaceUnit,
  surfaceUnits,
}: BodyDiagramProps) {
  const opacity = intensityFor(auraPerSurfaceUnit);

  return (
    <div className="body-diagram">
      <svg
        className="body-diagram__figure"
        width="120"
        height="220"
        viewBox="0 0 120 220"
        role="img"
        aria-label="Humanoid figure shaded by aura density"
      >
        <g className="body-diagram__part" fillOpacity={opacity}>
          {/* Head */}
          <circle cx="60" cy="24" r="16" />
          {/* Neck */}
          <rect x="54" y="39" width="12" height="8" />
          {/* Torso */}
          <rect x="38" y="47" width="44" height="62" rx="6" />
          {/* Arms */}
          <rect x="22" y="50" width="14" height="56" rx="6" />
          <rect x="84" y="50" width="14" height="56" rx="6" />
          {/* Hands */}
          <circle cx="29" cy="114" r="8" />
          <circle cx="91" cy="114" r="8" />
          {/* Legs */}
          <rect x="42" y="111" width="16" height="72" rx="6" />
          <rect x="62" y="111" width="16" height="72" rx="6" />
          {/* Feet */}
          <rect x="38" y="185" width="22" height="9" rx="4" />
          <rect x="60" y="185" width="22" height="9" rx="4" />
        </g>
      </svg>

      <div className="body-diagram__readout stack">
        <div className="section-label">Whole-body aura</div>

        <div className="stat">
          <span className="stat__label">Surface Units</span>
          <span className="stat__value">
            {surfaceUnits === null ? "—" : formatNumber(surfaceUnits)}
          </span>
        </div>

        <div className="stat">
          <span className="stat__label">Density</span>
          <span className="stat__value stat__value--emphasis">
            {auraPerSurfaceUnit === null
              ? "—"
              : formatNumber(auraPerSurfaceUnit)}
            <span className="stat__note"> per SU</span>
          </span>
        </div>

        <p className="note">
          Shading is uniform because the engine currently models the body as a
          single 100-SU surface. Per-region concentration lands with Gyō.
        </p>
      </div>
    </div>
  );
}
