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
})
