[CmdletBinding()]
param(
  [string]$ConfigDir
)

$ErrorActionPreference = "Stop"
$ManagedSpec = "./tui-plugins/codex-usage-sidebar.js"
$SourcePlugin = Join-Path $PSScriptRoot "dist/tui.js"
$SourceUsageModule = Join-Path $PSScriptRoot "dist/codex-usage.js"
$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)

function Get-DefaultConfigDir {
  if ($env:OPENCODE_CONFIG_DIR) {
    return $env:OPENCODE_CONFIG_DIR
  }
  if ($env:XDG_CONFIG_HOME) {
    return Join-Path $env:XDG_CONFIG_HOME "opencode"
  }
  return Join-Path $HOME ".config/opencode"
}

function Find-StringEnd {
  param(
    [string]$Text,
    [int]$Start
  )

  for ($i = $Start + 1; $i -lt $Text.Length; $i++) {
    if ($Text[$i] -eq '\') {
      $i++
      continue
    }
    if ($Text[$i] -eq '"') {
      return $i
    }
  }
  throw "Unterminated string in TUI config."
}

function Find-NextToken {
  param(
    [string]$Text,
    [int]$Start
  )

  $i = $Start
  while ($i -lt $Text.Length) {
    if ([char]::IsWhiteSpace($Text[$i])) {
      $i++
      continue
    }
    if ($Text[$i] -eq '/' -and $i + 1 -lt $Text.Length) {
      if ($Text[$i + 1] -eq '/') {
        $newline = $Text.IndexOf("`n", $i + 2)
        if ($newline -lt 0) {
          return $Text.Length
        }
        $i = $newline + 1
        continue
      }
      if ($Text[$i + 1] -eq '*') {
        $end = $Text.IndexOf('*/', $i + 2)
        if ($end -lt 0) {
          throw "Unterminated comment in TUI config."
        }
        $i = $end + 2
        continue
      }
    }
    return $i
  }
  return $Text.Length
}

function Find-MatchingBracket {
  param(
    [string]$Text,
    [int]$Start
  )

  $depth = 0
  for ($i = $Start; $i -lt $Text.Length; $i++) {
    if ($Text[$i] -eq '"') {
      $i = Find-StringEnd $Text $i
      continue
    }
    if ($Text[$i] -eq '/' -and $i + 1 -lt $Text.Length) {
      if ($Text[$i + 1] -eq '/') {
        $newline = $Text.IndexOf("`n", $i + 2)
        if ($newline -lt 0) {
          break
        }
        $i = $newline
        continue
      }
      if ($Text[$i + 1] -eq '*') {
        $end = $Text.IndexOf('*/', $i + 2)
        if ($end -lt 0) {
          throw "Unterminated comment in TUI config."
        }
        $i = $end + 1
        continue
      }
    }
    if ($Text[$i] -eq '[') {
      $depth++
    } elseif ($Text[$i] -eq ']') {
      $depth--
      if ($depth -eq 0) {
        return $i
      }
    }
  }
  throw "Unterminated plugin array in TUI config."
}

