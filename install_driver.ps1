# Obtenemos el nombre del archivo INF de forma constante.
$InfFileName = "silabser.inf"

# --- CHECK DE PERMISOS DE ADMINISTRADOR (CRÍTICO) ---
# Si no está ejecutando como administrador, detiene el script y notifica al usuario.
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "ERROR: Este script DEBE ser ejecutado como ADMINISTRADOR."
    Write-Host "Por favor, haz clic derecho en el EXE y selecciona 'Ejecutar como administrador'."
    Write-Host ""
    Write-Host "Presiona cualquier tecla para salir..."
    $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown") | Out-Null
    exit 1
}

Write-Host "Iniciando la instalación del controlador universal..."
# Solución de codificación para caracteres especiales
[System.Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# *** FIX CRÍTICO PARA PS2EXE: OBTENER LA RUTA BASE DEL EXE ***
# En un EXE generado por PS2EXE, $PSScriptRoot no está disponible, y $MyInvocation.MyCommand.Definition
# apunta a un archivo temporal. Usamos una referencia a la ubicación del proceso.
# Si el script se ejecuta como .ps1, $PSScriptRoot funciona. Si se ejecuta como .exe,
# usamos el directorio donde reside el proceso ejecutable.
if ($MyInvocation.MyCommand.Definition -like '*.exe') {
    # Cuando se ejecuta como EXE, esta variable apunta a la ubicación REAL del EXE.
    $ScriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
} else {
    # Cuando se ejecuta como .PS1
    $ScriptPath = Split-Path -Parent $MyInvocation.MyCommand.Definition
}

# La línea de abajo usa Out-Null para suprimir cualquier salida de errores de ruta irrelevante
# causada por la ejecución en el contexto temporal de PS2EXE.
Write-Host ""
Write-Host "[1/4] Verificando archivo INF y directorio de trabajo..." -ForegroundColor Yellow

# 1. Definir la ruta del archivo INF
$InfFilePath = Join-Path $ScriptPath $InfFileName

# 2. Verificar existencia del archivo INF
if (-not (Test-Path $InfFilePath)) {
    Write-Error "Error: El archivo INF '$InfFileName' no se encontró en la ruta esperada ($ScriptPath)."
    Write-Host "Asegúrate de que el archivo '$InfFileName' y las carpetas de arquitectura (x64, x86, etc.) estén en la misma carpeta que el instalador EXE."
    Write-Host ""
    Write-Host "Presiona cualquier tecla para salir..."
    $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown") | Out-Null
    exit 1
}

Write-Host "[OK] Directorio de Archivos: $ScriptPath" -ForegroundColor Green
Write-Host "[OK] Archivo INF encontrado" -ForegroundColor Green

# 3. CAMBIAR EL DIRECTORIO DE TRABAJO (CRÍTICO)
# Esto garantiza que PnPUtil, que lee las rutas relativas del INF, funcione correctamente.
Set-Location $ScriptPath

Write-Host "Directorio de trabajo cambiado a: $(Get-Location)"

# 4. Usar PnPUtil para agregar e instalar el paquete de controlador.
$PnPUtilRelativePath = $InfFileName

Write-Host ""
Write-Host "[2/4] Ejecutando PnPUtil..." -ForegroundColor Yellow
Write-Host "Comando: pnputil.exe /add-driver $PnPUtilRelativePath /install" -ForegroundColor Gray

try {
    # Redirigimos 2>&1 para capturar tanto la salida normal como los errores.
    $PnPUtilResult = pnputil.exe /add-driver $PnPUtilRelativePath /install 2>&1
    
    Write-Host "--- Salida de PnPUtil ---" -ForegroundColor Cyan
    $PnPUtilResult | ForEach-Object { Write-Host $_ }
    Write-Host "-------------------------" -ForegroundColor Cyan
    Write-Host ""

    $outputText = $PnPUtilResult | Out-String
    
    Write-Host "[3/4] Analizando resultado..." -ForegroundColor Yellow

    # Nuevo análisis más robusto que incluye frases comunes de éxito.
    if ($outputText -match "agregado correctamente|successfully added" -and $outputText -match "Driver package installed") {
        Write-Host "✓✓✓ ¡INSTALACIÓN EXITOSA! ✓✓✓" -ForegroundColor Green
        Write-Host "El driver se instaló correctamente. Conecta tu dispositivo." -ForegroundColor Cyan
    } 
    elseif ($outputText -match "ya está instalado|already installed|already published") {
        Write-Host "✓ El driver ya estaba instalado en el sistema" -ForegroundColor Cyan
    }
    elseif ($outputText -match "error|failed|falló|hash") {
        Write-Host ""
        Write-Error "✗ ERROR CRÍTICO durante la instalación"
        Write-Host "El driver no pudo ser instalado por un error de firma o archivos faltantes." -ForegroundColor Red
    }
    else {
         # Si no podemos detectar el éxito o el fracaso, mostramos la advertencia.
         Write-Host "⚠ Advertencia: No se pudo confirmar el estado exacto." -ForegroundColor Yellow
         Write-Host "Revisa la salida de PnPUtil arriba, si dice 'successfully added' o 'agregado correctamente', puedes ignorar esta advertencia." -ForegroundColor Yellow
    }

} catch {
    Write-Host ""
    Write-Error "✗ Excepción al ejecutar PnPUtil"
    Write-Error $_.Exception.Message
}

# 5. Bloqueo al final
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Presiona cualquier tecla para salir..."
$Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown") | Out-Null