param(
    [Parameter(Mandatory = $true)]
    [string]$Region,

    [Parameter(Mandatory = $true)]
    [string]$Environment,

    [Parameter(Mandatory = $true)]
    [string]$FunctionName,

    [Parameter(Mandatory = $true)]
    [string]$DeploymentBucket,

    [Parameter(Mandatory = $true)]
    [string]$StateMachineArn,

    [Parameter(Mandatory = $true)]
    [string]$SqsQueueArn,

    [Parameter(Mandatory = $true)]
    [string]$SqsQueueUrl,

    [string]$Profile
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$PackagePath = Join-Path $ProjectRoot "dist/sqs-trigger-lambda-node.zip"
$DeploymentKey = "lambda/$Environment/sqs-trigger-lambda-node.zip"
$TemplatePath = Join-Path $ProjectRoot "infrastructure/cloudformation/lambda.yaml"
$StackName = "$FunctionName-$Environment"

Push-Location $ProjectRoot
try {
    & (Join-Path $PSScriptRoot "package-lambda.ps1")

    $awsBaseArgs = @("--region", $Region)
    if ($Profile) {
        $awsBaseArgs += @("--profile", $Profile)
    }

    aws @awsBaseArgs s3 cp $PackagePath "s3://$DeploymentBucket/$DeploymentKey"

    aws @awsBaseArgs cloudformation deploy `
        --template-file $TemplatePath `
        --stack-name $StackName `
        --capabilities CAPABILITY_NAMED_IAM `
        --parameter-overrides `
            Environment=$Environment `
            LambdaFunctionName=$FunctionName `
            SqsQueueArn=$SqsQueueArn `
            SqsQueueUrl=$SqsQueueUrl `
            StateMachineArn=$StateMachineArn `
            DeploymentBucket=$DeploymentBucket `
            DeploymentKey=$DeploymentKey

    Write-Host "Deployment complete for stack: $StackName"
}
finally {
    Pop-Location
}