function Get-ConfigLocations {
  param([string]$Text)

  $braceDepth = 0
  $bracketDepth = 0
  $pluginStart = -1
  $pluginEnd = -1
  $rootClose = -1

  for ($i = 0; $i -lt $Text.Length; $i++) {
    if ($Text[$i] -eq '"') {
      $start = $i
      $i = Find-StringEnd $Text $i
      if ($braceDepth -eq 1 -and $bracketDepth -eq 0) {
        $name = $Text.Substring($start, $i - $start + 1) | ConvertFrom-Json
        $colon = Find-NextToken $Text ($i + 1)
        if ($name -eq 'plugin' -and $colon -lt $Text.Length -and $Text[$colon] -eq ':') {
          $pluginStart = Find-NextToken $Text ($colon + 1)
          if ($pluginStart -ge $Text.Length -or $Text[$pluginStart] -ne '[') {
            throw "Cannot update non-array plugin setting in TUI config."
          }
          $pluginEnd = Find-MatchingBracket $Text $pluginStart
        }
      }
      continue
    }
    if ($Text[$i] -eq '/' -and $i + 1 -lt $Text.Length) {
      if ($Text[$i + 1] -eq '/') {
        $newline = $Text.IndexOf("`n", $i + 2)
        if ($newline -lt 0) {
          break
        }
        $i = $newline
        continue
      }
      if ($Text[$i + 1] -eq '*') {
        $end = $Text.IndexOf('*/', $i + 2)
        if ($end -lt 0) {
          throw "Unterminated comment in TUI config."
        }
        $i = $end + 1
        continue
      }
    }
    if ($Text[$i] -eq '{') {
      $braceDepth++
    } elseif ($Text[$i] -eq '}') {
      if ($braceDepth -eq 1 -and $bracketDepth -eq 0) {
        $rootClose = $i
      }
      $braceDepth--
    } elseif ($Text[$i] -eq '[') {
      $bracketDepth++
    } elseif ($Text[$i] -eq ']') {
      $bracketDepth--
    }
  }

  if ($rootClose -lt 0) {
    throw "Cannot find the root object in TUI config."
  }

  return [pscustomobject]@{
    PluginStart = $pluginStart
    PluginEnd = $pluginEnd
    RootClose = $rootClose
  }
}

function Find-LastSignificantCharacter {
  param(
    [string]$Text,
    [int]$Start,
    [int]$End
  )

  $last = -1
  for ($i = $Start; $i -le $End; $i++) {
    if ([char]::IsWhiteSpace($Text[$i])) {
      continue
    }
    if ($Text[$i] -eq '"') {
      $i = Find-StringEnd $Text $i
      $last = $i
      continue
    }
    if ($Text[$i] -eq '/' -and $i + 1 -le $End) {
      if ($Text[$i + 1] -eq '/') {
        $newline = $Text.IndexOf("`n", $i + 2)
        if ($newline -lt 0 -or $newline -gt $End) {
          break
        }
        $i = $newline
        continue
      }
      if ($Text[$i + 1] -eq '*') {
        $commentEnd = $Text.IndexOf('*/', $i + 2)
        if ($commentEnd -lt 0) {
          throw "Unterminated comment in TUI config."
        }
        $i = $commentEnd + 1
        continue
      }
    }
    $last = $i
  }
  return $last
}

function Get-LineLayout {
  param(
    [string]$Text,
    [int]$Position
  )

  $lineStart = $Text.LastIndexOf("`n", [Math]::Max(0, $Position - 1)) + 1
  $prefix = $Text.Substring($lineStart, $Position - $lineStart)
  return [pscustomobject]@{
    IsOwnLine = $prefix -match '^[\t ]*$'
    LineStart = $lineStart
    Indent = $prefix
  }
}

function Insert-Text {
  param(
    [string]$Text,
    [int]$Position,
    [string]$Value
  )
  return $Text.Insert($Position, $Value)
}

