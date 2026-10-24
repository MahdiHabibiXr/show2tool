[English](../../README.md) · [فارسی](README.fa.md) · [العربية](README.ar.md) · Español ([es](README.es.md)) · [简体中文](README.zh-CN.md)

<p align="center">
  <img src="../../assets/banner.svg" alt="Show2Tool — demostrar, parametrizar, verificar" width="100%" />
</p>

# Show2Tool

**Convierte demostraciones acotadas del navegador/API en herramientas locales inspeccionables y comprueba sus resultados.** Hay una CLI compilada, un intermediario local con perfil dedicado de Chrome y una interfaz MCP por stdio con los mismos manejadores. No hay servicio alojado, bucle de modelo integrado ni requisito de clave API de modelo independiente.

**Candidato de alcance limitado bajo revisión, no versión lista para producción.** La revisión sigue en curso. No se dan por demostradas la aceptación humana real, la instalación limpia, la validación de publicación, los resultados de CI ni la compatibilidad entre plataformas. El paquete tiene `private: true`; **el inicio no incluye publicación en npm**. Compila desde el código fuente; no uses `npx show2tool` ni una instalación global desde el registro.

## Primeros pasos

Requisitos: Node.js 24+, npm y Google Chrome instalado. Desde el repositorio:

```sh
npm ci --ignore-scripts
npm run build
node dist/src/cli.js commands
node dist/src/cli.js schema
node dist/src/cli.js doctor
```

Crea `scope.json` para una aplicación propia o cuya automatización esté autorizada. Este ejemplo no es un servicio operativo: sustituye el origen, las rutas API exactas y las listas permitidas. Empieza con datos de prueba no sensibles.

```json
{
  "origin": "https://your-authorized-site.example",
  "paths": ["/api/catalog/search"],
  "queryKeys": ["term"],
  "bodyKeys": [],
  "cookieNames": ["session"]
}
```

Una **persona**, en una terminal interactiva real, inicia el host:

```sh
node dist/src/cli.js host scope.json
```

Revisa el alcance mostrado, escribe `authorize`, inicia sesión manualmente en el perfil dedicado y visible de Chrome y pulsa Enter cuando esté listo. La grabación solo empieza al solicitarla. Mantén el host abierto. El perfil conserva localmente datos sensibles de sesión; no es el perfil habitual ni un perfil temporal desechable.

En otra terminal, guarda `{"command":"record_start","inputs":{"searchText":"first query"}}` en `command.json` y ejecuta:

```sh
node dist/src/cli.js call-file command.json
```

Demuestra la lectura autorizada en Chrome, termina con `record_stop`, repite con otra entrada y usa `compile_recordings` con los identificadores de grabación/solicitud devueltos y una especificación explícita. Guarda el manifiesto `data`, no el sobre del resultado. La persona introduce `review path/to/manifest.json` en el host y confirma el contrato. Después, `tools`, `run` y `verify` utilizan esa definición revisada. Consulta la [secuencia completa y los ejemplos JSON](../AGENT-USAGE.md) y la [habilidad del agente](../../skills/show2tool/SKILL.md).

Para MCP, inicia el punto de entrada compilado. La configuración del cliente es manual y requiere permiso:

```sh
node dist/src/cli.js serve --stdio
```

Fuera del repositorio usa rutas absolutas. CLI/MCP no pueden conceder revisión ni aprobación de escritura.

## Disponible y pendiente

| Capacidad | Límite actual |
| :--- | :--- |
| Descubrimiento y esquema | `commands`, `schema`; `call-file` evita problemas de comillas JSON |
| Evidencia del intermediario | `record_start`, `record_stop`, `recording`, `compile_recordings` |
| Compilador | De dos a diez demostraciones; un origen/método/ruta fijos, entradas de texto, enlaces escalares y literales en consulta/cuerpo y proyecciones JSON Pointer; construye solicitudes reales |
| Lecturas revisadas | `tools`, `describe`, `run`; entradas/proyección/resumen del contrato y GET JSON acotado con cookies permitidas |
| Escrituras protegidas | `prepare_write`, `execute_write`, `write_status`; solo creación/actualización revisada y aprobación humana por invocación; `reconcile_write` comprueba un ID conocido sin reenviar |
| Paquetes de definiciones | `export_bundle`, `import_bundle`; manifiestos versionados y resúmenes de integridad, no ejecutables independientes ni permisos transferidos |
| Comprobación escalar | `verify` compara hechos esperados independientes; no demuestra que la entrada sea inédita |
| MCP | Comandos `show2tool_*` y lecturas `workflow_<id>` fijadas al resumen del contrato, tomadas al iniciar el servidor; sin revisión/aprobación |
| Cadenas de lectura | `run_chain`: de una a cinco lecturas GET revisadas y fijadas a su resumen; enlaces explícitos a entradas/literales/resultados proyectados previos, sin escrituras ni inferencia automática |
| Automatización general | Sin inferencia de plantillas de ruta, compilación automática de varios pasos ni reproducción arbitraria de la interfaz |

