/*
 * Combat / Run — pick two characters and run a round between them.
 *
 * The shell only. The rulebook specifies the exchange completely
 * (04 Combat/Combat Core.md: accuracy → penetration → damage), but the engine
 * has none of it yet — no Body HP, Evasion, proficiencies, weapons, regional
 * Soak, and no dice at all. So RUN is present and disabled, and the panel is
 * honest about exactly what's missing rather than faking a result.
 *
 * What it does do today is worth having on its own: two combatants side by
 * side with their real engine-derived numbers, which is the view you want
 * when tuning whether a matchup is survivable.
 *
 * Attacker and defender reuse the roster's existing activeId / targetId, so
 * there's one source of truth and the ⌖ button in the Character List keeps
 * working. Turn and round tracking are deliberately absent — the engine
 * models neither, and inventing them here would be a rule written in the UI.
 */

import { useMemo } from "react";
import { runSheetPipeline } from "../../adapters/sheetPipeline";
import { Panel } from "../../components/Panel";
import type { RosterAction, RosterState } from "../../state/roster";
import { CombatantColumn } from "./CombatantColumn";

/*
 * What a real exchange still needs from the engine, in the order the
 * rulebook's sequence uses them. Same principle as the trace's "rule not set"
 * markers: a visible gap beats a hidden one, and this doubles as the build
 * list for the combat work.
 */
const MISSING_PIECES: readonly { name: string; detail: string }[] = [
  { name: "Dice", detail: "d20 accuracy, damage dice, d10 injuries — the engine is deterministic today" },
  { name: "Evasion", detail: "10 + AGI mod (+2 shield/style, +2 Dodge)" },
  { name: "Combat proficiencies", detail: "Martial Arts / Weapons / Marksmanship, for the accuracy roll" },
  { name: "Attack Power", detail: "Physical Force + (Final Region Aura × efficiency)" },
  { name: "STR Force Factor", detail: "2^((STR−10)/4), the exponential melee term" },
  { name: "Weapons", detail: "baseline damage dice, and Shū-extended reach" },
  { name: "Regional Soak", detail: "(region density × 10) + armor + natural — needs the region model" },
  { name: "Body HP", detail: "VIT × 3 × Scale Factor, plus Guard overflow" },
  { name: "Injuries & conditions", detail: "the d10 table and the modifier layer it feeds" },
];

interface CombatPanelProps {
  roster: RosterState;
  dispatch: (action: RosterAction) => void;
}

export function CombatPanel({ roster, dispatch }: CombatPanelProps) {
  const attacker = roster.activeId ? roster.sheets[roster.activeId] ?? null : null;
  const defender = roster.targetId ? roster.sheets[roster.targetId] ?? null : null;

  const attackerReport = useMemo(
    () => (attacker ? runSheetPipeline(attacker) : null),
    [attacker],
  );
  const defenderReport = useMemo(
    () => (defender ? runSheetPipeline(defender) : null),
    [defender],
  );

  return (
    <Panel
      kicker="Encounter"
      title="Combat / Run"
      subtitle="attacker vs defender"
      actions={
        <button
          type="button"
          className="button"
          onClick={() => dispatch({ kind: "create-generic-target" })}
        >
          + generic target
        </button>
      }
    >
      <div className="combat">
        <CombatantColumn
          role="Attacker"
          sheet={attacker}
          report={attackerReport}
          savedIds={roster.order}
          ephemeralIds={roster.ephemeralIds}
          sheets={roster.sheets}
          onSelect={(id) =>
            // Selecting nobody as attacker isn't meaningful — the active
            // character drives the whole centre column — so an empty pick
            // is simply ignored.
            id === "" ? undefined : dispatch({ kind: "select-character", id })
          }
          dispatch={dispatch}
        />

        <div className="combat__versus">vs</div>

        <CombatantColumn
          role="Defender"
          sheet={defender}
          report={defenderReport}
          savedIds={roster.order}
          ephemeralIds={roster.ephemeralIds}
          sheets={roster.sheets}
          onSelect={(id) =>
            dispatch({ kind: "select-target", id: id === "" ? null : id })
          }
          dispatch={dispatch}
        />
      </div>

      <div className="combat__run">
        <button type="button" className="button button--active" disabled>
          RUN ROUND
        </button>

        <span className="muted">
          {!attacker || !defender
            ? "Select an attacker and a defender."
            : "No combat resolver in the engine yet."}
        </span>
      </div>

      <details className="combat__missing">
        <summary>
          What a round needs from the engine ({MISSING_PIECES.length})
        </summary>

        <ul className="combat__missing-list">
          {MISSING_PIECES.map((piece) => (
            <li key={piece.name}>
              <span className="combat__missing-name">{piece.name}</span>
              <span className="combat__missing-detail">{piece.detail}</span>
            </li>
          ))}
        </ul>
      </details>
    </Panel>
  );
}
