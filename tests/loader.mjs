/**
 * Custom Node.js ESM loader that resolves the @/ path alias to ./src/
 * Used only for running tests outside Next.js context.
 *
 * Usage: node --loader ./tests/loader.mjs --test tests/*.test.mjs
 */
import { resolve as pathResolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = pathResolve(import.meta.dirname, "..");
const SRC = pathResolve(ROOT, "src");

export function resolve(specifier, context, nextResolve) {
  // Resolve @/ imports to src/
  if (specifier.startsWith("@/")) {
    const relativePath = specifier.slice(2);
    let resolved = pathResolve(SRC, relativePath);

    // Add .js extension if not present
    if (!resolved.endsWith(".js") && !resolved.endsWith(".mjs")) {
      resolved += ".js";
    }

    return nextResolve(pathToFileURL(resolved).href, context);
  }

  return nextResolve(specifier, context);
}
