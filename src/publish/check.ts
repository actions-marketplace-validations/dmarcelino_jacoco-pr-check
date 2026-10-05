import * as core from '@actions/core'
import * as github from '@actions/github'
import {GitHub} from '@actions/github/lib/utils'
import {CoverageStatus, getCheckTitle} from '../status.js'

export const DEFAULT_CHECK_NAME = 'JaCoCo Report'

// GitHub rejects a check run whose output summary is longer than this
const MAX_SUMMARY_LENGTH = 65535
const TRUNCATED_NOTE =
  "\n> Report truncated: exceeds GitHub's check summary limit"

export class MissingChecksPermissionError extends Error {
  constructor() {
    super(
      "Publishing the check run requires the 'checks: write' permission. Add `checks: write` to the job permissions."
    )
    this.name = 'MissingChecksPermissionError'
  }
}

export interface PublishCheckParams {
  client: InstanceType<typeof GitHub>
  name: string
  headSha: string
  status: CoverageStatus
  body: string
  failBelowThreshold: boolean
  debugMode: boolean
}

export async function publishCheck({
  client,
  name,
  headSha,
  status,
  body,
  failBelowThreshold,
  debugMode,
}: PublishCheckParams): Promise<void> {
  const checkName = name.trim() || DEFAULT_CHECK_NAME
  const conclusion =
    failBelowThreshold && !status.passed ? 'failure' : 'success'
  const title = getCheckTitle(status)
  if (debugMode)
    core.info(
      `check: name=${checkName} title=${title} conclusion=${conclusion}`
    )

  try {
    await client.rest.checks.create({
      ...github.context.repo,
      name: checkName,
      head_sha: headSha,
      status: 'completed',
      conclusion,
      output: {title, summary: truncateSummary(body)},
    })
  } catch (error) {
    if (isForbidden(error)) throw new MissingChecksPermissionError()
    throw error
  }
}

function truncateSummary(body: string): string {
  if (body.length <= MAX_SUMMARY_LENGTH) return body
  // Leave room for the note and for closing any collapsed section that was cut
  const reserved = TRUNCATED_NOTE.length + '\n</details>\n'.length * 2
  const kept = body.slice(
    0,
    body.lastIndexOf('\n', MAX_SUMMARY_LENGTH - reserved)
  )
  const unclosed =
    kept.split('<details>').length - kept.split('</details>').length
  return `${kept}\n${'\n</details>\n'.repeat(Math.max(unclosed, 0))}${TRUNCATED_NOTE}`
}

function isForbidden(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as {status?: number}).status === 403
  )
}