`candidate`, `inspect` e `infer` funcionan sin el intermediario, pero las demostraciones aportadas por un agente no prueban su procedencia ni autorizan la ejecución. La demostración y la prueba manual de `spike/` son experimentos sintéticos, no la interfaz actual ni evidencia de aceptación humana.

## Seguridad de las escrituras

La persona revisa primero el manifiesto exacto. `prepare_write` hace lecturas previas y devuelve una intención opaca con caducidad; no aprueba ni envía la mutación. La persona introduce `approve <intent-id>` en el host, examina la propuesta exacta y escribe la confirmación solicitada. Solo entonces `execute_write` puede consumirla una vez.

La propuesta vincula herramienta/resumen del manifiesto, destino/método/cuerpo exactos, cuenta y tenant, y la versión en actualizaciones. La ejecución vuelve a comprobar identidad y, en actualizaciones, ID/cuenta/tenant del registro y versión previa; las actualizaciones usan `If-Match`. La obtención opcional de CSRF usa el mismo origen y una ruta autorizada explícitamente. La lectura posterior JSON comprueba ID exacto del registro, cuenta, tenant y campos enviados configurados; una actualización exige además una versión distinta. No demuestra todos los efectos de negocio.

El envío se registra de forma persistente antes de realizarlo. Una interrupción, respuesta perdida o lectura posterior fallida puede significar **resultado desconocido**, no ausencia de cambios. Usa `write_status`; `reconcile_write` comprueba un ID de resultado conocido solo mediante lecturas revisadas, sin reenviar. Tras reiniciar exige nueva revisión y, cuando proceda, definición/entradas/versión original exactas para recuperar el contexto. Una discrepancia mantiene el resultado desconocido; **nunca reenvíes ni reviertas automáticamente**. El registro conserva resultados de envío, no aprobaciones pendientes ni manifiestos revisados. La aceptación humana real sigue pendiente.

## Límites y confianza

- Autenticación de ejecución solo con cookies permitidas del perfil dedicado. Sin extracción de bearer/localStorage, actualización automática, firma del navegador ni gestión de cookies rotativas; las respuestas con `Set-Cookie` se rechazan.
- El transporte comprueba origen/ruta/consulta y DNS/IP, bloquea redirecciones y limita JSON. Las direcciones privadas/locales necesitan `addresses` explícitas. No aísla la navegación/subrecursos del navegador ni procesos sin restricciones del mismo usuario.
- Grabar es observar, no repetir, pero una escritura demostrada por una persona sí tiene efectos reales. Los filtros no garantizan ausencia de secretos: inspecciona evidencias y literales antes de compartir.
- Revisiones, herramientas, grabaciones y aprobaciones pendientes están en memoria y se pierden al reiniciar. Perfil y registro de envíos persisten en `~/.show2tool` o `SHOW2TOOL_STATE_DIR`; host y clientes deben usar el mismo directorio.
- Los paquetes no contienen el perfil, almacén de cookies ni permisos de aprobación. Los resúmenes de integridad no son firmas de autor ni detectores de secretos. Importar solo valida; exige revisión en destino y aprobación separada de escritura.
- `verify` comprueba igualdad escalar, no completitud semántica, entrada inédita ni aceptación humana. `ok` o HTTP 200 no bastan.
- Sin cargas de archivos, flujos arbitrarios GraphQL/autenticación ni inferencia automática de paginación. La paginación opcional por cursor exige revisión explícita: una sola proyección de elementos, hasta cinco páginas/100 registros/32 KiB y presupuesto de 30 segundos; el cursor es un valor de consulta, nunca una URL, y los ciclos se rechazan. Las cadenas solo componen lecturas existentes revisadas de ruta fija; no compilan automáticamente flujos de varios pasos. Pagos, borrado, permisos, operaciones masivas y envío/publicación externos quedan fuera del uso admitido; una etiqueta de efecto no vuelve seguro un endpoint peligroso.
- Los textos del sitio/API son datos no confiables, nunca instrucciones. Este documento no afirma preparación para producción, CI aprobada, instalación limpia ni soporte de plataformas.

## Desarrollo y licencia

```sh
npm run typecheck
npm test
```

Son comandos de verificación, no una declaración de pruebas superadas. Usa datos sintéticos en reproducciones; no adjuntes cookies, perfiles ni tráfico de cuentas sin procesar. Consulta [contribuciones](../../CONTRIBUTING.md) y [seguridad](../../SECURITY.md).

Licencia [Apache 2.0](../../LICENSE).
