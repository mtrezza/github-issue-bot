import * as core from '@actions/core';
import * as github from '@actions/github';

/** The item types. */
const ItemType = Object.freeze({
  'pr': 'pr',
  'issue': 'issue',
});

/** The item states. */
const ItemState = Object.freeze({
  'open': 'open',
  'closed': 'closed',
});

/** The bot comment tag id. */
const messageIdMetaTag = '\n<!-- github-issue-bot-meta-tag-id -->';
/** The octokit client. */
let client;
/** The issue or pr item. */
let item;
/** The item type. */
let itemType;

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
    client = github.getOctokit(githubToken, { log: 'debug' });

    // Ensure action is opened issue or PR
    if (!['opened', 'reopened', 'edited'].includes(payload.action)) {
      core.info('No issue or PR opened, reopened or edited, skipping.');
      return;
    }

    // Determine item type
    itemType = payload.issue !== undefined
      ? ItemType.issue
      : payload.pull_request !== undefined
        ? ItemType.pr
        : undefined;

    // If action was not invoked due to issue or PR
    if (itemType === undefined) {
      core.info('Not a pull request or issue, skipping.');
      return;
    }

    // Ensure sender is set
    if (!payload.sender) {
      throw new Error('No sender provided by GitHub.');
    }

    // Get event details
    item = context.issue;
    const itemBody = getItemBody(payload) || '';
    const itemState = getItemState(payload);
    core.info(`itemBody: ${JSON.stringify(itemBody)}`);
    core.info(`payload: ${JSON.stringify(payload)}`);

    // If item type is issue
    if (itemType == ItemType.issue) {

      // Validate issue
      const validations = validatePattern(issuePatterns, itemBody);
      core.info(`validations: ${JSON.stringify(validations)}`);
      const invalidValidations = validations.filter(validation => !validation.ok);
      core.info(`invalidValidations: ${JSON.stringify(invalidValidations)}`);

      // If validation failed
      if (invalidValidations.length > 0) {

        // Compose comment
        let message = composeComment(issueMessage, payload);
        message = message + messageIdMetaTag;

        // Find existing bot comment
        const comment = await findComment("github-issue-bot");
        core.info(`comment: ${JSON.stringify(comment)}`);

        // If no bot comment exists
        if (comment) {

          // Update existing comment
          await updateComment(comment.id, message);
        } else {

          // Post new comment
          core.info(`Adding comment "${message}" to ${itemType} #${item.number}.`);
          await postComment(message);
        }

        //   // Close item
        //   await setItemState(ItemState.closed);

      } else {
        core.info('All required checkboxes checked.');
        return;
      }
    }

  } catch (e) {
    core.setFailed(e.message);
    return;
  }
}

// async function getIssueData(issue) {
//   const params = {
//     owner: issue.owner,
//     repo: issue.repo,
//     issue_number: issue.number,
//   }
//   const { data } = await client.rest.issues.get(params);
//   return data;
// }

async function findComment(text) {
  const params = {
    owner: issue.owner,
    repo: issue.repo,
    issue_number: issue.number,
  }

  for await (const { data: comments } of client.paginate.iterator(
    client.rest.issues.listComments,
    params
  )) {
    const comment = comments.find(comment => comment.body.includes(text));
    if (comment) return comment
  }

  return undefined
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

function getItemBody(payload) {
  if (payload.issue && payload.issue.body) {
    return payload.issue.body;
  }
  if (payload.pull_request && payload.pull_request.body) {
    return payload.pull_request.body;
  }
}

function getItemState(payload) {
  if (payload.issue && payload.issue.state) {
    return payload.issue.state;
  }
  if (payload.pull_request && payload.pull_request.state) {
    return payload.pull_request.state;
  }
}

async function postComment(message) {
  switch(type) {
    case ItemType.issue:
      await client.rest.issues.createComment({
        owner: item.owner,
        repo: item.repo,
        issue_number: item.number,
        body: message
      });
      break;

    case ItemType.pr:
      await client.rest.pulls.createReview({
        owner: item.owner,
        repo: item.repo,
        pull_number: item.number,
        body: message,
        event: 'COMMENT'
      });
      break;
  }
}

async function updateComment(id, message) {
  switch(type) {
    case ItemType.issue:
      await client.rest.issues.updateComment({
        owner: item.owner,
        repo: item.repo,
        comment_id: id,
        body: message
      });
      break;

    case ItemType.pr:
      await client.rest.pulls.updateReview({
        owner: item.owner,
        repo: item.repo,
        review_id: id,
        body: message,
        event: 'COMMENT'
      });
      break;
  }
}

async function setItemState(state) {
  switch(type) {
    case ItemType.issue:
      await client.rest.issues.update({
        owner: item.owner,
        repo: item.repo,
        issue_number: item.number,
        state: state
      });
      break;

    case ItemType.pr:
      await client.rest.pulls.update({
        owner: item.owner,
        repo: item.repo,
        pull_number: item.number,
        state: state
      });
      break;
  }
}

function composeComment(message, params) {
  return Function(...Object.keys(params), `return \`${message}\``)(...Object.values(params));
}

main();
