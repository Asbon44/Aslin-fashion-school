Stop-Process -Name WINWORD -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

$paths = @(
    "HKCU:\Software\Microsoft\Office\16.0\Word\Options",
    "HKCU:\Software\Microsoft\Office\15.0\Word\Options"
)
foreach ($path in $paths) {
    if (Test-Path $path) {
        New-ItemProperty -Path $path -Name "DisableConvertPdfWarning" -Value 1 -PropertyType DWORD -Force -ErrorAction SilentlyContinue | Out-Null
    } else {
        $parent = Split-Path $path
        if (Test-Path $parent) {
            New-Item -Path $parent -Name "Options" -Force -ErrorAction SilentlyContinue | Out-Null
            New-ItemProperty -Path $path -Name "DisableConvertPdfWarning" -Value 1 -PropertyType DWORD -Force -ErrorAction SilentlyContinue | Out-Null
        }
    }
}

$pdfPath = "C:\Users\kenne\OneDrive\Desktop\gfa kumasi project\gfa accra forms\General_Fashion_Academy_Admission_Letter-v3 (1).pdf"
$outputPath = "C:\Users\kenne\OneDrive\Desktop\gfa kumasi project\gfa accra forms\admission_letter_text.txt"

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
    $doc = $word.Documents.Open($pdfPath, $false, $true)
    $text = $doc.Content.Text
    $text | Out-File -FilePath $outputPath -Encoding utf8
    Write-Output "Successfully extracted to $outputPath"
} catch {
    Write-Error $_.Exception.Message
} finally {
    if ($doc) {
        $doc.Close()
    }
    $word.Quit()
}
