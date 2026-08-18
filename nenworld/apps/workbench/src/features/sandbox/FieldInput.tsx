/*
 * Renders one Sandbox parameter, recursing for groups.
 *
 * Like NumberField elsewhere in the workbench, this validates nothing. It
 * reports what was entered and lets the engine decide whether it's legal —
 * typing 999 into an attribute is allowed precisely so you can watch the
 * engine reject it.
 */

import type { AnyField, FieldSpec, SandboxContext } from "./fields";
import type { FormValue } from "./resolve";

interface FieldInputProps {
  spec: AnyField;
  value: FormValue;
  path: readonly string[];
  ctx: SandboxContext;
  missing: ReadonlySet<string>;
  onChange: (path: readonly string[], value: FormValue) => void;
}

export function FieldInput({
  spec,
  value,
  path,
  ctx,
  missing,
  onChange,
}: FieldInputProps) {
  // Groups own their own layout: a labelled block of nested inputs.
  if (spec.kind === "group") {
    const nested = value && typeof value === "object" ? value : {};

    // GroupField is declared with `any` to break a circular type reference
    // (see fields.ts), so its fields need naming back to FieldSpec here.
    const groupFields: FieldSpec = spec.fields;

    return (
      <div className="sandbox__group">
        <div className="section-label">{spec.label}</div>
        {spec.hint ? <p className="sandbox__hint">{spec.hint}</p> : null}

        {Object.entries(groupFields).map(([key, childSpec]) => (
          <FieldInput
            key={key}
            spec={childSpec}
            value={nested[key]}
            path={[...path, key]}
            ctx={ctx}
            missing={missing}
            onChange={onChange}
          />
        ))}
      </div>
    );
  }

  const pathKey = path.join(".");
  const isMissing = missing.has(pathKey);

  return (
    <label className="field">
      <span className="field__label">{spec.label}</span>

      {spec.kind === "number" ? (
        <input
          type="number"
          value={typeof value === "number" && !Number.isNaN(value) ? value : ""}
          aria-invalid={isMissing ? "true" : "false"}
          onChange={(event) => onChange(path, event.target.valueAsNumber)}
        />
      ) : null}

      {spec.kind === "text" ? (
        <input
          type="text"
          value={typeof value === "string" ? value : ""}
          aria-invalid={isMissing ? "true" : "false"}
          onChange={(event) => onChange(path, event.target.value)}
        />
      ) : null}

      {spec.kind === "boolean" ? (
        <input
          type="checkbox"
          checked={value === true}
          onChange={(event) => onChange(path, event.target.checked)}
        />
      ) : null}

      {spec.kind === "select" ? (
        <select
          value={typeof value === "string" ? value : ""}
          aria-invalid={isMissing ? "true" : "false"}
          onChange={(event) => onChange(path, event.target.value)}
        >
          {spec.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : null}

      {spec.kind === "characterRef" ? (
        <select
          value={typeof value === "string" ? value : ""}
          aria-invalid={isMissing ? "true" : "false"}
          onChange={(event) => onChange(path, event.target.value)}
        >
          <option value="">— pick a character —</option>

          {ctx.order.map((id) => {
            const sheet = ctx.sheets[id];
            if (!sheet) return null;

            return (
              <option key={id} value={id}>
                {sheet.name.trim() === "" ? "(unnamed)" : sheet.name}
              </option>
            );
          })}

          {/* Grouped separately so a scratch dummy is never mistaken for a
              saved character. */}
          {ctx.ephemeralIds.length > 0 ? (
            <optgroup label="scratch">
              {ctx.ephemeralIds.map((id) => {
                const sheet = ctx.sheets[id];
                if (!sheet) return null;

                return (
                  <option key={id} value={id}>
                    {sheet.name}
                  </option>
                );
              })}
            </optgroup>
          ) : null}
        </select>
      ) : null}

      {spec.hint ? <span className="field__hint">{spec.hint}</span> : null}
    </label>
  );
}
