import validate from 'validate-npm-package-name'

/**
 * Rejects package specs, URLs and shell flags where a registry package name is required.
 * @param name - npm package name.
 * @returns Nothing; throws for invalid package names.
 */
export function validatePackageName(name: string): void {
  const result = validate(name)
  if (!result.validForNewPackages) {
    throw new Error(`invalid npm package name: ${name}`)
  }
}
