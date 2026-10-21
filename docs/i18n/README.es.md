<p align="center">
  <img src="../../assets/banner.svg" alt="Show2Tool — demostrar, parametrizar, verificar" width="100%" />
</p>

<p align="center">
  <a href="../../README.md">English</a> ·
  <a href="README.fa.md">فارسی</a> ·
  <a href="README.ar.md">العربية</a> ·
  <a href="README.es.md">Español</a> ·
  <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="#quick-start">Inicio rápido</a> ·
  <a href="#how-it-works">Cómo funciona</a> ·
  <a href="#built-vs-planned">Implementado y previsto</a> ·
  <a href="#safety-model">Modelo de seguridad</a> ·
  <a href="#roadmap">Hoja de ruta</a>
</p>

<p align="center">
  <img alt="Etapa: prototipo de viabilidad" src="https://img.shields.io/badge/stage-feasibility_prototype-277a99?style=flat-square" />
  <img alt="Node.js 24+" src="https://img.shields.io/badge/Node.js-24%2B-426c51?style=flat-square" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square" />
  <img alt="Prioridad al funcionamiento local" src="https://img.shields.io/badge/local--first-no_hosted_service-526576?style=flat-square" />
</p>

## Convierte una demostración en algo que puedas comprobar

**Show2Tool explora una idea sencilla: demostrar un flujo de trabajo en el navegador, identificar sus entradas y verificar el resultado con un ejemplo que no haya visto.**

El prototipo actual captura tráfico de API desde una sesión aislada de Chrome, infiere correspondencias sencillas entre entradas y parámetros, y las reproduce contra una aplicación sintética. También prueba autorizaciones de un solo uso y la verificación mediante lectura posterior para acciones acotadas de creación y actualización.

El objetivo a más largo plazo es una habilidad local y una CLI que exporten herramientas CLI/MCP reutilizables. **Ese proceso de exportación aún no está implementado.** La versión alfa orientada principalmente a agentes está en desarrollo y todavía no está disponible.

> [!IMPORTANT]
> **Prototipo de investigación, no automatización para producción.** Solo se admiten entornos de prueba locales sintéticos. No uses el prototipo experimental con cuentas reales. No hay una versión publicada en npm ni un servidor MCP instalable.

<a id="quick-start"></a>

## Inicio rápido

**Requisitos:** Node.js 24+, npm y Google Chrome. Windows es la plataforma en la que se realizan actualmente las pruebas; una prueba de integración de CDP usa la ruta de instalación estándar de Chrome en Windows.

```sh
git clone https://github.com/MahdiHabibiXr/show2tool.git
cd show2tool
npm ci --ignore-scripts
npm run demo
```

La demostración abre un perfil temporal y aislado de Chrome **sin interfaz gráfica (headless)**, demuestra dos búsquedas y comprueba una tercera. No accede a tu perfil habitual de Chrome ni requiere una clave de API de un modelo.

### Qué muestra una ejecución correcta

```json
{
  "status": "passed",
  "scope": "synthetic fixture only",
  "trainingInputs": ["alpha", "beta"],
  "heldOutInput": "gamma",
  "resultIds": ["a3"],
  "writes": 0,
  "captureRows": 2
}
```

*Campos seleccionados de la salida de la demostración. Los tiempos, los recuentos de bytes y los hashes del contrato dependen de cada ejecución. Esto no es una prueba comparativa de rendimiento.*

### Conserva e inspecciona las evidencias

```sh
# Choose a directory that does not exist yet.
npm run demo -- --out my-new-evidence

# Group captured endpoints without returning approved scalar values.
npm run cli -- inspect my-new-evidence/recording.json

# Inspect the parameter mapping learned from annotated demonstrations.
npm run cli -- infer my-new-evidence/demonstrations.json
```

Los artefactos guardados contienen grabaciones sintéticas, demostraciones anotadas y un informe de resultados, no una herramienta ejecutable exportada. Las evidencias existentes nunca se sobrescriben.

<a id="how-it-works"></a>

## Cómo funciona

