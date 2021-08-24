# GitHub Issue Bot <!-- omit in toc -->

- [Installation](#installation)
- [Configuration](#configuration)

## Installation

Add the following to your `.github` workflow file:

```yml
name: Issue Bot
on: [issues, pull_request]
jobs:
  issue-bot:
    runs-on: ubuntu-latest
    steps:
    - name: Analyze Issue
      uses: mtrezza/github-issue-bot@v1.0.0
      with:
        repo-token: ${{ secrets.GITHUB_TOKEN }}
```

## Configuration

