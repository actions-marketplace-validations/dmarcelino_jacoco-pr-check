import * as core from '@actions/core'
import {parseBooleans} from 'xml2js/lib/processors'
import {Emoji, MinCoverage} from './models/project.js'
import {
  CoverageCounterType,
  VALID_COVERAGE_COUNTER_TYPES,
} from './models/jacoco-types.js'

export interface Inputs {
  token: string
  reportPaths: string[]
  minCoverage: MinCoverage
  checkName: string
  prNumber: string
  headSha: string
  baseSha: string
  showAllModules: boolean
  showMissingLines: boolean
  emoji: Emoji
  continueOnError: boolean
  debugMode: boolean
  coverageCounterType: CoverageCounterType
  failCheckBelowThreshold: boolean
}

/**
 * Reads and validates all action inputs. On a validation error the failure is
 * reported through core.setFailed and undefined is returned.
 */
export function parseInputs(): Inputs | undefined {
  const token = core.getInput('token')
  if (!token) {
    core.setFailed("'token' is missing")
    return undefined
  }
  const pathsString = core.getInput('paths')
  if (!pathsString) {
    core.setFailed("'paths' is missing")
    return undefined
  }

  const coverageCounterType = core
    .getInput('coverage-counter-type')
    .toUpperCase() as CoverageCounterType
  if (!VALID_COVERAGE_COUNTER_TYPES.includes(coverageCounterType)) {
    core.setFailed(
      `'coverage-counter-type' ${coverageCounterType} is invalid. Valid values: ${VALID_COVERAGE_COUNTER_TYPES.join(', ')}`
    )
    return undefined
  }

  return {
    token,
    reportPaths: pathsString.split(','),
    minCoverage: {
      overall: parseFloat(core.getInput('min-coverage-overall')),
      changed: parseFloat(core.getInput('min-coverage-changed-lines')),
    },
    checkName: core.getInput('check-name'),
    prNumber: core.getInput('pr-number'),
    headSha: core.getInput('head-sha'),
    baseSha: core.getInput('base-sha'),
    showAllModules: parseBooleans(core.getInput('show-all-modules')),
    showMissingLines: parseBooleans(core.getInput('show-missing-lines')),
    emoji: {
      pass: core.getInput('pass-emoji'),
      fail: core.getInput('fail-emoji'),
    },
    continueOnError: parseBooleans(core.getInput('continue-on-error')),
    debugMode: parseBooleans(core.getInput('debug-mode')),
    coverageCounterType,
    failCheckBelowThreshold: parseBooleans(
      core.getInput('fail-check-below-threshold')
    ),
  }
}
