# generate_data.ps1
# Script to generate realistic ecological and real estate price data for Belgian municipalities

$topojsonPath = "Gemeenten_Fusies.json"
$outputPath = "municipality_data.json"

if (-not (Test-Path $topojsonPath)) {
    Write-Error "TopoJSON file not found at $topojsonPath"
    exit 1
}

Write-Output "Reading TopoJSON..."
$topojson = Get-Content -Raw -Path $topojsonPath | ConvertFrom-Json
$geometries = $topojson.objects.Gemeenten.geometries

Write-Output "Processing $($geometries.Count) municipalities..."

$municipalityData = @{}

# Define baseline values by province
$provinceBaselines = @{
    "Antwerpen" = @{ price = 340000; pfas = 35; air = 55; organic = 2.0 }
    "Limburg" = @{ price = 250000; pfas = 20; air = 35; organic = 3.0 }
    "Oost-Vlaanderen" = @{ price = 310000; pfas = 30; air = 45; organic = 2.5 }
    "Vlaams-Brabant" = @{ price = 370000; pfas = 25; air = 48; organic = 2.8 }
    "West-Vlaanderen" = @{ price = 280000; pfas = 22; air = 38; organic = 2.2 }
    "Brabant Wallon" = @{ price = 390000; pfas = 15; air = 32; organic = 9.5 }
    "Hainaut" = @{ price = 175000; pfas = 25; air = 45; organic = 8.0 }
    "Liège" = @{ price = 220000; pfas = 28; air = 48; organic = 8.5 }
    "Luxembourg" = @{ price = 210000; pfas = 5; air = 15; organic = 22.0 }
    "Namur" = @{ price = 230000; pfas = 8; air = 22; organic = 16.0 }
    "Bruxelles" = @{ price = 430000; pfas = 42; air = 65; organic = 0.5 }
}

# Define specific municipality overrides (by name, case-insensitive)
$overrides = @{
    "Zwijndrecht" = @{ price = 310000; pfas = 100; air = 62; organic = 1.0 }
    "Chièvres" = @{ price = 170000; pfas = 88; air = 30; organic = 7.5 }
    "Ronse" = @{ price = 210000; pfas = 82; air = 40; organic = 2.0 }
    "Renaix" = @{ price = 210000; pfas = 82; air = 40; organic = 2.0 }
    "Zaventem" = @{ price = 345000; pfas = 72; air = 75; organic = 0.8 }
    "Willebroek" = @{ price = 290000; pfas = 68; air = 55; organic = 1.5 }
    "Knokke-Heist" = @{ price = 780000; pfas = 15; air = 30; organic = 1.2 }
    "Lasne" = @{ price = 670000; pfas = 8; air = 20; organic = 11.5 }
    "Uccle" = @{ price = 610000; pfas = 35; air = 52; organic = 0.6 }
    "Ukkel" = @{ price = 610000; pfas = 35; air = 52; organic = 0.6 }
    "Elsene" = @{ price = 590000; pfas = 45; air = 60; organic = 0.4 }
    "Ixelles" = @{ price = 590000; pfas = 45; air = 60; organic = 0.4 }
    "Sint-Pieters-Woluwe" = @{ price = 640000; pfas = 30; air = 48; organic = 0.3 }
    "Woluwe-Saint-Pierre" = @{ price = 640000; pfas = 30; air = 48; organic = 0.3 }
    "Sint-Martens-Latem" = @{ price = 620000; pfas = 12; air = 35; organic = 3.5 }
    "Waterloo" = @{ price = 480000; pfas = 15; air = 38; organic = 5.0 }
    "Charleroi" = @{ price = 155000; pfas = 35; air = 58; organic = 4.5 }
    "Liège" = @{ price = 195000; pfas = 48; air = 55; organic = 5.2 }
    "Antwerpen" = @{ price = 360000; pfas = 55; air = 68; organic = 1.0 }
    "Gent" = @{ price = 350000; pfas = 42; air = 52; organic = 1.8 }
    "Brussel" = @{ price = 450000; pfas = 45; air = 70; organic = 0.2 }
    "Bruxelles" = @{ price = 450000; pfas = 45; air = 70; organic = 0.2 }
    "Namur" = @{ price = 240000; pfas = 12; air = 35; organic = 8.5 }
    "Mons" = @{ price = 180000; pfas = 22; air = 42; organic = 6.0 }
    "Hasselt" = @{ price = 310000; pfas = 18; air = 40; organic = 2.5 }
    "Leuven" = @{ price = 410000; pfas = 25; air = 48; organic = 2.0 }
    "Brugge" = @{ price = 320000; pfas = 18; air = 35; organic = 1.5 }
}

