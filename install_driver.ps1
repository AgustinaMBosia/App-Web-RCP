$InfFileName = "silabser.inf"
# Obtener la ruta de la carpeta donde se encuentra este script/EXE.
$ScriptPath = Split-Path -Parent $MyInvocation.MyCommand.Definition

Write-Host "Iniciando la instalación del controlador universal..."

# Diagnóstico de ubicación
Write-Host "Ubicación de ejecución actual: $(Get-Location)"
Write-Host "Ruta de los archivos de controlador: $ScriptPath"

# 1. Definir la ruta del archivo INF
$InfFilePath = Join-Path $ScriptPath $InfFileName

Write-Host "Archivo INF a buscar: $InfFilePath"

# 2. Verificar existencia del archivo INF
if (-not (Test-Path $InfFilePath)) {
    Write-Error "Error: El archivo INF '$InfFileName' no se encontró en la ruta esperada ($ScriptPath)."
    Write-Host "Asegúrate de que el archivo '$InfFileName' y las carpetas de arquitectura (x64, x86, etc.) estén en la misma carpeta que este script."
    exit 1
}

Write-Host "Archivo INF encontrado. Instalando..."

# *** CORRECCIÓN CRÍTICA: CAMBIAR EL DIRECTORIO DE TRABAJO ***
# Esto asegura que PnPUtil encuentre los archivos .sys en las subcarpetas (x64, x86, etc.).
Set-Location $ScriptPath

Write-Host "Directorio de trabajo cambiado a: $(Get-Location)"

# 3. Usar PnPUtil para agregar e instalar el paquete de controlador.
$PnPUtilRelativePath = $InfFileName

Write-Host "Ejecutando PnPUtil: pnputil.exe /add-driver $PnPUtilRelativePath /install"
try {
    # Comando: pnputil /add-driver [ruta_relativa_al_inf] /install
    $PnPUtilResult = pnputil.exe /add-driver $PnPUtilRelativePath /install
    
    Write-Host "Resultado de PnPUtil:"
    Write-Host $PnPUtilResult

    if ($PnPUtilResult -match "successfully added" -or $PnPUtilResult -match "is already installed") {
        Write-Host "¡Éxito! El paquete del controlador se agregó e intentó instalar. Conecta tu dispositivo." -ForegroundColor Green
    } 
    # El mensaje de uso (PNPUTIL [/add-driver) indica un fallo de permiso o un comando inválido.
    elseif ($PnPUtilResult -match "PNPUTIL \[/\? | /add-driver") {
        Write-Error "Error grave: PnPUtil falló. Esto suele indicar un problema de PERMISOS (No se ejecutó como Administrador)."
        Write-Host "Asegúrate de hacer clic derecho en el EXE y seleccionar 'Ejecutar como administrador'." -ForegroundColor Red
    }
    else {
         Write-Host "Advertencia: La instalación completó. Revisa el resultado de PnPUtil arriba para confirmar la instalación." -ForegroundColor Yellow
    }

} catch {
    Write-Error "Ocurrió un error (Excepción) al ejecutar PnPUtil. Asegúrate de tener permisos de administrador."
    Write-Error $_
    exit 1
}

# 4. Bloqueo al final para que el usuario pueda ver el resultado
Write-Host ""
Write-Host "Presiona cualquier tecla para salir..."
$Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown") | Out-Null