function Add-PluginEntry {
  param(
    [string]$Text,
    [pscustomobject]$Locations,
    [string]$Spec
  )

  $eol = if ($Text.Contains("`r`n")) { "`r`n" } else { "`n" }
  $indentUnit = if ($Text -match "(?m)^`t+\S") { "`t" } else { "  " }
  $quotedSpec = $Spec | ConvertTo-Json -Compress

  if ($Locations.PluginStart -ge 0) {
    $last = Find-LastSignificantCharacter $Text ($Locations.PluginStart + 1) ($Locations.PluginEnd - 1)
    $layout = Get-LineLayout $Text $Locations.PluginEnd
    $insertAt = if ($layout.IsOwnLine) { $layout.LineStart } else { $Locations.PluginEnd }
    $hasEntry = $last -ge 0

    if ($hasEntry -and $Text[$last] -ne ',') {
      $Text = Insert-Text $Text ($last + 1) ','
      if ($last -lt $insertAt) {
        $insertAt++
      }
    }

    if ($layout.IsOwnLine) {
      $entry = "$($layout.Indent)$indentUnit$quotedSpec$eol"
    } elseif ($hasEntry) {
      $entry = " $quotedSpec"
    } else {
      $entry = $quotedSpec
    }
    return Insert-Text $Text $insertAt $entry
  }

  $last = Find-LastSignificantCharacter $Text 0 ($Locations.RootClose - 1)
  $layout = Get-LineLayout $Text $Locations.RootClose
  $insertAt = if ($layout.IsOwnLine) { $layout.LineStart } else { $Locations.RootClose }
  $hasProperty = $last -ge 0 -and $Text[$last] -ne '{'

  if ($hasProperty -and $Text[$last] -ne ',') {
    $Text = Insert-Text $Text ($last + 1) ','
    if ($last -lt $insertAt) {
      $insertAt++
    }
  }

  if ($layout.IsOwnLine) {
    $property = "$($layout.Indent)$indentUnit`"plugin`": [$quotedSpec]$eol"
  } elseif ($hasProperty) {
    $property = " `"plugin`": [$quotedSpec]"
  } else {
    $property = "`"plugin`": [$quotedSpec]"
  }
  return Insert-Text $Text $insertAt $property
}

if (-not $ConfigDir) {
  $ConfigDir = Get-DefaultConfigDir
}
if (-not (Test-Path -LiteralPath $SourcePlugin -PathType Leaf)) {
  throw "Built plugin not found: $SourcePlugin"
}
if (-not (Test-Path -LiteralPath $SourceUsageModule -PathType Leaf)) {
  throw "Built plugin module not found: $SourceUsageModule"
}

$jsoncPath = Join-Path $ConfigDir "tui.jsonc"
$jsonPath = Join-Path $ConfigDir "tui.json"
$configPath = if (Test-Path -LiteralPath $jsoncPath -PathType Leaf) { $jsoncPath } else { $jsonPath }
$newContent = $null

if (Test-Path -LiteralPath $configPath -PathType Leaf) {
  $content = [System.IO.File]::ReadAllText($configPath)
  try {
    $config = $content | ConvertFrom-Json
  } catch {
    throw "Cannot update invalid TUI config: $configPath`n$($_.Exception.Message)"
  }

  $pluginProperty = $config.PSObject.Properties['plugin']
  if ($pluginProperty -and -not ($pluginProperty.Value -is [System.Array])) {
    throw "Cannot update non-array plugin setting: $configPath"
  }

  $alreadyInstalled = $false
  if ($pluginProperty) {
    foreach ($entry in $pluginProperty.Value) {
      if ($entry -is [string] -and $entry -eq $ManagedSpec) {
        $alreadyInstalled = $true
        break
      }
    }
  }

  if (-not $alreadyInstalled) {
    $locations = Get-ConfigLocations $content
    $newContent = Add-PluginEntry $content $locations $ManagedSpec
  }
} else {
  $newContent = "{`n  `"`$schema`": `"https://opencode.ai/tui.json`",`n  `"plugin`": [`n    `"$ManagedSpec`"`n  ]`n}`n"
}

$pluginDir = Join-Path $ConfigDir "tui-plugins"
$pluginPath = Join-Path $pluginDir "codex-usage-sidebar.js"
[System.IO.Directory]::CreateDirectory($pluginDir) | Out-Null
Copy-Item -LiteralPath $SourcePlugin -Destination $pluginPath -Force
Copy-Item -LiteralPath $SourceUsageModule -Destination (Join-Path $pluginDir "codex-usage.js") -Force

if ($null -ne $newContent) {
  [System.IO.Directory]::CreateDirectory($ConfigDir) | Out-Null
  [System.IO.File]::WriteAllText($configPath, $newContent, $Utf8NoBom)
}

Write-Host "Installed Codex usage sidebar in $ConfigDir"
Write-Host "Restart OpenCode to activate it."