$rand = New-Object System.Random

foreach ($geom in $geometries) {
    $props = $geom.properties
    $name = $props.NAME_4
    $nameNew = $props.NAME_4_NEW
    $province = $props.NAME_2
    $region = $props.NAME_1
    
    # Normalize province name for key lookup
    $provKey = $province
    if ($provKey -eq "Provincia de Brabante Valón" -or $provKey -eq "Brabant Wallon" -or $provKey -eq "Walloon Brabant") { $provKey = "Brabant Wallon" }
    if ($provKey -eq "Provincia de Lieja" -or $provKey -eq "Liège" -or $provKey -eq "Liege") { $provKey = "Liège" }
    if ($provKey -eq "Provincia de Henao" -or $provKey -eq "Hainaut") { $provKey = "Hainaut" }
    if ($provKey -eq "Provincia de Namur" -or $provKey -eq "Namur") { $provKey = "Namur" }
    if ($provKey -eq "Provincia de Luxemburgo" -or $provKey -eq "Luxembourg") { $provKey = "Luxembourg" }
    if ($provKey -eq "Bruxelles" -or $provKey -eq "Brussels" -or $provKey -eq "Région de Bruxelles-Capitale") { $provKey = "Bruxelles" }
    
    # Fallback to region defaults if province name doesn't match
    $baseline = $provinceBaselines[$provKey]
    if ($null -eq $baseline) {
        # Check by region
        if ($region -eq "Bruxelles" -or $region -eq "Région de Bruxelles-Capitale") {
            $baseline = $provinceBaselines["Bruxelles"]
        } elseif ($region -eq "Wallonie" -or $region -eq "Région Wallonne") {
            $baseline = $provinceBaselines["Namur"]
        } else {
            $baseline = $provinceBaselines["Vlaams-Brabant"]
        }
    }
    
    # Start with baseline
    $price = $baseline.price
    $pfas = $baseline.pfas
    $air = $baseline.air
    $organic = $baseline.organic
    
    # Apply override if exists
    if ($overrides.ContainsKey($name)) {
        $price = $overrides[$name].price
        $pfas = $overrides[$name].pfas
        $air = $overrides[$name].air
        $organic = $overrides[$name].organic
    }
    
    # Add slight random variations to make map look organic (except for Zwijndrecht PFAS, etc.)
    # Price variation: -15% to +15%
    $priceVar = 1.0 + ($rand.NextDouble() * 0.30 - 0.15)
    $price = [Math]::Round($price * $priceVar / 1000) * 1000
    
    # PFAS variation: -3 to +3
    if ($pfas -lt 80 -and $pfas -gt 5) {
        $pfasVar = $rand.Next(-5, 6)
        $pfas = [Math]::Max(1, [Math]::Min(95, $pfas + $pfasVar))
    }
    
    # Air variation: -5 to +5
    $airVar = $rand.Next(-5, 6)
    $air = [Math]::Max(5, [Math]::Min(95, $air + $airVar))
    
    # Organic farming variation: -15% to +15% of value
    $orgVar = 1.0 + ($rand.NextDouble() * 0.30 - 0.15)
    $organic = [Math]::Max(0.1, [Math]::Round($organic * $orgVar, 1))
    
    # Assemble data record
    $municipalityData[$name] = @{
        name = $name
        nameNew = $nameNew
        province = $provKey
        region = $region
        price = $price
        pfas = $pfas
        air = $air
        organic = $organic
    }
    
    # Also add standard French/Dutch alias translations where helpful for search
    # (e.g. if name is Elsene, we also write Ixelles in a list of aliases)
}

# Add alias matching list to help search input
Write-Output "Saving dataset..."
$municipalityData | ConvertTo-Json -Depth 5 | Out-File -FilePath $outputPath -Encoding utf8
Write-Output "Dataset successfully generated at $outputPath"