```text
  Dos demostraciones           Procesamiento local             Prueba con entrada reservada
 ┌────────────────────┐       ┌────────────────────────┐       ┌───────────────────────────┐
 │ Buscar alpha       │       │ Acotar tráfico de API  │       │ Buscar gamma              │
 │ Buscar beta        │ ────▶ │ Inferir q → query      │ ────▶ │ Esperar el registro a3    │
 └────────────────────┘       │ Fijar el contrato      │       │ Comprobar efectos         │
                              └────────────────────────┘       └───────────────────────────┘
```

1. **Observar, no reproducir.** La captura mediante CDP, limitada al marco principal seleccionado, registra las solicitudes demostradas sin emitir escrituras adicionales.
2. **Mantener pequeñas las evidencias.** Se usan resúmenes centrados en el esquema de forma predeterminada. Los valores escalares de la consulta o del cuerpo requieren una lista explícita de valores permitidos.
3. **Rechazar la ambigüedad.** Varias entradas coincidentes o ejemplos sin cambios no cuentan como una correspondencia generalizada.
4. **Probar una entrada nueva.** Los datos del entorno de prueba, inicializados de forma independiente, proporcionan el resultado esperado.
5. **Tratar las escrituras por separado.** Una escritura necesita una intención de un solo uso y con caducidad, vinculada al destino, al tenant y al cambio exacto propuesto.

Un estado HTTP 200 y una estructura JSON válida no bastan: las pruebas también comprueban los registros seleccionados, el tenant, la versión de actualización y los efectos reales.

<a id="built-vs-planned"></a>

## Implementado y previsto

| Capacidad | Estado actual |
| :--- | :--- |
| Chrome aislado + captura mediante CDP | **Implementado y probado localmente** |
| Alcance del marco principal y límites de duración y retención | **Implementado**, con indicadores explícitos de información incompleta |
| Inferencia a partir de dos demostraciones de consultas y campos escalares de creación | **Implementado para entornos de prueba sintéticos** |
| Reproducción con una entrada no vista y dependencia búsqueda → detalle | **Implementado para entornos de prueba sintéticos** |
| Intenciones de creación/actualización vinculadas al destino y lectura posterior | **Implementado y probado**, con un adaptador de autorización inyectado |
| Terminación del proceso después de confirmar el cambio → resultado desconocido, sin reenvío | **Probado con un contador de efectos independiente** |
| Comandos compactos `inspect` e `infer` para demostraciones anotadas | **Implementado** |
| Confirmación humana en la terminal | Función auxiliar disponible; **prueba con una persona pendiente** |
| Compilador general de flujos de trabajo de sitios web | **Previsto** |
| Exportación de CLI/MCP ejecutables y portátiles | **Previsto** |
| Intermediario de confirmación entre procesos y habilidad pública | **Previsto** |

<a id="safety-model"></a>

## Modelo de seguridad

### Local de forma predeterminada

- Sin servicio alojado, bucle de modelo integrado ni clave de API de IA independiente.
- Perfiles temporales; no se copian las bases de datos de cookies del navegador ni tu perfil habitual de Chrome.
- La reproducción se limita a orígenes sintéticos registrados en el mismo proceso.
- Los señuelos de credenciales son datos de prueba, no credenciales de un servicio real.

### Efectos explícitos

- La grabación no reproduce las escrituras demostradas.
- Una intención de escritura caduca y se consume una sola vez; el destino y el tenant deben coincidir.
- Las actualizaciones con control de versión y la lectura posterior comprueban lo que ocurrió realmente.
- La pérdida de una confirmación de recepción o la interrupción del envío producen un resultado **desconocido**, nunca un reintento automático.
- No hay reversión automática: una acción compensatoria sería una escritura independiente.

### Límites descritos con honestidad

Estas comprobaciones previenen accidentes; **no constituyen aislamiento del sistema operativo frente a un proceso sin restricciones del mismo usuario**. CDP puede almacenar datos en un búfer antes de las comprobaciones de la aplicación; los límites de retención no son un tope estricto para toda la memoria de Chrome ni para la recepción de datos de red. El filtrado por claves no puede identificar todos los secretos ni todos los campos con datos personales.

Los pagos, la eliminación, los cambios de permisos, las operaciones masivas, la automatización con cuentas reales y el envío o la publicación externos quedan fuera del prototipo actual.

