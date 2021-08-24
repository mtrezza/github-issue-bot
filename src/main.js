import * as core from '@actions/core';
import * as github from '@actions/github';

const ItemType = Object.freeze({
  'pr': 'pr',
  'issue': 'issue',
});

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
    const client = github.getOctokit(githubToken, { log: 'debug' });

    // Ensure action is opened issue or PR
    if (!['opened', 'reopened'].includes(payload.action)) {
      core.info('No issue or PR opened or reopened, skipping.');
      return;
    }

    // Ensure action is triggered by issue or PR
    const isIssue = !!payload.issue;
    const isPr = !!payload.pull_request;
    const itemType = isIssue ? ItemType.issue : ItemType.pr;

    // If action was not invoked due to issue or PR
    if (!isIssue && !isPr) {
      core.info('Not a pull request or issue, skipping.');
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
          core.info('Make sure to check all relevant checkboxes.');
        }
      }
    } else {
      return;
    }

    const params = {
      owner: issue.owner,
      repo: issue.repo,
      issue_number: issue.number,
    }
    const issueData = await client.rest.issues.get(params);
    core.info(JSON.stringify(issueData));

    // Compose comment
    core.info('Composing comment from template...');
    const message = composeComment(issueMessage, payload)

    // Post comment
    core.info(`Adding comment "${message}" to ${itemType} #${issue.number}...`);
    await postComment(client, itemType, issue, message);

    // Close item
    await closeItem(client, itemType, issue);

  } catch (e) {
    core.setFailed(e.message);
    return;
  }
}

async function getComment(client, issue, position) {

  const params = {
    owner: issue.owner,
    repo: issue.repo,
    issue_number: issue.number,
  }

  // client.rest.issues.listComments

  // if (inputs.direction == 'first') {
  //   for await (const {data: comments} of octokit.paginate.iterator(
  //     octokit.rest.issues.listComments,
  //     parameters
  //   )) {
  //     // Search each page for the comment
  //     const comment = comments.find(comment =>
  //       findCommentPredicate(inputs, comment)
  //     )
  //     if (comment) return comment
  //   }
  // } else {
  //   // direction == 'last'
  //   const comments = await octokit.paginate(
  //     octokit.rest.issues.listComments,
  //     parameters
  //   )
  //   comments.reverse()
  //   const comment = comments.find(comment =>
  //     findCommentPredicate(inputs, comment)
  //   )
  //   if (comment) return comment
  // }
  // return undefined
}


async function postComment(client, type, issue, message) {
  switch(type) {
    case ItemType.issue:
      await client.rest.issues.createComment({
        owner: issue.owner,
        repo: issue.repo,
        issue_number: issue.number,
        body: message
      });
      break;

    case ItemType.pr:
      await client.rest.pulls.createReview({
        owner: issue.owner,
        repo: issue.repo,
        pull_number: issue.number,
        body: message,
        event: 'COMMENT'
      });
      break;
  }
}

async function closeItem(client, type, issue) {
  switch(type) {
    case ItemType.issue:
      await client.rest.issues.update({
        owner: issue.owner,
        repo: issue.repo,
        issue_number: issue.number,
        state: 'closed'
      });
      break;

    case ItemType.pr:
      await client.rest.pulls.update({
        owner: issue.owner,
        repo: issue.repo,
        pull_number: issue.number,
        state: 'closed'
      });
      break;
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
