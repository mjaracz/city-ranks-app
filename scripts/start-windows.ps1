$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$orchestrator = Join-Path $repositoryRoot 'scripts/local-environment.mjs'

& node $orchestrator start production
exit $LASTEXITCODE
