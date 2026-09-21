/*
 * Provenance, narrowed to the kinds this Vault actually holds.
 *
 * The shape, the path rules and the validation all live in
 * `infrastructure/provenance.ts`, because the registry needs them and the
 * registry sits beneath every domain — so it cannot depend upward on the
 * vocabulary of document kinds.
 *
 * This file adds that vocabulary back for the callers that benefit from it. A
 * `VaultProvenance` is a `DefinitionProvenance` whose `kind` is one of the six
 * document kinds rather than any string, which makes a typo in a snapshot
 * builder a compile error instead of a value that validates and then matches
 * nothing.
 */

import {
    findDefinitionProvenanceIssues,
    type DefinitionProvenance,
} from "../infrastructure/provenance";
import {
    describeDiagnosticValue,
    type EngineError,
} from "../infrastructure/diagnostics";

import { isVaultDocumentKind, VAULT_DOCUMENT_KINDS, type VaultDocumentKind } from "./document";

export {
    DEFINITION_SOURCE_KINDS,
    describeProvenance,
    isRepositoryRelativePath,
    type DefinitionProvenance,
    type DefinitionSourceKind,
} from "../infrastructure/provenance";


export type VaultProvenance = DefinitionProvenance & { readonly kind: VaultDocumentKind };


/** The shared rules, plus the requirement that the kind is one this Vault knows. */
export function findVaultProvenanceIssues(
    candidate: unknown,
    path = "provenance",
): readonly EngineError[] {
    const errors = [...findDefinitionProvenanceIssues(candidate, path)];

    const kind = (candidate as { kind?: unknown } | null)?.kind;

    if (
        typeof candidate === "object" && candidate !== null &&
        typeof kind === "string" && !isVaultDocumentKind(kind)
    ) {
        errors.push({
            code: "vault.provenance.kind.unknown",
            message: "Provenance must name a document kind this Vault implements.",
            audience: "developer",
            subject: { kind: "field", id: `${path}.kind` },
            required: [...VAULT_DOCUMENT_KINDS],
            actual: describeDiagnosticValue(kind),
        });
    }

    return errors;
}