## Prueba de confirmación humana

Ejecuta lo siguiente en una terminal interactiva real:

```sh
npm run probe:manual
```

Muestra el destino, el tenant y la acción sintética exacta de creación. Escribe la frase solicitada `approve <intent-id>` para crear **una única tarea de prueba temporal**, o cualquier otra cosa para denegarla. La entrada no interactiva se rechaza antes de iniciar el entorno de prueba.

Las pruebas automatizadas del adaptador de autorización no sustituyen una ejecución con una persona. Esa comprobación de viabilidad sigue pendiente.

## Desarrollo

```sh
npm run typecheck
npm test
```

Las pruebas cubren el alcance del navegador, las correspondencias ambiguas, los fallos de tenant/autenticación, las discrepancias semánticas, la paginación acotada, la reutilización de autorizaciones, la expansión de gzip, la profundidad de JSON, las respuestas bloqueadas y la terminación real de procesos secundarios en torno al envío.

> [!NOTE]
> Se ha observado un fallo intermitente en una prueba de envíos concurrentes cuya causa raíz aún no se ha identificado. Las ejecuciones correctas son evidencia de esas ejecuciones, no una garantía de preparación para producción.

<details>
<summary><strong>Mapa del repositorio</strong></summary>

```text
spike/
  capture.ts         Observaciones CDP acotadas y límites de retención
  infer.ts           Correspondencias candidatas y detección de ambigüedad
  replay.ts          Transporte exclusivo de pruebas y flujos de lectura
  intents.ts         Intenciones de modificación vinculadas al destino
  journal.ts         Estado persistente de envío y recuperación
  approve.ts         Adaptador de confirmación local
  inspect.ts         Resúmenes compactos de grabaciones
  cli.ts             Punto de entrada de los comandos inspect / infer
  demo.ts            Proceso sintético de lectura ejecutable
  manual.ts          Prueba interactiva de escritura sintética
  fixture/           Aplicación local y estado independiente de efectos
test/
  spike/             Pruebas unitarias, de integración y de navegador
  helpers/           Procesos auxiliares para caídas de procesos reales
assets/
  banner.svg         Banner del repositorio
```

</details>

## Diferencias con CLI-Anything

[CLI-Anything](https://github.com/HKUDS/CLI-Anything) crea interfaces de línea de comandos adecuadas para agentes a partir de bases de código o de API existentes. Show2Tool parte del **tráfico de navegador/API demostrado** e investiga la generalización de parámetros, la confirmación explícita de escrituras y las comprobaciones independientes de resultados.

Ambos proyectos buscan que los agentes puedan utilizar software. No son la misma implementación y Show2Tool no incluye CLI-Anything. Esta distinción es una hipótesis de producto, no una afirmación de que otros proyectos carezcan de verificación.

<a id="roadmap"></a>

## Hoja de ruta

- [x] Captura sintética del navegador → inferencia → reproducción con una entrada no vista
- [x] Demostraciones de creación capturadas → escritura sintética autorizada → lectura posterior
- [x] Inspección compacta de evidencias y pruebas de resultados tras una caída
- [ ] Completar los criterios de viabilidad: confirmación humana en vivo y ejecución del competidor
- [ ] Generalizar el contrato de flujo de trabajo revisado y el entorno de ejecución
- [ ] Añadir el intermediario de autorización humana entre procesos
- [ ] Exportar paquetes CLI y MCP inspeccionables desde el mismo entorno de ejecución
- [ ] Empaquetar la habilidad de autoría y probarla en una sesión nueva de agente
- [ ] Publicar resultados de compatibilidad y pruebas comparativas reproducibles

## Contribuciones

Son útiles las reproducciones acotadas: una correspondencia ambigua de entradas, un indicador de omisión ausente, un resultado incorrecto o una regresión de privacidad. Usa datos sintéticos e indica el comando, el entorno, el resultado esperado y el resultado real. Nunca adjuntes cookies, perfiles de navegador ni tráfico sin procesar de cuentas.

**Aún no se ha seleccionado una licencia de código abierto.** Que el código fuente sea visible no concede derechos de redistribución. La licencia y el empaquetado para una publicación pública siguen siendo decisiones pendientes.
