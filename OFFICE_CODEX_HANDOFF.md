# Office Codex Handoff: sqs-trigger-lambda-node

This file summarizes the current implementation so another Codex session, including an office-account Codex session, can continue without needing the full chat history.

## Repository

- Project name: `sqs-trigger-lambda-node`
- Local path: `D:\office-work\Empwr\Code\sqs-trigger-lambda-node`
- GitHub repository: `https://github.com/astarisborn2810/sqs-trigger-lambda-node`
- Branch: `main`
- Latest known commit at handoff time: `d3da08b Rename project to sqs-trigger-lambda-node`

Recent commits:

```text
d3da08b Rename project to sqs-trigger-lambda-node
3833fc9 Add DynamoDB idempotency parity
f049ec3 Tighten repository and packaging scripts
c0bcc48 Initial PEARL SQS trigger Lambda Node.js implementation
```

## Purpose

This is a standalone Node.js AWS Lambda project for the PEARL downstream SQS trigger.

It is not part of the Java monorepo.

Runtime flow:

```text
S3 bucket
  -> SQS queue
  -> Node.js Lambda
  -> AWS Step Functions
```

The Lambda runtime trigger is SQS. The OpenAPI file is documentation and contract visibility only; it is not used as a runtime HTTP API.

## Core Requirement Implemented

The upstream Step Function / S3 process only needs to provide:

- file name in format similar to `batchId_vendorname_plan`
- S3 path or ARN of the file

The SQS Lambda consumes S3 event notifications from SQS, extracts the bucket/key, URL-decodes the key, infers metadata, builds Step Function input, applies idempotency, and starts the configured Step Function.

## Main Implementation

Important files:

- `src/handlers/sqsTriggerHandler.js`
- `src/services/sqsMessageProcessor.js`
- `src/services/s3EventParser.js`
- `src/services/stepFunctionService.js`
- `src/services/correlationService.js`
- `src/services/idempotencyStore.js`
- `src/services/idempotencyKeyUtil.js`
- `src/models/stepFunctionInput.js`
- `src/validators/messageValidator.js`
- `src/logging/logger.js`
- `src/errors/pearlError.js`
- `src/config/appConfig.js`

Infrastructure and operations:

- `infrastructure/cloudformation/lambda.yaml`
- `openapi/sqs-trigger-lambda-openapi.yaml`
- `scripts/package-lambda.ps1`
- `scripts/deploy-lambda.ps1`
- `scripts/create-github-repo.ps1`
- `.env.example`
- `README.md`

## Runtime and Packaging

- Local development target: Node.js 25
- AWS Lambda runtime target: `nodejs22.x`
- If `nodejs22.x` is unavailable in the target AWS account/Region, update CloudFormation to `nodejs20.x`.
- Handler: `src/handlers/sqsTriggerHandler.handler`
- Package output: `dist/sqs-trigger-lambda-node.zip`

Current CloudFormation settings:

- Timeout: `30`
- Memory: `256`
- SQS event source mapping batch size: `1`
- Creates Lambda execution role
- Grants CloudWatch Logs access
- Grants SQS receive/delete permissions
- Grants Step Functions `StartExecution`
- Creates DynamoDB idempotency table
- Grants DynamoDB read/write permissions for idempotency

## Environment Variables

Example values are in `.env.example`.

Required:

```text
AWS_REGION=us-east-1
STATE_MACHINE_ARN=arn:aws:states:us-east-1:123456789012:stateMachine:pearl-downstream-orchestrator-dev
LOG_LEVEL=INFO
SERVICE_NAME=sqs-trigger-lambda-node
```

Production idempotency variables:

```text
IDEMPOTENCY_TABLE_NAME=sqs-trigger-lambda-node-dev-s3-trigger-idempotency
IDEMPOTENCY_TTL_DAYS=91
IDEMPOTENCY_IN_PROGRESS_TTL_SECONDS=900
```

Do not commit real credentials, secrets, or client account IDs.

## Step Function Input

The Step Function input includes:

