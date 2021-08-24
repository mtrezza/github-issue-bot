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
      { regex: '- \\[x\\] I am not disclosing a vulnerability' },
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
    const item = context.issue;
    const itemBody = getBody(payload) || '';
    core.info(`itemBody: ${JSON.stringify(itemBody)}`);

    if (isIssue) {
      const validations = validatePattern(issuePatterns, itemBody);
      for (const validation of validations) {
        if (!validation.ok) {
          core.info('Make sure to check all relevant checkboxes.');
        }
      }
    } else {
      core.info('All required checkboxes checked.');
      return;
    }

    // Get issue
    // const { issueBody } = await getIssueData(client, item);
    // core.info(`body: ${JSON.stringify(issueBody)}`);

    // Validate issue
    const validations = validatePattern(issuePatterns, itemBody);
    core.info(`validations: ${JSON.stringify(validations)}`);


    // Compose comment
    const message = composeComment(issueMessage, payload)

    // Post comment
    core.info(`Adding comment "${message}" to ${itemType} #${item.number}.`);
    await postComment(client, itemType, item, message);

    // Close item
    await closeItem(client, itemType, item);

  } catch (e) {
    core.setFailed(e.message);
    return;
  }
}

async function getIssueData(client, issue) {
  const params = {
    owner: issue.owner,
    repo: issue.repo,
    issue_number: issue.number,
  }
  const { data } = await client.rest.issues.get(params);
  return data;
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

function validatePattern(patterns, text) {
  const validations = [];
  for (const pattern of patterns) {
    const regex = new RegExp(pattern.regex);

    const validation = Object.assign({}, pattern);
    validation.ok = regex.test(text);
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

function composeComment(message, params) {
  return Function(...Object.keys(params), `return \`${message}\``)(...Object.values(params));
}

main();
