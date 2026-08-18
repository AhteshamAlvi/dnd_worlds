/*
 * One side of the Combat panel: who they are, and the numbers the rulebook's
 * attack sequence actually keys on.
 *
 * Everything shown here comes from the engine via runSheetPipeline — this
 * component computes nothing. The four highlighted attributes are the ones
 * `04 Combat/Combat Core.md` uses: DEX for accuracy, AGI for Evasion, STR for
 * Attack Power, VIT for Body HP. They're labelled with their combat role so
 * the comparison reads as a matchup rather than a stat dump.
 */

import type { AttributeKey } from "@nenworld/engine";
import { StatRow } from "../../components/StatRow";
import { labelFor, StatusBadge, statusFor } from "../../components/StatusBadge";
import type { PipelineReport } from "../../adapters/sheetPipeline";
import type { RosterAction } from "../../state/roster";
import type { CharacterSheet } from "../../state/sheet";
import { formatNumber } from "../../utilities/format";

// Attribute, and what the combat sequence uses it for.
const COMBAT_ATTRIBUTES: readonly { key: AttributeKey; role: string }[] = [
  { key: "dex", role: "accuracy" },
  { key: "agi", role: "evasion" },
  { key: "str", role: "attack power" },
  { key: "vit", role: "body HP" },
];

interface CombatantColumnProps {
  role: "Attacker" | "Defender";
  sheet: CharacterSheet | null;
  report: PipelineReport | null;

  // Ids are split so real characters and scratch dummies can be grouped.
  savedIds: readonly string[];
  ephemeralIds: readonly string[];
  sheets: Readonly<Record<string, CharacterSheet>>;

  onSelect: (id: string) => void;
  dispatch: (action: RosterAction) => void;
}

export function CombatantColumn({
  role,
  sheet,
  report,
  savedIds,
  ephemeralIds,
  sheets,
  onSelect,
  dispatch,
}: CombatantColumnProps) {
  const isEphemeral = sheet ? ephemeralIds.includes(sheet.id) : false;

  return (
    <div className="combatant">
      <div className="combatant__header">
        <span className="section-label" style={{ marginBottom: 0 }}>
          {role}
        </span>

        {report ? (
          <StatusBadge
            status={statusFor(report.ok, report.warnings.length)}
            label={labelFor(report.ok, report.warnings.length)}
            count={report.warnings.length}
          />
        ) : null}
      </div>

      <div className="row">
        <select
          value={sheet?.id ?? ""}
          onChange={(event) => onSelect(event.target.value)}
        >
          <option value="">— none —</option>

          {savedIds.map((id) => {
            const option = sheets[id];
            if (!option) return null;

            return (
              <option key={id} value={id}>
                {option.name.trim() === "" ? "(unnamed)" : option.name}
              </option>
            );
          })}

          {ephemeralIds.length > 0 ? (
            <optgroup label="generic targets">
              {ephemeralIds.map((id) => {
                const option = sheets[id];
                if (!option) return null;

                return (
                  <option key={id} value={id}>
                    {option.name}
                  </option>
                );
              })}
            </optgroup>
          ) : null}
        </select>

        {/* Removing a scratch dummy is safe and reversible — it was never on
            disk — so unlike deleting a real character it needs no confirm. */}
        {isEphemeral && sheet ? (
          <button
            type="button"
            className="button"
            title="Discard this Generic Target"
            onClick={() =>
              dispatch({ kind: "delete-generic-target", id: sheet.id })
            }
          >
            ✕
          </button>
        ) : null}
      </div>

      {!sheet || !report ? (
        <p className="note">
          Nobody selected.
        </p>
      ) : (
        <>
          {/* A scratch combatant carries the same dashed SCRATCH tag as it
              does anywhere else in the app. Mistaking one of these for a
              character that lives in the vault is the one confusion this
              interface must never allow. */}
          {isEphemeral ? (
            <p className="combatant__ephemeral">
              <span className="scratch-tag">Scratch</span> Memory only — not
              saved to the vault.
            </p>
          ) : null}

          <div className="section-label" style={{ marginTop: 8 }}>
            Combat attributes
          </div>

          {COMBAT_ATTRIBUTES.map(({ key, role: attributeRole }) => (
            <StatRow
              key={key}
              label={key.toUpperCase()}
              value={formatNumber(sheet.character.attributes[key])}
              note={attributeRole}
            />
          ))}

          <div className="section-label" style={{ marginTop: 8 }}>
            Aura
          </div>

          <StatRow
            label="Pool"
            value={`${formatNumber(sheet.workbench.auraPool.current)} / ${formatNumber(
              report.maximumAura,
            )}`}
          />
          <StatRow
            label="Output"
            value={
              report.distributedAura === null
                ? "—"
                : formatNumber(report.distributedAura)
            }
            note={
              report.renAccessibleMaximum === null
                ? "not derived"
                : `of ${formatNumber(report.renAccessibleMaximum)} accessible`
            }
          />
          <StatRow
            label="Density"
            value={
              report.auraPerSurfaceUnit === null
                ? "—"
                : formatNumber(report.auraPerSurfaceUnit)
            }
            note="per SU"
            emphasis
          />
          <StatRow
            label="Body"
            value={formatNumber(sheet.character.body.surfaceUnits)}
            note="SU"
          />
        </>
      )}
    </div>
  );
}
