/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import {jest, describe, it, expect, beforeEach} from '@jest/globals'
import {createMockCore, createMockContext, createMockGithub} from './helpers'
import {PATCH} from './mocks.test'

const mockCore = createMockCore()
const mockContext = createMockContext()
const mockGithub = createMockGithub(mockContext)

jest.unstable_mockModule('@actions/core', () => mockCore)
jest.unstable_mockModule('@actions/github', () => mockGithub)

const action = await import('../src/action')

describe('Single Empty report', function () {
  let createCheck
  let output

  function getInput(key): string {
    switch (key) {
      case 'paths':
        return './__tests__/__fixtures__/empty-report.xml'
      case 'token':
        return 'SMPLEHDjasdf876a987'
      case 'check-name':
        return 'JaCoCo Report'
      case 'min-coverage-overall':
        return 45
      case 'min-coverage-changed-lines':
        return 80
      case 'pass-emoji':
        return ':green_apple:'
      case 'fail-emoji':
        return ':x:'
      case 'coverage-counter-type':
        return 'INSTRUCTION'
      case 'debug-mode':
        return 'true'
    }
  }

  beforeEach(() => {
    createCheck = jest.fn()
    output = jest.fn()

    mockCore.getInput.mockImplementation(getInput)
    mockCore.setOutput.mockImplementation((...args) => output(...args))
    mockGithub.getOctokit.mockReturnValue({
      rest: {
        repos: {
          compareCommits: jest.fn(() => {
            return compareCommitsResponse
          }),
        },
        checks: {create: createCheck},
      },
    })
    mockCore.setFailed.mockImplementation(c => {
      fail(c)
    })
  })

  const compareCommitsResponse = {
    data: {
      files: [
        {
          filename: 'src/main/kotlin/com/madrapps/jacoco/Math.kt',
          blob_url:
            'https://github.com/thsaravana/jacoco-playground/blob/14a554976c0e5909d8e69bc8cce72958c49a7dc5/src/main/kotlin/com/madrapps/jacoco/Math.kt',
          patch: PATCH.SINGLE_MODULE.MATH,
        },
        {
          filename: 'src/main/java/com/madrapps/jacoco/Utility.java',
          blob_url:
            'https://github.com/thsaravana/jacoco-playground/blob/14a554976c0e5909d8e69bc8cce72958c49a7dc5/src/main/java/com/madrapps/jacoco/Utility.java',
          patch: PATCH.SINGLE_MODULE.UTILITY,
        },
        {
          filename: 'src/test/java/com/madrapps/jacoco/UtilityTest.java',
          blob_url:
            'https://github.com/thsaravana/jacoco-playground/blob/14a554976c0e5909d8e69bc8cce72958c49a7dc5/src/test/java/com/madrapps/jacoco/UtilityTest.java',
          patch: PATCH.SINGLE_MODULE.UTILITY_TEST,
        },
        {
          filename: '.github/workflows/coverage.yml',
          blob_url:
            'https://github.com/thsaravana/jacoco-playground/blob/14a554976c0e5909d8e69bc8cce72958c49a7dc5/.github/workflows/coverage.yml',
          patch: PATCH.SINGLE_MODULE.COVERAGE,
        },
      ],
    },
  }

  describe('Pull Request event', function () {
    const eventName = 'pull_request'
    const payload = {
      pull_request: {
        number: '45',
        base: {
          sha: 'guasft7asdtf78asfd87as6df7y2u3',
        },
        head: {
          sha: 'aahsdflais76dfa78wrglghjkaghkj',
        },
      },
    }

    it('publish proper check report', async () => {
      initContext(eventName, payload)
      await action.action()

      expect(createCheck.mock.calls[0][0].output.summary).toEqual(PROPER_REPORT)
    })

    it('set overall coverage output', async () => {
      initContext(eventName, payload)

      await action.action()

      const out = output.mock.calls[0]
      expect(out).toEqual(['coverage-overall', 100])
    })

    it('set changed lines coverage output', async () => {
      initContext(eventName, payload)

      await action.action()

      const out = output.mock.calls[1]
      expect(out).toEqual(['coverage-changed-lines', 100])
    })

    describe('With custom emoji', function () {
      it('publish proper check report', async () => {
        initContext(eventName, payload)
        mockCore.getInput.mockImplementation(key => {
          switch (key) {
            case 'pass-emoji':
              return ':green_circle:'
            case 'fail-emoji':
              return 'red_circle'
            default:
              return getInput(key)
          }
        })

        await action.action()

        expect(createCheck.mock.calls[0][0].output.summary).toEqual(
          `> There is no coverage information present for the changed lines`
        )
      })
    })
  })

  describe('Pull Request Target event', function () {
    const payload = {
      pull_request: {
        number: '45',
        base: {
          sha: 'guasft7asdtf78asfd87as6df7y2u3',
        },
        head: {
          sha: 'aahsdflais76dfa78wrglghjkaghkj',
        },
      },
    }

    it('set overall coverage output', async () => {
      initContext('pull_request_target', payload)

      await action.action()

      const out = output.mock.calls[0]
      expect(out).toEqual(['coverage-overall', 100])
    })
  })

  describe('Push event', function () {
    const payload = {
      before: 'guasft7asdtf78asfd87as6df7y2u3',
      after: 'aahsdflais76dfa78wrglghjkaghkj',
    }

    it('set overall coverage output', async () => {
      initContext('push', payload)

      await action.action()

      const out = output.mock.calls[0]
      expect(out).toEqual(['coverage-overall', 100])
    })

    it('set changed lines coverage output', async () => {
      initContext('push', payload)

      await action.action()

      const out = output.mock.calls[1]
      expect(out).toEqual(['coverage-changed-lines', 100])
    })
  })

  describe('Other than push or pull_request or pull_request_target event', function () {
    it('Fail by throwing appropriate error', async () => {
      initContext('pr_review', {})
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      mockCore.setFailed.mockImplementation(() => {})

      await action.action()

      const reported =
        mockCore.setFailed.mock.calls[0]?.[0] ?? mockCore.error.mock.calls[0][0]
      expect(reported.message).toEqual('The event pr_review is not supported.')
    })
  })
})

function initContext(eventName, payload): void {
  mockContext.eventName = eventName
  mockContext.payload = payload
  mockContext.repo = {owner: 'madrapps', repo: 'jacoco-playground'}
}

const PROPER_REPORT = `> There is no coverage information present for the changed lines`
