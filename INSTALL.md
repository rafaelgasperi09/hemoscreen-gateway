# Instrucciones de Compilación para Windows 🪟

Sigue estos pasos para generar el instalador (.exe) del HemoScreen Gateway en una computadora con Windows.

## 1. Requisitos Previos
- Instalar **Node.js** (versión 18 o superior). Puedes bajarlo de: [nodejs.org](https://nodejs.org/)
- Descargar el código del proyecto a tu computadora Windows.

## 2. Preparar el Proyecto
Abre una terminal (CMD o PowerShell) en la carpeta del proyecto y ejecuta:

```bash
# Limpiar instalaciones previas (opcional pero recomendado)
rmdir /s /q node_modules
del package-lock.json

# Instalar todas las dependencias
npm install
```

> [!TIP]  
> Hemos migrado a `better-sqlite3` porque es mucho más estable y fácil de instalar en Windows que el controlador estándar. No requiere herramientas pesadas de compilación de C++ en la mayoría de los casos.

## 3. Generar el Instalador (.exe)
Una vez instaladas las dependencias, ejecuta el comando de empaquetado:

```bash
# Crear el instalador para Windows
npm run dist
```

## 4. Ubicación del Instalador
Cuando el proceso termine, se creará una carpeta llamada `dist/`. Dentro de ella encontrarás:
- `HemoScreen Gateway Setup 1.0.0.exe`: El instalador que puedes llevar a cualquier consultorio.

## 5. Instalación en el Consultorio
1. Ejecuta el `.exe`.
2. Sigue los pasos de la **Guía de Instalación Rápida** integrada en la aplicación para configurar la IP del HemoScreen y los datos del SaaS.

---
## Solución a errores comunes 💡

### Error: "la ejecución de scripts está deshabilitada..."
Si al ejecutar `npm` en PowerShell ves un error de "SecurityError", ejecuta este comando en la misma terminal para habilitar los scripts:

```powershell
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
```
(Escribe `S` y presiona Enter cuando te pregunte).

Alternativamente, puedes usar el **Símbolo del Sistema (CMD)** en lugar de PowerShell, el cual no tiene esta restricción.

---
**Desarrollado por Meditech SaaS**
