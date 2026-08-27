/*
 * JsonInspector — pretty-printed JSON with a copy button.
 *
 * The plan requires the raw structured object sent to and returned from the
 * engine to always be inspectable, so this sits alongside every visual view
 * rather than behind a debug flag.
 *
 * Highlighting is deliberately thin: four categories, all muted. Reading JSON
 * here is about finding a shape, not about editor colour theory, and a
 * rainbow would be the loudest thing in an interface built on restraint.
 */

import { Fragment, type ReactNode, useState } from "react";
import { formatJsonBlock } from "../utilities/format";

/*
 * Matches, in order: a quoted string (capturing a following colon separately,
 * which is what makes it a key rather than a value), a number, or a literal.
 * Everything the regex doesn't match is structural — braces, commas,
 * indentation — and is emitted as punctuation.
 */
const TOKEN =
  /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b/g;

function highlight(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;

  for (const match of text.matchAll(TOKEN)) {
    const at = match.index;

    if (at > last) {
      out.push(
        <span className="json__punct" key={key++}>
          {text.slice(last, at)}
        </span>,
      );
    }

    const [whole, string, colon, number, literal] = match;

    if (string !== undefined) {
      // A string followed by a colon is a key; the colon itself stays
      // punctuation so the two never blur together.
      out.push(
        <Fragment key={key++}>
          <span className={colon ? "json__key" : "json__string"}>{string}</span>
          {colon ? <span className="json__punct">{colon}</span> : null}
        </Fragment>,
      );
    } else if (number !== undefined) {
      out.push(
        <span className="json__number" key={key++}>
          {number}
        </span>,
      );
    } else if (literal !== undefined) {
      out.push(
        <span className="json__literal" key={key++}>
          {literal}
        </span>,
      );
    }

    last = at + whole.length;
  }

  if (last < text.length) {
    out.push(
      <span className="json__punct" key={key++}>
        {text.slice(last)}
      </span>,
    );
  }

  return out;
}

interface JsonInspectorProps {
  label: string;
  value: unknown;
}

export function JsonInspector({ label, value }: JsonInspectorProps) {
  const [copied, setCopied] = useState(false);
  const text = formatJsonBlock(value);

  // Copying a trace into a bug report is one of the reasons the trace is
  // constrained to JSON-safe values in the first place.
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard access can be denied; the text is on screen regardless.
      setCopied(false);
    }
  }

  return (
    <div className="stack">
      <div className="row">
        <span className="section-label" style={{ marginBottom: 0 }}>
          {label}
        </span>
        <button type="button" className="button" onClick={copy}>
          {copied ? "copied" : "copy"}
        </button>
      </div>

      <pre className="json">{highlight(text)}</pre>
    </div>
  );
}
