import type {
  TrustClaims,
  TrustClaimsCircleCI,
  TrustClaimsGitHub,
  TrustClaimsGitLab,
  TrustedPublishConfig,
  TrustConfig,
} from './types'

/**
 * Builds provider-specific trust payload for npm registry APIs.
 *
 * @param config - Resolved runtime configuration.
 * @returns Provider payload for `POST /-/package/{name}/trust`.
 *
 * @example
 * ```ts
 * const payload = buildTrustConfig(config)
 * ```
 */
export function buildTrustConfig(config: TrustedPublishConfig): TrustConfig {
  return {
    type: config.provider,
    claims: buildClaims(config),
    permissions: config.permissions,
  }
}

function buildClaims(config: TrustedPublishConfig): TrustClaims {
  if (config.provider === 'github') {
    return {
      repository: config.claims.repository!,
      workflow_ref: {
        file: config.claims.workflow || config.claims.file!,
      },
      ...(config.claims.environment
        ? { environment: config.claims.environment }
        : {}),
    } satisfies TrustClaimsGitHub
  }

  if (config.provider === 'gitlab') {
    return {
      project_path: config.claims.project!,
      ci_config_ref_uri: {
        file: config.claims.file!,
      },
      ...(config.claims.environment
        ? { environment: config.claims.environment }
        : {}),
    } satisfies TrustClaimsGitLab
  }

  return {
    'oidc.circleci.com/org-id': config.claims.orgId!,
    'oidc.circleci.com/project-id': config.claims.projectId!,
    'oidc.circleci.com/pipeline-definition-id':
      config.claims.pipelineDefinitionId!,
    'oidc.circleci.com/vcs-origin': config.claims.vcsOrigin!,
    ...(config.claims.contextIds?.length
      ? { 'oidc.circleci.com/context-ids': config.claims.contextIds }
      : {}),
  } satisfies TrustClaimsCircleCI
}
