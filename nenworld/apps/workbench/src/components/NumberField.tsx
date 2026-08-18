/*
 * NumberField — a labelled numeric input.
 *
 * Deliberately does no validation of its own. The engine decides what a legal
 * value is; this component only reports that decision back via `invalid`. If
 * it started clamping or rejecting input, the workbench would quietly become a
 * second source of rules.
 *
 * It also allows values the engine will reject — that is the point. You need
 * to be able to type 42 into a 1-30 attribute and watch the engine explain
 * itself.
 */

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;

  // Advisory only: rendered as input hints, never enforced here.
  min?: number | undefined;
  max?: number | undefined;
  step?: number | undefined;

  // Set from engine output so the border can reflect a rejected value.
  invalid?: boolean | undefined;
  hint?: string | undefined;
}

export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  invalid,
  hint,
}: NumberFieldProps) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>

      <input
        type="number"
        value={Number.isFinite(value) ? value : ""}
        min={min}
        max={max}
        step={step}
        aria-invalid={invalid ? "true" : "false"}
        onChange={(event) => {
          // An empty box parses as NaN. Pass it straight through so the engine
          // gets to produce the "must be a finite number" diagnostic itself.
          onChange(event.target.valueAsNumber);
        }}
      />

      {hint ? <span className="field__hint">{hint}</span> : null}
    </label>
  );
}
