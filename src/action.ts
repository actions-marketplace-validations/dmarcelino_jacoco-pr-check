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

    const parsedPrNumber = parseInt(inputs.prNumber, 10)
    const prNumber: number | undefined =
      Number.isInteger(parsedPrNumber) && parsedPrNumber > 0
        ? parsedPrNumber
        : undefined

    const client = github.getOctokit(token)

    const sha = github.context.sha
    let base: string = sha
    let head: string = sha
    switch (event) {
      case 'pull_request':
      case 'pull_request_target':
        base = github.context.payload.pull_request?.base.sha
        head = github.context.payload.pull_request?.head.sha
        break
      case 'push':
        base = github.context.payload.before
        head = github.context.payload.after
        break
      case 'workflow_dispatch':
      case 'schedule':
        break
      case 'workflow_run':
        const pullRequests =
          github.context.payload?.workflow_run?.pull_requests ?? []
        if (pullRequests.length !== 0) {
          base = pullRequests[0]?.base?.sha
          head = pullRequests[0]?.head?.sha
        }
        break
      default:
        core.setFailed(
          `The event ${github.context.eventName} is not supported.`
        )
        return
    }

    const headShaInput = inputs.headSha
    const baseShaInput = inputs.baseSha
    switch (event) {
      case 'pull_request':
      case 'pull_request_target':
      case 'workflow_run':
        if (headShaInput || baseShaInput) {
          if (headShaInput) head = headShaInput
          if (baseShaInput) base = baseShaInput
        } else if (prNumber) {
          const pr = await client.rest.pulls.get({
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
            pull_number: prNumber,
          })
          base = pr.data.base.sha
          head = pr.data.head.sha
        }
        break
      case 'workflow_dispatch':
      case 'schedule':
        if (prNumber) {
          const pr = await client.rest.pulls.get({
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
            pull_number: prNumber,
          })
          base = pr.data.base.sha
          head = pr.data.head.sha
        }
        break
    }

    core.info(`base sha: ${base}`)
    core.info(`head sha: ${head}`)
    if (debugMode) core.info(`context: ${debug(github.context)}`)
    if (debugMode) core.info(`reportPaths: ${reportPaths}`)

    const changedFiles = await getChangedFiles(base, head, client, debugMode)
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
      status: getCoverageStatus(project, inputs.minCoverage),
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
  } catch (error) {
    if (error instanceof MissingChecksPermissionError) {
      core.setFailed(error)
    } else if (error instanceof Error) {
      if (continueOnError) {
        core.error(error)
      } else {
        core.setFailed(error)
      }
    }
  }
}

async function getJsonReports(
  xmlPaths: string[],
  debugMode: boolean
): Promise<Report[]> {
  const globber = await glob.create(xmlPaths.join('\n'))
  const files = await globber.glob()
  if (debugMode) core.info(`Resolved files: ${files}`)

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

async function getChangedFiles(
  base: string,
  head: string,
  client: InstanceType<typeof GitHub>,
  debugMode: boolean
): Promise<ChangedFile[]> {
  const response = await client.rest.repos.compareCommits({
    base,
    head,
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
  })

  const changedFiles: ChangedFile[] = []
  const files = response.data.files ?? []
  for (const file of files) {
    if (debugMode) core.info(`file: ${debug(file)}`)
    const changedFile: ChangedFile = {
      filePath: file.filename,
      url: file.blob_url,
      lines: getChangedLines(file.patch),
    }
    changedFiles.push(changedFile)
  }
  return changedFiles
}