- `fileName`
- `s3PathOrArn`
- `bucket`
- `key`
- correlation metadata
- inferred `batchId`
- inferred `vendorId`
- inferred `dataType`
- idempotency metadata

`dataType` inference:

- object key containing `/financial/` -> `financial`
- object key containing `/indicative/` -> `indicative`
- otherwise fallback is used

Execution name format:

```text
{vendorId}-{dataType}-{batchId}-{correlationIdShort}
```

If Step Functions reports a duplicate execution name, the service appends a timestamp and retries with a unique name.

## Idempotency Parity

DynamoDB idempotency has been added to match the Java-project expectation.

The idempotency key is derived from stable S3 event/file identity. Behavior:

- new event: claim record as `STARTING`, start Step Function, then mark `STARTED`
- duplicate already `STARTED`: skip Step Function start
- duplicate currently `STARTING`: throw retryable in-progress error so SQS retry can occur
- start failure after claim: release/mark the idempotency record as `FAILED`
- expired in-progress lease can be reclaimed

Key files:

- `src/services/idempotencyStore.js`
- `src/services/idempotencyKeyUtil.js`
- `test/unit/idempotencyStore.test.js`
- `test/unit/idempotencyKeyUtil.test.js`
- `test/unit/sqsMessageProcessor.test.js`

## OpenAPI

OpenAPI file:

```text
openapi/sqs-trigger-lambda-openapi.yaml
```

It is documentation only. It contains contract visibility for:

- `/health`
- `/events/s3-object-created`
- `/events/step-function-input`

Schemas include:

- `SqsEvent`
- `S3ObjectCreatedEvent`
- `StepFunctionInput`
- `ErrorResponse`
- `CorrelationContext`

## Tests and Verification

Last verified successfully before this handoff:

```powershell
npm test
npm run lint
npm run package
```

Observed test result:

```text
Test Suites: 7 passed, 7 total
Tests: 29 passed, 29 total
Snapshots: 0 total
```

Test coverage includes:

- S3 `TestEvent` ignored safely
- S3 `ObjectCreated` event parsed
- invalid SQS event rejected
- missing `STATE_MACHINE_ARN` fails
- Step Function input built correctly
- structured logger output
- multiple SQS records processed
- AWS SDK v3 Step Functions client mocked in integration-style tests
- idempotency key generation
- idempotency duplicate skip behavior
- idempotency in-progress retry behavior
- idempotency mark-started behavior
- idempotency release-on-failure behavior

## Deployment Next Steps

From the project folder:

```powershell
cd D:\office-work\Empwr\Code\sqs-trigger-lambda-node
npm ci
npm test
npm run lint
npm run package
```

Deploy example:

```powershell
.\scripts\deploy-lambda.ps1 `
  -Region us-east-1 `
  -Environment dev `
  -FunctionName sqs-trigger-lambda-node `
  -DeploymentBucket your-deployment-bucket `
  -StateMachineArn arn:aws:states:us-east-1:123456789012:stateMachine:pearl-downstream-orchestrator-dev `
  -SqsQueueArn arn:aws:sqs:us-east-1:123456789012:pearl-outbound-trigger-queue-dev `
  -SqsQueueUrl https://sqs.us-east-1.amazonaws.com/123456789012/pearl-outbound-trigger-queue-dev
```

Before production deployment:

- confirm target Region supports `nodejs22.x`
- replace example ARNs/account IDs with real environment values
- confirm S3 bucket notification sends `ObjectCreated` events to the SQS queue
- confirm SQS redrive/DLQ policy exists outside or alongside this stack
- confirm Step Function input contract matches the downstream state machine
- verify CloudWatch logs
- verify Step Function executions
- verify DynamoDB idempotency records

## Notes for Office Codex

Do not recreate the project from scratch. Continue from the GitHub repository above.

Recommended first commands:

```powershell
git clone https://github.com/astarisborn2810/sqs-trigger-lambda-node.git
cd sqs-trigger-lambda-node
npm ci
npm test
npm run lint
npm run package
```

If the office account cannot access the repository, grant access or transfer/copy the repository according to company policy.

The current implementation does not include real AWS credentials, secrets, or real client account IDs.
