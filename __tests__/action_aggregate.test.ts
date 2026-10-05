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

describe('Aggregate report', function () {
  let createCheck
  let output

  function getInput(key: string): string {
    switch (key) {
      case 'paths':
        return './__tests__/__fixtures__/aggregate-report.xml'
      case 'token':
        return 'SMPLEHDjasdf876a987'
      case 'check-name':
        return 'JaCoCo Report'
      case 'min-coverage-overall':
        return 45
      case 'min-coverage-changed-lines':
        return 90
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
          filename:
            'app/src/main/java/com/madrapps/playground/MainViewModel.kt',
          blob_url:
            'https://github.com/thsaravana/jacoco-android-playground/blob/63aa82c13d2a6aadccb7a06ac7cb6834351b8474/app/src/main/java/com/madrapps/playground/MainViewModel.kt',
          patch: PATCH.MULTI_MODULE.MAIN_VIEW_MODEL,
        },
        {
          filename: 'math/src/main/java/com/madrapps/math/Math.kt',
          blob_url:
            'https://github.com/thsaravana/jacoco-android-playground/blob/63aa82c13d2a6aadccb7a06ac7cb6834351b8474/math/src/main/java/com/madrapps/math/Math.kt',
          patch: PATCH.MULTI_MODULE.MATH,
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

      expect(createCheck.mock.calls[0][0].output.summary)
        .toEqual(`|Overall Project|76.32% **\`-0.01%\`**|:green_apple:|
|:-|:-|:-:|
|Changed lines|0%|:x:|
<br>

|Module|Coverage||
|:-|:-|:-:|
|module-2|70.37% **\`-18.52%\`**|:x:|
|module-3|8.33%|:green_apple:|

<details>
<summary>Files</summary>

|Module|File|Coverage||
|:-|:-|:-|:-:|
|module-2|[Math.kt](https://github.com/thsaravana/jacoco-android-playground/blob/63aa82c13d2a6aadccb7a06ac7cb6834351b8474/math/src/main/java/com/madrapps/math/Math.kt)|70.37% **\`-18.52%\`**|:x:|
|module-3|[MainViewModel.kt](https://github.com/thsaravana/jacoco-android-playground/blob/63aa82c13d2a6aadccb7a06ac7cb6834351b8474/app/src/main/java/com/madrapps/playground/MainViewModel.kt)|58.82%|:green_apple:|

</details>`)
    })

    it('set overall coverage output', async () => {
      initContext(eventName, payload)

      await action.action()

      const out = output.mock.calls[0]
      expect(out).toEqual(['coverage-overall', 76.32])
    })

    it('set changed lines coverage output', async () => {
      initContext(eventName, payload)

      await action.action()

      const out = output.mock.calls[1]
      expect(out).toEqual(['coverage-changed-lines', 0])
    })
  })
})

function initContext(eventName, payload): void {
  mockContext.eventName = eventName
  mockContext.payload = payload
  mockContext.repo = {owner: 'madrapps', repo: 'jacoco-playground'}
}
