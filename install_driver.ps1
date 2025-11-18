
$InfFileName = "silabser.inf"

$ScriptPath = Split-Path -Parent $MyInvocation.MyCommand.Definition

Write-Host "Iniciando la instalación del controlador universal..."

$InfFilePath = Join-Path $ScriptPath $InfFileName

Write-Host "Archivo INF a buscar: $InfFilePath"

if (-not (Test-Path $InfFilePath)) {
    Write-Error "Error: El archivo INF '$InfFileName' no se encontró en la ruta esperada."
    Write-Host "Asegúrate de que el archivo '$InfFileName' esté en la misma carpeta que este script."
    exit 1
}

Write-Host "Archivo INF encontrado. Instalando..."

$PnPUtilRelativePath = $InfFileName

Write-Host "Ejecutando PnPUtil con ruta relativa: $PnPUtilRelativePath"
try {
    $PnPUtilResult = pnputil.exe /add-driver $PnPUtilRelativePath /install /quiet
    
    Write-Host "Resultado de PnPUtil:"
    Write-Host $PnPUtilResult

    if ($PnPUtilResult -match "successfully added" -or $PnPUtilResult -match "is already installed") {
        Write-Host "¡Éxito! El paquete del controlador se agregó e intentó instalar." -ForegroundColor Green
    } else {
        Write-Host "Advertencia: La instalación completó. Revisa el resultado de PnPUtil arriba para confirmar la instalación." -ForegroundColor Yellow
    }

} catch {
    Write-Error "Ocurrió un error al ejecutar PnPUtil. Asegúrate de tener permisos de administrador."
    Write-Error $_
    exit 1
}

Write-Host ""
Write-Host "Presiona cualquier tecla para salir..."
$Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown") | Out-Null