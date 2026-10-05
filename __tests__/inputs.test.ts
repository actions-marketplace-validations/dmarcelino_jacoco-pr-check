/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import {jest, describe, it, expect, beforeEach} from '@jest/globals'
import {createMockCore} from './helpers'

const mockCore = createMockCore()
jest.unstable_mockModule('@actions/core', () => mockCore)

const {parseInputs} = await import('../src/inputs')

const BASE_INPUTS: Record<string, string> = {
  paths: './report.xml',
  token: 'token',
  'min-coverage-overall': '80',
  'min-coverage-changed-lines': '70',
  'check-name': 'Coverage',
  'coverage-counter-type': 'INSTRUCTION',
  'continue-on-error': 'true',
  'fail-check-below-threshold': 'false',
}

function withInputs(overrides: Record<string, string>): void {
  const inputs = {...BASE_INPUTS, ...overrides}
  mockCore.getInput.mockImplementation(key => inputs[key] ?? '')
}

describe('parseInputs', function () {
  beforeEach(() => {
    mockCore.setFailed.mockReset()
  })

  it('parses valid inputs', function () {
    withInputs({'fail-check-below-threshold': 'true'})
    const inputs = parseInputs()
    expect(mockCore.setFailed).not.toHaveBeenCalled()
    expect(inputs).toMatchObject({
      reportPaths: ['./report.xml'],
      token: 'token',
      minCoverage: {overall: 80, changed: 70},
      checkName: 'Coverage',
      coverageCounterType: 'INSTRUCTION',
      failCheckBelowThreshold: true,
    })
  })

  it('fails when token is missing', function () {
    withInputs({token: ''})
    expect(parseInputs()).toBeUndefined()
    expect(mockCore.setFailed).toHaveBeenCalledWith("'token' is missing")
  })

  it('fails when paths is missing', function () {
    withInputs({paths: ''})
    expect(parseInputs()).toBeUndefined()
    expect(mockCore.setFailed).toHaveBeenCalledWith("'paths' is missing")
  })

  it('fails on invalid coverage-counter-type', function () {
    withInputs({'coverage-counter-type': 'bogus'})
    expect(parseInputs()).toBeUndefined()
    expect(mockCore.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("'coverage-counter-type' BOGUS is invalid")
    )
  })

  it.each(['abc', '150', '-1'])(
    'fails when min-coverage-overall is %s',
    function (value) {
      withInputs({'min-coverage-overall': value})
      expect(parseInputs()).toBeUndefined()
      expect(mockCore.setFailed).toHaveBeenCalledWith(
        `'min-coverage-overall' ${value} is invalid. It must be a number between 0 and 100`
      )
    }
  )

  it('fails when min-coverage-changed-lines is not a number', function () {
    withInputs({'min-coverage-changed-lines': '80%'})
    expect(parseInputs()).toBeUndefined()
    expect(mockCore.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("'min-coverage-changed-lines' 80% is invalid")
    )
  })

  it('fails when a boolean input is not a boolean', function () {
    withInputs({'debug-mode': 'yes'})
    expect(parseInputs()).toBeUndefined()
    expect(mockCore.setFailed).toHaveBeenCalledWith(
      "'debug-mode' yes is invalid. It must be true or false"
    )
  })

  it('accepts YAML boolean spellings', function () {
    withInputs({'continue-on-error': 'False', 'show-all-modules': 'TRUE'})
    expect(parseInputs()).toMatchObject({
      continueOnError: false,
      showAllModules: true,
    })
  })
})
