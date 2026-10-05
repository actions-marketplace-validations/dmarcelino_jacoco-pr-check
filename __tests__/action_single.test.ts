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

describe('Single report', function () {
  let createCheck
  let output

  function getInput(key): string {
    switch (key) {
      case 'paths':
        return './__tests__/__fixtures__/report.xml'
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

  function checkSummary(): string {
    return createCheck.mock.calls[0][0].output.summary
  }

  function mockOctokitWithPullsGet(pullsGet): void {
    mockGithub.getOctokit.mockReturnValue({
      rest: {
        repos: {
          compareCommits: jest.fn(({base, head}) =>
            base !== head ? compareCommitsResponse : {data: {files: []}}
          ),
        },
        pulls: {get: pullsGet},
        checks: {create: createCheck},
      },
    })
  }

  function mockPrNumberInput(): void {
    mockCore.getInput.mockImplementation(key =>
      key === 'pr-number' ? '45' : getInput(key)
    )
  }

  const pullsGetResponse = (): unknown => ({
    data: {
      base: {sha: 'guasft7asdtf78asfd87as6df7y2u3'},
      head: {sha: 'aahsdflais76dfa78wrglghjkaghkj'},
    },
  })

  beforeEach(() => {
    createCheck = jest.fn()
    output = jest.fn()

    mockCore.getInput.mockImplementation(getInput)
    mockCore.setOutput.mockImplementation((...args) => output(...args))
    mockGithub.getOctokit.mockReturnValue({
      rest: {
        repos: {
          compareCommits: jest.fn(({base, head}) => {
            if (base !== head) {
              return compareCommitsResponse
            } else {
              return {data: {files: []}}
            }
          }),
        },
        checks: {create: createCheck},
      },
    })
    mockCore.setFailed.mockImplementation(c => {
      fail(c)
    })
    mockContext.sha = 'guasft7asdtf78asfd87as6df7y2u3'
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

    it('publish proper check report on the head commit', async () => {
      initContext(eventName, payload)
      await action.action()

      expect(createCheck).toHaveBeenCalledTimes(1)
      expect(createCheck.mock.calls[0][0].head_sha).toEqual(
        'aahsdflais76dfa78wrglghjkaghkj'
      )
      expect(checkSummary()).toEqual(PROPER_REPORT)
    })

    it('set overall coverage output', async () => {
      initContext(eventName, payload)

      await action.action()

      const out = output.mock.calls[0]
      expect(out).toEqual(['coverage-overall', 35.25])
    })

    it('set changed lines coverage output', async () => {
      initContext(eventName, payload)

      await action.action()

      const out = output.mock.calls[1]
      expect(out).toEqual(['coverage-changed-lines', 38.24])
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

        expect(checkSummary())
          .toEqual(`|Overall Project|35.25% **\`-17.21%\`**|red_circle|
|:-|:-|:-:|
|Changed lines|38.24%|red_circle|
<br>

|File|Coverage||
|:-|:-|:-:|
|[Math.kt](https://github.com/thsaravana/jacoco-playground/blob/14a554976c0e5909d8e69bc8cce72958c49a7dc5/src/main/kotlin/com/madrapps/jacoco/Math.kt)|42% **\`-42%\`**|red_circle|
|[Utility.java](https://github.com/thsaravana/jacoco-playground/blob/14a554976c0e5909d8e69bc8cce72958c49a7dc5/src/main/java/com/madrapps/jacoco/Utility.java)|18.03%|:green_circle:|`)
      })
    })
  })

  describe('Pull Request Target event', function () {
    const eventName = 'pull_request_target'
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

      expect(checkSummary()).toEqual(PROPER_REPORT)
    })

    it('set overall coverage output', async () => {
      initContext(eventName, payload)

      await action.action()

      const out = output.mock.calls[0]
      expect(out).toEqual(['coverage-overall', 35.25])
    })
  })

  describe('Push event', function () {
    const payload = {
      before: 'guasft7asdtf78asfd87as6df7y2u3',
      after: 'aahsdflais76dfa78wrglghjkaghkj',
    }

    it('publish proper check report on the pushed commit', async () => {
      initContext('push', payload)

      await action.action()

      expect(createCheck.mock.calls[0][0].head_sha).toEqual(
        'aahsdflais76dfa78wrglghjkaghkj'
      )
      expect(checkSummary()).toEqual(PROPER_REPORT)
    })

    it('set overall coverage output', async () => {
      initContext('push', payload)

      await action.action()

      const out = output.mock.calls[0]
      expect(out).toEqual(['coverage-overall', 35.25])
    })

    it('set changed lines coverage output', async () => {
      initContext('push', payload)

      await action.action()

      const out = output.mock.calls[1]
      expect(out).toEqual(['coverage-changed-lines', 38.24])
    })
  })

  describe('Schedule event', function () {
    const eventName = 'schedule'
    const payload = {}

    it('publish project coverage check report', async () => {
      initContext(eventName, payload)

      await action.action()

      expect(checkSummary()).toEqual(ONLY_PROJECT_REPORT)
    })

    it('set overall coverage output', async () => {
      initContext(eventName, payload)

      await action.action()

      const out = output.mock.calls[0]
      expect(out).toEqual(['coverage-overall', 35.25])
    })

    it('fetches PR SHAs when pr-number is provided', async () => {
      const pullsGet = jest.fn(pullsGetResponse)
      mockPrNumberInput()
      mockOctokitWithPullsGet(pullsGet)
      initContext(eventName, payload)

      await action.action()

      expect(pullsGet).toHaveBeenCalledWith(
        expect.objectContaining({pull_number: 45})
      )
      expect(checkSummary()).toEqual(PROPER_REPORT)
    })
  })

  describe('Workflow Dispatch event', function () {
    const eventName = 'workflow_dispatch'
    const payload = {}

    it('publish project coverage check report', async () => {
      initContext(eventName, payload)

      await action.action()

      expect(checkSummary()).toEqual(ONLY_PROJECT_REPORT)
    })

    it('set overall coverage output', async () => {
      initContext(eventName, payload)

      await action.action()

      const out = output.mock.calls[0]
      expect(out).toEqual(['coverage-overall', 35.25])
    })

    it('fetches PR SHAs when pr-number is provided', async () => {
      const pullsGet = jest.fn(pullsGetResponse)
      mockPrNumberInput()
      mockOctokitWithPullsGet(pullsGet)
      initContext(eventName, payload)

      await action.action()

      expect(pullsGet).toHaveBeenCalledWith(
        expect.objectContaining({pull_number: 45})
      )
      expect(checkSummary()).toEqual(PROPER_REPORT)
    })
  })

  describe('Workflow Run event', function () {
    const eventName = 'workflow_run'
    const payload = {
      workflow_run: {
        pull_requests: [
          {
            base: {
              sha: 'guasft7asdtf78asfd87as6df7y2u3',
            },
            head: {
              sha: 'aahsdflais76dfa78wrglghjkaghkj',
            },
            number: 45,
          },
        ],
      },
    }

    it('when proper payload present, publish proper check report', async () => {
      initContext(eventName, payload)

      await action.action()

      expect(createCheck.mock.calls[0][0].head_sha).toEqual(
        'aahsdflais76dfa78wrglghjkaghkj'
      )
      expect(checkSummary()).toEqual(PROPER_REPORT)
    })

    it('when payload does not have pull_requests, fetches PR SHAs and publishes check report', async () => {
      const pullsGet = jest.fn(pullsGetResponse)
      mockPrNumberInput()
      mockOctokitWithPullsGet(pullsGet)
      initContext(eventName, {})

      await action.action()

      expect(pullsGet).toHaveBeenCalledWith(
        expect.objectContaining({pull_number: 45})
      )
      expect(checkSummary()).toEqual(PROPER_REPORT)
    })

    it('set overall coverage output', async () => {
      initContext(eventName, payload)

      await action.action()

      const out = output.mock.calls[0]
      expect(out).toEqual(['coverage-overall', 35.25])
    })
  })

  describe('head-sha input', function () {
    const eventName = 'pull_request'
    const payload = {
      pull_request: {
        number: '45',
        base: {
          sha: 'base-sha-from-payload',
        },
        head: {
          sha: 'head-sha-from-payload',
        },
      },
    }

    it('uses head-sha input when provided', async () => {
      const compareCommits = jest.fn(() => compareCommitsResponse)
      mockGithub.getOctokit.mockReturnValue({
        rest: {
          repos: {
            compareCommits,
          },
          checks: {create: jest.fn()},
        },
      })
      mockCore.getInput.mockImplementation(key => {
        switch (key) {
          case 'head-sha':
            return 'custom-head-sha'
          default:
            return getInput(key)
        }
      })
      initContext(eventName, payload)

      await action.action()

      expect(compareCommits).toHaveBeenCalledWith(
        expect.objectContaining({
          base: 'base-sha-from-payload',
          head: 'custom-head-sha',
        })
      )
    })

    it('uses base-sha input when provided', async () => {
      const compareCommits = jest.fn(() => compareCommitsResponse)
      mockGithub.getOctokit.mockReturnValue({
        rest: {
          repos: {
            compareCommits,
          },
          checks: {create: jest.fn()},
        },
      })
      mockCore.getInput.mockImplementation(key => {
        switch (key) {
          case 'base-sha':
            return 'custom-base-sha'
          default:
            return getInput(key)
        }
      })
      initContext(eventName, payload)

      await action.action()

      expect(compareCommits).toHaveBeenCalledWith(
        expect.objectContaining({
          base: 'custom-base-sha',
          head: 'head-sha-from-payload',
        })
      )
    })

    it('ignores head-sha and base-sha inputs for push events', async () => {
      const compareCommits = jest.fn(() => compareCommitsResponse)
      mockGithub.getOctokit.mockReturnValue({
        rest: {
          repos: {
            compareCommits,
          },
          checks: {create: jest.fn()},
        },
      })
      mockCore.getInput.mockImplementation(key => {
        switch (key) {
          case 'head-sha':
            return 'custom-head-sha'
          case 'base-sha':
            return 'custom-base-sha'
          default:
            return getInput(key)
        }
      })
      initContext('push', {
        before: 'base-sha-from-push',
        after: 'head-sha-from-push',
      })

      await action.action()

      expect(compareCommits).toHaveBeenCalledWith(
        expect.objectContaining({
          base: 'base-sha-from-push',
          head: 'head-sha-from-push',
        })
      )
    })

    it('falls back to payload head sha when head-sha input is not provided', async () => {
      const compareCommits = jest.fn(() => compareCommitsResponse)
      mockGithub.getOctokit.mockReturnValue({
        rest: {
          repos: {
            compareCommits,
          },
          checks: {create: jest.fn()},
        },
      })
      initContext(eventName, payload)

      await action.action()

      expect(compareCommits).toHaveBeenCalledWith(
        expect.objectContaining({
          base: 'base-sha-from-payload',
          head: 'head-sha-from-payload',
        })
      )
    })
  })

  describe('Unsupported events', function () {
    it('Fail by throwing appropriate error', async () => {
      initContext('pr_review', {})
      mockCore.setFailed.mockImplementation(c => {
        expect(c).toEqual('The event pr_review is not supported.')
      })

      await action.action()
    })
  })

  describe('continue-on-error set to false', function () {
    it('calls setFailed when an error occurs', async () => {
      initContext('pull_request', {
        pull_request: {
          number: '45',
          base: {sha: 'guasft7asdtf78asfd87as6df7y2u3'},
          head: {sha: 'aahsdflais76dfa78wrglghjkaghkj'},
        },
      })
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      mockCore.setFailed.mockImplementation(() => {})
      mockCore.getInput.mockImplementation(key => {
        switch (key) {
          case 'continue-on-error':
            return 'false'
          default:
            return getInput(key)
        }
      })
      mockGithub.getOctokit.mockReturnValue({
        rest: {
          repos: {
            compareCommits: jest.fn(() => {
              throw new Error('API failure')
            }),
          },
        },
      })

      await action.action()

      expect(mockCore.setFailed).toHaveBeenCalled()
    })
  })
})

function initContext(eventName, payload): void {
  mockContext.eventName = eventName
  mockContext.payload = payload
  mockContext.repo = 'jacoco-playground'
  mockContext.owner = 'madrapps'
}

const PROPER_REPORT = `|Overall Project|35.25% **\`-17.21%\`**|:x:|
|:-|:-|:-:|
|Changed lines|38.24%|:x:|
<br>

|File|Coverage||
|:-|:-|:-:|
|[Math.kt](https://github.com/thsaravana/jacoco-playground/blob/14a554976c0e5909d8e69bc8cce72958c49a7dc5/src/main/kotlin/com/madrapps/jacoco/Math.kt)|42% **\`-42%\`**|:x:|
|[Utility.java](https://github.com/thsaravana/jacoco-playground/blob/14a554976c0e5909d8e69bc8cce72958c49a7dc5/src/main/java/com/madrapps/jacoco/Utility.java)|18.03%|:green_apple:|`

const ONLY_PROJECT_REPORT = `|Overall Project|35.25%|:x:|
|:-|:-|:-:|

> There is no coverage information present for the changed lines`
