$InfFileName = "silabser.inf"

# --- CHECK DE PERMISOS DE ADMINISTRADOR ---
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "ERROR: Este script DEBE ser ejecutado como ADMINISTRADOR."
    Write-Host "Haz clic derecho en el archivo .ps1 y selecciona 'Ejecutar como administrador'"
    Write-Host ""
    Write-Host "Presiona cualquier tecla para salir..."
    $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown") | Out-Null
    exit 1
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  INSTALADOR DE DRIVER SILICON LABS" -ForegroundColor Cyan
Write-Host "    (Estructura simplificada)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
[System.Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# Obtener rutas
$ScriptPath = Split-Path -Parent $MyInvocation.MyCommand.Definition
$InfFilePath = Join-Path $ScriptPath $InfFileName  # INF debe estar en la raíz

Write-Host ""
Write-Host "[1/4] Verificando archivo INF y directorio de trabajo..." -ForegroundColor Yellow

# Verificar archivo INF
if (-not (Test-Path $InfFilePath)) {
    Write-Error "No se encontró el archivo '$InfFileName' en la ruta: $ScriptPath"
    Write-Host ""
    Write-Host "Presiona cualquier tecla para salir..."
    $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown") | Out-Null
    exit 1
}

Write-Host "[OK] Directorio de trabajo: $(Get-Location)" -ForegroundColor Green
Write-Host "[OK] Archivo INF encontrado" -ForegroundColor Green

# Verificar carpetas de arquitectura (deben estar DIRECTAMENTE en la raíz)
Write-Host ""
Write-Host "[2/4] Verificando carpetas de arquitectura (Raíz)..." -ForegroundColor Yellow
$RequiredFolders = @("arm", "arm64", "x64", "x86")
$AllFoldersOK = $true

# El script ahora busca las carpetas DIRECTAMENTE bajo $ScriptPath
foreach ($folder in $RequiredFolders) {
    $folderPath = Join-Path $ScriptPath $folder
    $sysFile = Join-Path $folderPath "silabser.sys"
    
    if (Test-Path $sysFile) {
        Write-Host "[OK] Carpeta '$folder' y archivo 'silabser.sys'" -ForegroundColor Green
    } else {
        Write-Warning "[FALTA] $sysFile. Verifica que las carpetas $RequiredFolders estén en la raíz."
        $AllFoldersOK = $false
    }
}

if (-not $AllFoldersOK) {
    Write-Error "Faltan archivos necesarios. La estructura debe ser: raíz/[arm, arm64, x64, x86]/silabser.sys"
    Write-Host ""
    Write-Host "Presiona cualquier tecla para salir..."
    $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown") | Out-Null
    exit 1
}

# CRÍTICO: Asegurar que el directorio de trabajo sea la RAÍZ del proyecto.
Set-Location $ScriptPath

# Ejecutar PnPUtil
Write-Host ""
Write-Host "[3/4] Ejecutando PnPUtil..." -ForegroundColor Yellow
Write-Host "Comando: pnputil /add-driver `"$InfFilePath`" /install" -ForegroundColor Gray
Write-Host ""

try {
    # Capturar salida y errores
    $output = & pnputil.exe /add-driver "$InfFilePath" /install 2>&1
    
    Write-Host "--- Salida de PnPUtil ---" -ForegroundColor Cyan
    $output | ForEach-Object { Write-Host $_ }
    Write-Host "-------------------------" -ForegroundColor Cyan
    Write-Host ""
    
    # Convertir a string para análisis
    $outputText = $output | Out-String
    
    Write-Host "[4/4] Analizando resultado..." -ForegroundColor Yellow
    
    # Verificar resultado
    if ($outputText -match "agregado correctamente|successfully added|published successfully") {
        Write-Host ""
        Write-Host "✓✓✓ ¡INSTALACIÓN EXITOSA! ✓✓✓" -ForegroundColor Green
        Write-Host ""
        Write-Host "El driver se instaló correctamente." -ForegroundColor Green
        Write-Host "Ahora puedes conectar tu dispositivo USB Serial." -ForegroundColor Cyan
    }
    elseif ($outputText -match "ya está instalado|already installed|already published") {
        Write-Host ""
        Write-Host "✓ El driver ya estaba instalado en el sistema" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "Si el dispositivo no funciona, intenta desconectarlo y reconectarlo." -ForegroundColor Yellow
    }
    elseif ($outputText -match "error|failed|falló|hash|manipulado") {
        Write-Host ""
        Write-Error "✗ ERROR CRÍTICO durante la instalación"
        Write-Host ""
        Write-Host "El error más probable es de **Firma Digital** (Hash/Manipulado)." -ForegroundColor Red
        Write-Host ""
        Write-Host "DIAGNÓSTICO:" -ForegroundColor Yellow
        Write-Host "Al haber modificado el archivo INF, la firma digital original se invalidó." -ForegroundColor Yellow
        Write-Host ""
        Write-Host "SOLUCIÓN (si la instalación falla de nuevo):" -ForegroundColor Cyan
        Write-Host "1. Reintenta la instalación, pero antes..." -ForegroundColor Cyan
        Write-Host "2. **Deshabilita temporalmente la aplicación de la firma de controladores** (Opción 7 en el menú de inicio avanzado de Windows)." -ForegroundColor Cyan
    }
    else {
        Write-Host ""
        Write-Host "⚠ Estado desconocido" -ForegroundColor Yellow
        Write-Host "Revisa la salida de PnPUtil arriba para más detalles." -ForegroundColor Yellow
    }

} catch {
    Write-Host ""
    Write-Error "✗ Excepción al ejecutar PnPUtil"
    Write-Error $_.Exception.Message
    Write-Host ""
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Presiona cualquier tecla para salir..."
$Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown") | Out-Null