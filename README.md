# JaCoCo PR Check

[![Tests](https://github.com/dmarcelino/jacoco-pr-check/actions/workflows/check.yml/badge.svg)](https://github.com/dmarcelino/jacoco-pr-check/actions/workflows/check.yml)

A Github action that publishes the JaCoCo coverage report as a check run on the Pull Request head commit, with
customizable pass percentages for the overall project and the changed lines. The check details show the coverage of
the modules and files changed in the pull request.

## Usage

### Pre-requisites

Create a workflow `.yml` file in your repositories `.github/workflows` directory.
An [example workflow](#example-workflow) is available below. For more information, reference the GitHub Help
Documentation
for [Creating a workflow file](https://help.github.com/en/articles/configuring-a-workflow#creating-a-workflow-file).

The job requires the following permissions:

- `checks: write`
- `contents: read`

### Inputs

- `paths` - [**required**] Comma separated paths of the generated jacoco xml files (supports wildcard glob pattern)
- `token` - [_optional_ {default: `github.token`}] Github token used to read the changed files and create the check run
  (ensure the job has the `checks: write` and `contents: read` permissions)
- `min-coverage-overall` - [_optional_ {default: 80%}] The minimum code coverage that is required to pass for overall project
- `min-coverage-changed-lines` - [_optional_ {default: 80%}] The minimum code coverage that is required to pass for changed lines
- `check-name` - [_optional_ {default: `JaCoCo Report`}] The name of the check run. The check title shows the overall
  coverage and, when coverage dropped, the delta (e.g. `Overall 69.09% (-1.07%)`)
- `fail-check-below-threshold` - [_optional_ {default: false}] If true, the check run is marked as failed when overall or
  changed-lines coverage is below the configured minimum. Otherwise the check always succeeds and the report shows the
  pass/fail status per row
- `pr-number` - [_optional_] The PR whose base and head SHAs are used for comparing changes. Useful for `workflow_run`,
  `schedule` and `workflow_dispatch` events.
- `head-sha` - [_optional_] The head SHA to use for comparing changes. Useful when the head SHA is not available in the context (e.g. PRs from forks via `workflow_run`).
- `base-sha` - [_optional_] The base SHA to use for comparing changes. Useful when the base SHA is not available in the context (e.g. PRs from forks via `workflow_run`).
- `pass-emoji` - [_optional_ {default: :green_apple:}] Emoji used in the check report for pass status, when 'coverage >= min coverage' (should be a Github supported emoji).
- `fail-emoji` - [_optional_ {default: :x:}] Emoji used in the check report for fail status, when 'coverage < min coverage' (should be a Github supported emoji).
- `coverage-counter-type` - [_optional_ {INSTRUCTION, BRANCH, LINE, COMPLEXITY, METHOD} {default: INSTRUCTION}] The type of JaCoCo counter to use for coverage calculation. Note: COMPLEXITY and METHOD are not available at per-line granularity, so changed-lines coverage will fall back to INSTRUCTION for those types.
- `show-all-modules` - [_optional_ {default: false}] If true, show coverage for all modules in the check report, not just those with changed files
- `show-missing-lines` - [_optional_ {default: true}] If true, show the line numbers of uncovered code in the Files table of the check report with hyperlinks to the exact lines in the source
- `continue-on-error` - [_optional_ {default: true}] If true, then do not fail the action on error, but log a warning.
  A missing `checks: write` permission always fails the action
- `debug-mode` - [_optional_ {default: false}] If true, run the action in debug mode and get debug logs printed in console

### Outputs

- `coverage-overall` - The overall coverage of the project
- `coverage-changed-lines` - The coverage of lines that were changed in the PR

### Example Workflow

```yaml
name: Measure coverage

on:
  pull_request:

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      checks: write
      contents: read
    steps:
      - uses: actions/checkout@v4
      - name: Set up JDK 17
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: 17
      - name: Run Coverage
        run: |
          chmod +x gradlew
          ./gradlew testCoverage

      - name: Publish coverage check
        id: jacoco
        uses: dmarcelino/jacoco-pr-check@v0.1
        with:
          paths: |
            ${{ github.workspace }}/**/build/reports/jacoco/prodNormalDebugCoverage/prodNormalDebugCoverage.xml,
            ${{ github.workspace }}/**/build/reports/jacoco/**/debugCoverage.xml
          min-coverage-overall: 40
          min-coverage-changed-lines: 60
```

<br>
<img src="/preview/checks-summary.png" alt="checks summary screenshot" title="checks summary screenshot" width="700" />
<br>
<img src="/preview/checks-detail.png" alt="checks detail screenshot" title="checks detail screenshot" width="700" />

### Understanding the Coverage Report

- The "delta" (the negative value next to the coverage) is the uncovered part of the changed lines, expressed as a
  share of everything in the row (the project, module or file) in units of the coverage counter. It roughly shows how
  much the coverage drops because of untested changes. For example, if a project has 1000 instructions and the pull
  request changes lines holding 50 of them, 10 of which are not covered, the delta is -1% (10 / 1000).
- The delta can never be positive: adding tests for existing, unchanged code is not reflected in it, because only the
  lines changed in the current set of modifications are considered.
- The delta is not shown for the `COMPLEXITY` and `METHOD` counter types, because their changed-lines coverage is
  measured in instructions and cannot be compared with their overall coverage.

## Example Cases

1. If you want the check to fail when the minimum coverage is not met

   > Set `fail-check-below-threshold` to true. The check run is marked as failed when overall or changed-lines
   > coverage is below the configured minimum, so it can be used as a required status check.

   ```yaml
   - name: Publish coverage check
     id: jacoco
     uses: dmarcelino/jacoco-pr-check@v0.1
     with:
       paths: ${{ github.workspace }}/build/reports/jacoco/testCoverage/testCoverage.xml
       min-coverage-overall: 80
       min-coverage-changed-lines: 80
       fail-check-below-threshold: true
   ```

   > Alternatively, use the Outputs of the action to fail the workflow itself.

   ```yaml
   - name: Fail PR if overall coverage is less than 80%
     if: ${{ steps.jacoco.outputs.coverage-overall < 80.0 }}
     uses: actions/github-script@v6
     with:
       script: |
         core.setFailed('Overall coverage is less than 80%!')
   ```

2. If you have a multi-module project like `android`, with multiple modules each with its own jacoco report

   > Set the `paths` input with wildcard glob pattern (as shown in the Example workflow). This will pick all the files
   > matching the pattern. Ensure your pattern matches only one report per module, since for the same module, you could
   > have `debugCoverage.xml` and `releaseCoverage.xml`.

   ```yaml
   - name: Publish coverage check
     id: jacoco
     uses: dmarcelino/jacoco-pr-check@v0.1
     with:
       paths: |
         ${{ github.workspace }}/**/build/reports/jacoco/**/prodNormalDebugCoverage.xml,
         ${{ github.workspace }}/**/build/reports/jacoco/**/debugCoverage.xml
       min-coverage-overall: 40
       min-coverage-changed-lines: 60
   ```

3. When you need to customize the check name or the pass/fail emojis in the check report

   > Set `check-name` to the name shown in the PR checks list. Set the `pass-emoji` and `fail-emoji` to a valid
   > emoji supported in Github.

   ```yaml
   - name: Publish coverage check
     id: jacoco
     uses: dmarcelino/jacoco-pr-check@v0.1
     with:
       paths: ${{ github.workspace }}/build/reports/jacoco/testCoverage/testCoverage.xml
       check-name: Code Coverage
       pass-emoji: ':green_circle:'
       fail-emoji: ':red_circle:'
   ```

## Troubleshooting

1. If the PR is created by bots like _dependabot_, or comes from a fork, the `GITHUB_TOKEN` may be read-only and
   creating the check run fails with a missing `checks: write` permission. Add the permission to your job (as shown
   in the Example workflow). For PRs from forks, run the action from a `workflow_run` workflow and pass
   `pr-number`, or `head-sha` and `base-sha`.

## Contributing

We welcome contributions, and if you're interested, have a look at the [CONTRIBUTING](CONTRIBUTING.md) document.

## License

The scripts and documentation in this project are released under the [MIT License](LICENSE)
