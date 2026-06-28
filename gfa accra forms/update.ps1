$content = [System.IO.File]::ReadAllText("c:\Users\kenne\OneDrive\Desktop\gfa accra forms\app.js")
$csvData = [System.IO.File]::ReadAllText("c:\Users\kenne\OneDrive\Desktop\gfa accra forms\data.csv")

$csvDataLines = $csvData.Split("`n")
$pins = @()

foreach ($line in $csvDataLines) {
    $parts = $line.Trim().Split(',')
    if ($parts.Length -eq 2) {
        $pins += @{
            serial = $parts[0].Trim()
            pin = $parts[1].Trim()
            used = $false
            formData = $null
        }
    }
}

$pinsJson = $pins | ConvertTo-Json -Depth 5 -Compress

$newInitDb = @"
function initDatabase() {
    if (!localStorage.getItem('gfa_database_v2')) {
        let pins = $pinsJson;
        localStorage.setItem('gfa_database_v2', JSON.stringify(pins));
        console.log('Database initialized with ' + pins.length + ' pins.');
    }
}
"@

# Replace the whole initDatabase block (including its header comment),
# so the regex stays stable even if the function body changes.
$patternInit = '(?s)// Initialize Pins in LocalStorage\s*function initDatabase\(\)\s*\{.*?\n\}'
$newInitDbWithHeader = "// Initialize Pins in LocalStorage`r`n$newInitDb"
$content = $content -replace $patternInit, $newInitDbWithHeader

[System.IO.File]::WriteAllText("c:\Users\kenne\OneDrive\Desktop\gfa accra forms\app.js", $content, [System.Text.Encoding]::UTF8)
Write-Output "Update Successful"
