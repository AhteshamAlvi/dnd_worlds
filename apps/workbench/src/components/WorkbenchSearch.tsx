/*
 * WorkbenchSearch — the one search field style used across the workbench.
 * The Character List, the Function Sandbox, and the Build Palette all render
 * this instead of styling their own <input>. What differs between panels is
 * supplied through props — placeholder, value, onChange — and whatever
 * filtering the caller does with `value`; this component only owns how a
 * search field looks and behaves, never what it searches.
 *
 * Deliberately not a bare <input type="search">: the platform search field
 * (rounded corners, its own cancel button, sometimes a magnifier) reads as a
 * browser control dropped onto the page rather than part of the dossier. The
 * native chrome is stripped in CSS and rebuilt from the same tokens as every
 * other input — well background, hairline-to-rule-to-accent focus step, mono
 * type for the query once it's been typed. The one deliberate difference:
 * the placeholder renders in serif italic, because a prompt like "Search
 * characters…" is prose, not data — same distinction the rest of the app
 * draws between language and typed values.
 */

import type { ChangeEvent } from "react";

interface WorkbenchSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;

  // Falls back to `placeholder` — every call site so far has a placeholder
  // descriptive enough to double as the accessible name.
  "aria-label"?: string | undefined;

  disabled?: boolean | undefined;
}

export function WorkbenchSearch({
  value,
  onChange,
  placeholder,
  "aria-label": ariaLabel,
  disabled,
}: WorkbenchSearchProps) {
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    onChange(event.target.value);
  }

  return (
    <div className={disabled ? "search search--disabled" : "search"}>
      <svg
        className="search__icon"
        viewBox="0 0 16 16"
        aria-hidden="true"
        focusable="false"
      >
        <circle
          cx="7"
          cy="7"
          r="4.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <line
          x1="10.6"
          y1="10.6"
          x2="14"
          y2="14"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>

      <input
        type="search"
        className="search__input"
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        disabled={disabled}
        aria-label={ariaLabel ?? placeholder}
      />

      {value !== "" ? (
        <button
          type="button"
          className="search__clear"
          aria-label="Clear search"
          disabled={disabled}
          onClick={() => onChange("")}
        >
          ✕
        </button>
      ) : null}
    </div>
  );
}
