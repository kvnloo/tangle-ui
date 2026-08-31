/**
 * Resolves which spec in the tree a CSOM mutation should be applied to.
 *
 * The agent addresses entities by `$id` alone, with no indication of depth, so
 * every mutating handler resolves the owning spec here rather than assuming the
 * root. Failures come back as prose naming the entity and its subgraph: without
 * that the model gets the same bare `{ success: false }` for "no such entity" as
 * for "that entity is a task, not an input", and cannot tell the user which.
 */
import type { ComponentSpec } from "@/models/componentSpec";
import type {
  EntityLocation,
  EntityLocationOf,
  LocatedEntityKind,
} from "@/models/componentSpec/queries/locateEntity";
import {
  isLocationOfKind,
  locatedEntityName,
  locateEntity,
} from "@/models/componentSpec/queries/locateEntity";

const EXPECTED_LABEL: Record<LocatedEntityKind, string> = {
  task: "a task",
  input: "an input",
  output: "an output",
  binding: "a binding",
};

export interface MutationResult {
  success: boolean;
  error?: string;
}

type TargetResolution<K extends LocatedEntityKind> =
  { ok: true; location: EntityLocationOf<K> } | { ok: false; error: string };

function describeEntity(location: EntityLocation, entityId: string): string {
  const name = locatedEntityName(location);
  const label = name ? `"${name}"` : `$id "${entityId}"`;
  return `${location.kind} ${label}`;
}

export function describeEntityLocation(
  location: EntityLocation,
  entityId: string,
): string {
  const entity = describeEntity(location, entityId);
  if (location.subgraphPath.length === 0) {
    return `${entity} in the top-level pipeline`;
  }
  return `${entity} inside subgraph "${location.subgraphPath.join(" > ")}"`;
}

export function resolveTarget<K extends LocatedEntityKind>(
  root: ComponentSpec,
  entityId: string,
  expected: K,
): TargetResolution<K> {
  const location = locateEntity(root, entityId);

  if (!location) {
    return {
      ok: false,
      error: `No ${expected} with $id "${entityId}" exists in this pipeline.`,
    };
  }

  if (!isLocationOfKind(location, expected)) {
    return {
      ok: false,
      error: `$id "${entityId}" refers to ${describeEntity(location, entityId)}, not ${EXPECTED_LABEL[expected]}.`,
    };
  }

  return { ok: true, location };
}

/**
 * Connection endpoints can be tasks, graph inputs or graph outputs, so they are
 * resolved by exclusion rather than against a single expected kind.
 */
export function resolveConnectable(
  root: ComponentSpec,
  entityId: string,
): { ok: true; location: EntityLocation } | { ok: false; error: string } {
  const location = locateEntity(root, entityId);

  if (!location) {
    return {
      ok: false,
      error: `No entity with $id "${entityId}" exists in this pipeline.`,
    };
  }

  if (location.kind === "binding") {
    return {
      ok: false,
      error: `$id "${entityId}" refers to an existing connection, not a task or port that can be connected.`,
    };
  }

  return { ok: true, location };
}

export function applyToTarget<K extends LocatedEntityKind>(
  root: ComponentSpec,
  entityId: string,
  expected: K,
  apply: (location: EntityLocationOf<K>) => boolean,
): MutationResult {
  const target = resolveTarget(root, entityId, expected);
  if (!target.ok) {
    return { success: false, error: target.error };
  }

  const { location } = target;
  if (!apply(location)) {
    return {
      success: false,
      error: `The requested change to ${describeEntityLocation(location, entityId)} could not be applied.`,
    };
  }

  return { success: true };
}
