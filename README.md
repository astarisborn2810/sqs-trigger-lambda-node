# PEARL SQS Trigger Lambda Node.js

Standalone Node.js AWS Lambda project for PEARL downstream orchestration. This repository is intentionally independent from the Java monorepo.

## Architecture

```text
S3 bucket
  -> SQS queue
  -> Node.js Lambda
  -> AWS Step Functions
```

The Lambda is triggered by SQS messages containing S3 event notifications. It ignores S3 test events, parses `ObjectCreated` events, builds a Step Functions input containing `fileName` and `s3PathOrArn`, and starts the configured state machine.

## Runtime

- Local development: Node.js 25 or newer.
- Current local machine used during scaffolding: Node.js 26.2.0.
- AWS Lambda runtime target: `nodejs22.x`.
- If `nodejs22.x` is not supported in your AWS account or Region, change `Runtime: nodejs22.x` to `Runtime: nodejs20.x` in [lambda.yaml](infrastructure/cloudformation/lambda.yaml).

## Local Setup

```powershell
cd D:\office-work\Empwr\Code\pearl-sqs-trigger-lambda-node
npm ci
Copy-Item .env.example .env
npm test
npm run lint
```

Required environment variable:

```text
STATE_MACHINE_ARN
```

Example values are in [.env.example](.env.example). Do not commit `.env` files or credentials.

## npm Commands

```powershell
npm test
npm run test:unit
npm run test:integration
npm run lint
npm run format
npm run package
```

## Lambda Handler

```text
src/handlers/sqsTriggerHandler.handler
```

The handler accepts an AWS SQS event. The runtime trigger is SQS, not HTTP.

## OpenAPI Documentation

The OpenAPI file is documentation and contract visibility only:

[openapi/sqs-trigger-lambda-openapi.yaml](openapi/sqs-trigger-lambda-openapi.yaml)

It documents:

- `/health`
- `/events/s3-object-created`
- `/events/step-function-input`

These are not runtime HTTP endpoints for the Lambda.

## Packaging

```powershell
.\scripts\package-lambda.ps1
```

The script runs:

- `npm ci`
- `npm test`
- `npm run lint`
- production dependency install into a staging folder
- ZIP creation at `dist/pearl-sqs-trigger-lambda-node.zip`

## Deployment

```powershell
.\scripts\deploy-lambda.ps1 `
  -Region us-east-1 `
  -Environment dev `
  -FunctionName pearl-sqs-trigger-lambda-node `
  -DeploymentBucket your-deployment-bucket `
  -StateMachineArn arn:aws:states:us-east-1:123456789012:stateMachine:pearl-downstream-orchestrator-dev `
  -SqsQueueArn arn:aws:sqs:us-east-1:123456789012:pearl-outbound-trigger-queue-dev `
  -SqsQueueUrl https://sqs.us-east-1.amazonaws.com/123456789012/pearl-outbound-trigger-queue-dev
```

Optional:

```powershell
-Profile your-aws-profile
```

The CloudFormation template creates:

- Lambda function
- Lambda execution role
- CloudWatch log group
- SQS receive/delete/change-visibility permissions
- Step Functions `StartExecution` permission
- SQS to Lambda event source mapping

## AWS Permissions

The Lambda execution role needs:

- `sqs:ReceiveMessage`
- `sqs:DeleteMessage`
- `sqs:GetQueueAttributes`
- `sqs:ChangeMessageVisibility`
- `states:StartExecution`
- CloudWatch Logs permissions from `AWSLambdaBasicExecutionRole`

No AWS credentials are hardcoded in this repository. Local AWS credentials should come from your normal AWS CLI profile or environment.

## SQS Trigger Setup

S3 should publish `ObjectCreated` notifications into the SQS queue. The Lambda event source mapping in CloudFormation consumes that queue with `BatchSize: 1`.

Recommended SQS redrive setup:

- Configure a DLQ.
- Set `maxReceiveCount` based on operational tolerance.
- Monitor queue age and DLQ depth.

## CloudWatch Verification

After deployment:

```powershell
aws logs tail /aws/lambda/pearl-sqs-trigger-lambda-node-dev --follow --region us-east-1
```

Look for structured JSON logs containing:

- `timestamp`
- `level`
- `service`
- `correlationId`
- `batchId`
- `vendorId`
- `dataType`
- `bucket`
- `key`
- `message`

## Step Functions Verification

Check executions:

```powershell
aws stepfunctions list-executions `
  --state-machine-arn arn:aws:states:us-east-1:123456789012:stateMachine:pearl-downstream-orchestrator-dev `
  --region us-east-1
```

Execution names are generated as:

```text
{vendorId}-{dataType}-{batchId}-{correlationIdShort}
```

If Step Functions reports a duplicate execution name, the Lambda retries with a timestamp suffix.

## GitHub Repo Creation

```powershell
.\scripts\create-github-repo.ps1
```

The script uses GitHub CLI when available. If GitHub CLI is not installed, it prints manual repo creation steps. This machine did not have `gh` installed during scaffolding, so the repository can also be created through GitHub API or the web UI and pushed with existing Git credentials.

Expected Git flow:

```powershell
git init
git branch -M main
git add .
git commit -m "Initial PEARL SQS trigger Lambda Node.js implementation"
git remote add origin https://github.com/<your-user>/pearl-sqs-trigger-lambda-node.git
git push -u origin main
```

## Corporate SSL Troubleshooting

If npm or AWS CLI fails behind a corporate proxy:

```powershell
npm config set proxy http://proxy-host:proxy-port
npm config set https-proxy http://proxy-host:proxy-port
```

If your company uses SSL inspection, configure the corporate CA instead of disabling SSL verification:

```powershell
npm config set cafile C:\path\to\corporate-ca.pem
$env:AWS_CA_BUNDLE="C:\path\to\corporate-ca.pem"
```

Avoid `strict-ssl=false` except as a temporary local diagnostic step.

## Quality Notes

- No secrets or account-specific credentials are stored in the repo.
- AWS account IDs in examples are placeholders.
- AWS SDK v3 is used through `@aws-sdk/client-sfn`.
- The code is split into handlers, services, validators, models, logging, errors, and config for testability.
- Jest unit and integration tests cover event parsing, validation, logging, input generation, multiple records, and Step Functions client behavior.
