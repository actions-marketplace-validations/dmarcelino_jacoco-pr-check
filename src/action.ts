import * as core from '@actions/core'
import * as github from '@actions/github'
import * as fs from 'fs'
import * as glob from '@actions/glob'
import {getProjectCoverage} from './process.js'
import {getReport} from './render.js'
import {debug, getChangedLines, parseToReport} from './util.js'
import {Project} from './models/project.js'
import {ChangedFile} from './models/github.js'
import {Report} from './models/jacoco-types.js'
import {GitHub} from '@actions/github/lib/utils'
import {parseInputs} from './inputs.js'
import {getCoverageStatus} from './status.js'
import {MissingChecksPermissionError, publishCheck} from './publish/check.js'

export async function action(): Promise<void> {
  let continueOnError = true
  try {
    const inputs = parseInputs()
    if (!inputs) return
    continueOnError = inputs.continueOnError
    const {token, reportPaths, showAllModules, debugMode, coverageCounterType} =
      inputs

    const event = github.context.eventName
    core.info(`Event is ${event}`)
    if (debugMode) {
      core.info(`inputs: ${debug({...inputs, token: '***'})}`)
    }

    const client = github.getOctokit(token)
    const {base, head, prNumber} = await resolveCommits(
      event,
      parsePrNumber(inputs.prNumber),
      inputs.headSha,
      inputs.baseSha,
      client
    )

    core.info(`base sha: ${base}`)
    core.info(`head sha: ${head}`)
    if (debugMode) core.info(`context: ${debug(github.context)}`)
    if (debugMode) core.info(`reportPaths: ${reportPaths}`)

    const changedFiles = await getChangedFiles(
      base,
      head,
      prNumber,
      client,
      debugMode
    )
    if (debugMode) core.info(`changedFiles: ${debug(changedFiles)}`)

    const reportsJsonAsync = getJsonReports(reportPaths, debugMode)
    const reports = await reportsJsonAsync

    const project: Project = getProjectCoverage(
      reports,
      changedFiles,
      coverageCounterType,
      showAllModules
    )
    if (debugMode) core.info(`project: ${debug(project)}`)
    core.setOutput(
      'coverage-overall',
      project.overall ? parseFloat(project.overall.percentage.toFixed(2)) : 100
    )
    core.setOutput(
      'coverage-changed-lines',
      project.changed ? parseFloat(project.changed.percentage.toFixed(2)) : 100
    )

    await publishCheck({
      client,
      name: inputs.checkName,
      headSha: head,
      status: getCoverageStatus(
        project,
        inputs.minCoverage,
        coverageCounterType
      ),
      body: getReport(
        project,
        inputs.minCoverage,
        inputs.emoji,
        inputs.showMissingLines,
        coverageCounterType
      ),
      failBelowThreshold: inputs.failCheckBelowThreshold,
      debugMode,
    })
  } catch (thrown) {
    const error = thrown instanceof Error ? thrown : new Error(String(thrown))
    if (error instanceof MissingChecksPermissionError || !continueOnError) {
      core.setFailed(error)
    } else {
      core.error(error)
    }
  }
}

const ZERO_SHA = /^0+$/

function parsePrNumber(value: string | number | undefined): number | undefined {
  const parsed = parseInt(String(value ?? ''), 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

interface Commits {
  base: string
  head: string
  prNumber?: number
}

async function resolveCommits(
  event: string,
  prNumberInput: number | undefined,
  headShaInput: string,
  baseShaInput: string,
  client: InstanceType<typeof GitHub>
): Promise<Commits> {
  const payload = github.context.payload
  const sha = github.context.sha
  let commits: Commits
  switch (event) {
    case 'pull_request':
    case 'pull_request_target':
      commits = {
        base: payload.pull_request?.base.sha,
        head: payload.pull_request?.head.sha,
        prNumber: parsePrNumber(payload.pull_request?.number),
      }
      break
    case 'push':
      // A head-sha/base-sha/pr-number input does not apply to push events
      return {
        // The first push of a branch has no previous commit to compare with
        base: ZERO_SHA.test(payload.before ?? '')
          ? (payload.repository?.default_branch ?? payload.after)
          : payload.before,
        head: payload.after,
      }
    case 'workflow_dispatch':
    case 'schedule':
      commits = {base: sha, head: sha}
      break
    case 'workflow_run': {
      const pullRequest = payload.workflow_run?.pull_requests?.[0]
      commits = pullRequest
        ? {
            base: pullRequest.base?.sha,
            head: pullRequest.head?.sha,
            prNumber: parsePrNumber(pullRequest.number),
          }
        : // Fork PRs have no pull_requests: sha is the default branch head
          {base: sha, head: payload.workflow_run?.head_sha ?? sha}
      break
    }
    default:
      throw new Error(`The event ${event} is not supported.`)
  }

  if (headShaInput || baseShaInput) {
    return {
      base: baseShaInput || commits.base,
      head: headShaInput || commits.head,
      prNumber: prNumberInput ?? commits.prNumber,
    }
  }
  if (prNumberInput) {
    const pr = await client.rest.pulls.get({
      ...github.context.repo,
      pull_number: prNumberInput,
    })
    return {
      base: pr.data.base.sha,
      head: pr.data.head.sha,
      prNumber: prNumberInput,
    }
  }
  return commits
}

async function getJsonReports(
  xmlPaths: string[],
  debugMode: boolean
): Promise<Report[]> {
  const globber = await glob.create(xmlPaths.join('\n'))
  const files = await globber.glob()
  if (debugMode) core.info(`Resolved files: ${files}`)
  if (files.length === 0) {
    throw new Error(`No JaCoCo report matched paths: ${xmlPaths.join(', ')}`)
  }

  return Promise.all(
    files.map(async filePath => {
      const trimmedPath = filePath.trim()
      const reportXml = await fs.promises.readFile(trimmedPath, 'utf-8')
      const report = await parseToReport(reportXml)
      report.filePath = trimmedPath
      return report
    })
  )
}

// compareCommits returns at most this many files
const COMPARE_FILES_LIMIT = 300

async function getChangedFiles(
  base: string,
  head: string,
  prNumber: number | undefined,
  client: InstanceType<typeof GitHub>,
  debugMode: boolean
): Promise<ChangedFile[]> {
  const response = await client.rest.repos.compareCommits({
    base,
    head,
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
  })

  let files: DiffFile[] = response.data.files ?? []
  if (files.length >= COMPARE_FILES_LIMIT) {
    if (prNumber) {
      files = await client.paginate(client.rest.pulls.listFiles, {
        ...github.context.repo,
        pull_number: prNumber,
        per_page: 100,
      })
    } else {
      core.warning(
        `The comparison lists only the first ${COMPARE_FILES_LIMIT} changed files, so the rest are not counted. Set pr-number to read all files of a pull request.`
      )
    }
  }

  const changedFiles: ChangedFile[] = []
  for (const file of files) {
    if (debugMode) core.info(`file: ${debug(file)}`)
    // GitHub leaves out the patch of a diff that is too large
    if (!file.patch && file.status !== 'removed' && (file.changes ?? 0) > 0) {
      core.warning(
        `The diff of ${file.filename} is too large to read, so its changed lines are not counted.`
      )
    }
    changedFiles.push({
      filePath: file.filename,
      url: file.blob_url,
      lines: getChangedLines(file.patch),
    })
  }
  return changedFiles
}

interface DiffFile {
  filename: string
  blob_url: string
  status?: string
  changes?: number
  patch?: string
}
