import * as core from '@actions/core'
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

  try {
    return {
      token,
      reportPaths: pathsString.split(','),
      minCoverage: {
        overall: getPercentageInput('min-coverage-overall'),
        changed: getPercentageInput('min-coverage-changed-lines'),
      },
      checkName: core.getInput('check-name'),
      prNumber: core.getInput('pr-number'),
      headSha: core.getInput('head-sha'),
      baseSha: core.getInput('base-sha'),
      showAllModules: getBooleanInput('show-all-modules'),
      showMissingLines: getBooleanInput('show-missing-lines'),
      emoji: {
        pass: core.getInput('pass-emoji'),
        fail: core.getInput('fail-emoji'),
      },
      continueOnError: getBooleanInput('continue-on-error'),
      debugMode: getBooleanInput('debug-mode'),
      coverageCounterType,
      failCheckBelowThreshold: getBooleanInput('fail-check-below-threshold'),
    }
  } catch (error) {
    if (!(error instanceof InvalidInputError)) throw error
    core.setFailed(error.message)
    return undefined
  }
}

class InvalidInputError extends Error {}

function getPercentageInput(name: string): number {
  const value = String(core.getInput(name) ?? '').trim()
  const percentage = Number(value)
  if (!value || isNaN(percentage) || percentage < 0 || percentage > 100) {
    throw new InvalidInputError(
      `'${name}' ${value} is invalid. It must be a number between 0 and 100`
    )
  }
  return percentage
}

const TRUE_VALUES = ['true', 'True', 'TRUE']
const FALSE_VALUES = ['false', 'False', 'FALSE']

/**
 * Reads a YAML 1.2 boolean. An empty value is false: GitHub fills in the
 * action.yml default when an input is not set, so it is only empty when
 * explicitly set to ''.
 */
function getBooleanInput(name: string): boolean {
  const value = String(core.getInput(name) ?? '').trim()
  if (!value || FALSE_VALUES.includes(value)) return false
  if (TRUE_VALUES.includes(value)) return true
  throw new InvalidInputError(
    `'${name}' ${value} is invalid. It must be true or false`
  )
}
