import * as core from '@actions/core';
import * as github from '@actions/github';

async function main() {
  try {
    // Define parameters
    const issuePatterns = [
      { regex: '(- [x] I am not disclosing a vulnerability)' },
    ];

    // Get action parameters
    const githubToken = core.getInput('github-token');
    const issueMessage = core.getInput('issue-message');

    // Validate parameters
    if (!issueMessage) {
      throw new Error('Parameter `issue-message` not set.');
    }

    // Get client
    const context = github.context;
    const payload = context.payload;
    const client = github.getOctokit(githubToken, { required: true });

    // Ensure action is opened issue or PR
    if ([!'opened', 'reopened'].includes(payload.action)) {
      core.debug('No issue or PR opened or reopened, skipping.');
      return;
    }

    // Ensure action is triggered by issue or PR
    const isIssue = !!payload.issue;
    const isPr = !!payload.pull_request;

    // If action was not invoked due to issue or PR
    if (!isIssue && !isPr) {
      core.debug('Not a pull request or issue, skipping.');
      return;
    }

    // Ensure sender is set
    if (!payload.sender) {
      throw new Error('No sender provided by GitHub.');
    }

    // Get event details
    const issue = context.issue;
    const body = getBody(payload) || '';

    if (isIssue) {
      const validations = validatePattern(issuePatterns, body);
      for (const validation of validations) {
        if (!validation.ok) {
          throw new Error('Make sure to check all relevant checkboxes.');
        }
      }
    } else {
      return;
    }

    core.debug('Composing comment from template...');
    const message = composeComment(issueMessage, payload)
    const issueType = isIssue ? 'issue' : 'pull request';

    core.debug(`Adding comment "${message}" to ${issueType} #${issue.number}...`);
    if (isIssue) {
      await client.issues.createComment({
        owner: issue.owner,
        repo: issue.repo,
        issue_number: issue.number,
        body: message
      });
      core.debug('Closing issue...');
      await client.issues.update({
        owner: issue.owner,
        repo: issue.repo,
        issue_number: issue.number,
        state: 'closed'
      });
    } else {
      await client.pulls.createReview({
        owner: issue.owner,
        repo: issue.repo,
        pull_number: issue.number,
        body: message,
        event: 'COMMENT'
      });
      core.debug('Closing PR...');
      await client.pulls.update({
        owner: issue.owner,
        repo: issue.repo,
        pull_number: issue.number,
        state: 'closed'
      });
    }
  } catch (error) {
    core.setFailed(error.message);
    return;
  }
}

function validatePattern(patterns, text) {
  const validations = [];
  for (const pattern of patterns) {
    const regex = new RegExp(pattern.regex);

    const validation = Object.assign({}, pattern);
    validation.ok = text.match(regex);
    validations.push(validation);
  }
  return validations;
}

function getBody(payload) {
  if (payload.issue && payload.issue.body) {
    return payload.issue.body;
  }
  if (payload.pull_request && payload.pull_request.body) {
    return payload.pull_request.body;
  }
}

function composeComment(message, params) {
  return Function(...Object.keys(params), `return \`${message}\``)(...Object.values(params));
}

main();
