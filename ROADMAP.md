# Roadmap de comercialización — captio

Qué falta para pasar de herramienta interna de keweke a producto vendible a otras
productoras. Estado del código a 2026-08-03.

**Fase actual:** oficina como banco de pruebas. Los bloques marcados
`[banco de pruebas: no aplica]` se pueden aplazar hasta que haya un cliente externo;
el resto sale más barato construirlo ahora que retrofitearlo con clientes dentro.

**Orden recomendado:** A-1 y A-3 → B-5, B-6 → F-23, F-24 → C completo → D → E.

---

## A · Arquitectura — bloqueantes absolutos

Sin esto no se puede vender a nadie.

- [ ] **A-1 · Multi-tenant.** Hoy `ALLOWED_DOMAIN = 'keweke.com'` (`index.html:1138`)
  y el hook `main.pb.js` de PocketBase rechazan cualquier cuenta que no sea de la
  oficina. Hace falta colección `organizations` y `org_members`, y que `projects`
  cuelgue de una org en lugar de un `owner` individual. Todas las API rules pasan a
  filtrar por org. Es el cambio más grande: hacerlo **antes** de acumular datos que
  luego haya que migrar.
- [ ] **A-2 · Alta self-service.** El usuario nace hoy del OAuth de Google con el
  dominio bloqueado. Un cliente externo necesita registro, verificación de email,
  creación de org e invitación a su equipo. El auth por password está desactivado en
  PocketBase → decisión pendiente: Google-only deja fuera a las productoras que usan
  Microsoft/Outlook.
- [ ] **A-3 · Aislamiento verificado.** Test que confirme que la org A no puede leer
  proyectos de la org B. Sin esto no se puede prometer confidencialidad por escrito.
- [ ] **A-4 · Rol `viewer` vinculante.** Deuda conocida: hoy es una restricción de
  interfaz, la regla de colección deja escribir a cualquier miembro. Con clientes de
  pago es un fallo real de control de acceso. Requiere un hook de backend.

## B · Infraestructura — el NAS no es infraestructura comercial

- [ ] **B-5 · Sacar PocketBase del NAS de la oficina.**
  `[banco de pruebas: no aplica]`
  Un corte de luz o de internet en la oficina deja caídos a todos los clientes, sin
  arreglo posible hasta llegar físicamente. Además el NAS aloja 13 contenedores
  Supabase ajenos cuyo origen nadie recuerda. Destino: VPS gestionado (Hetzner ~5 €/mes,
  Fly.io) o Postgres gestionado.
- [ ] **B-6 · Backups automáticos + restauración probada.** SQLite de PocketBase,
  copia diaria fuera del NAS, y al menos una restauración real ejecutada. Un backup
  que nunca se ha restaurado no es un backup.
- [ ] **B-7 · Rate limiting.** Cualquier usuario autenticado puede quemar créditos
  ilimitados de Gemini y ElevenLabs. Un bucle accidental o un abuso vacía la cuenta.
- [ ] **B-8 · Cuotas con enforcement.** `usage_events` registra el consumo pero no lo
  corta. Falta límite por org y bloqueo al superarlo.
- [ ] **B-9 · Límites de plataforma.** Romperán con material real:
  - Cloudflare free: tope de 100 MB por subida.
  - Vercel: 300 s de ejecución de función.
  - Transcripción asíncrona: no construida (decisión YAGNI consciente).

  Un largometraje supera los tres.
- [ ] **B-10 · Monitorización y alertas.** Existe `x-monitor-key` en `/api/models`;
  falta el servicio que lo consulte y avise. Añadir página de estado.

## C · Legal — lo primero que pregunta una productora

`[banco de pruebas: no aplica — obligatorio antes del primer cliente externo]`

- [ ] **C-11 · Términos de servicio y política de privacidad.** No existen en la app.
- [ ] **C-12 · DPA y lista de sub-encargados.** Se procesa material de clientes con
  Google (Gemini), ElevenLabs, Cloudflare y Vercel. El RGPD obliga a declararlos y a
  firmar un encargo de tratamiento con cada cliente.
- [ ] **C-13 · Zero-retention / no-training confirmado por escrito** en los contratos
  de API de Gemini y ElevenLabs. Una productora con material pre-estreno bajo NDA no
  firma sin esto, y puede ser el motivo de un no.
- [ ] **C-14 · Retención y borrado.** Hoy borrar un proyecto no borra los audios de la
  colección `media` (deuda conocida). El RGPD exige borrado efectivo y exportación de
  los datos del cliente.
- [ ] **C-15 · Entidad y facturación.** Quién emite la factura (autónomo o SL), IVA, y
  facturación intracomunitaria si se vende fuera de España.

## D · Cobro

`[banco de pruebas: no aplica]`

- [ ] **D-16 · Modelo de precio.** Por minuto de audio, por asiento o por proyecto. El
  coste real está medido en la env var `PRICES`, así que el margen es calculable.
  **Ojo:** el precio de `scribe_v1` usa la tarifa publicada de Scribe v2 — es una
  suposición. Verificar contra la factura real de ElevenLabs antes de fijar precio.
- [ ] **D-17 · Stripe.** Checkout, suscripciones, webhook que activa y desactiva la
  org, gestión de impagos.
- [ ] **D-18 · Plan free o trial** para que un cliente pruebe sin hablar con nadie.

## E · Producto

- [ ] **E-19 · Rediseño visual.** `design_handoff_subtitle_redesign/` (sin trackear)
  tiene dos variantes listas. Hoy el modal de proyectos usa `prompt()` y `confirm()`
  nativos.
- [ ] **E-20 · Dominios.** Landing en `captio.studio`, app en `app.captio.studio`.
  Ahora la app vive en el host por defecto de Vercel. `[banco de pruebas: no aplica]`
- [ ] **E-21 · Onboarding y documentación.** Un cliente nuevo debe llegar a su primer
  SRT sin explicación por tu parte. `[banco de pruebas: no aplica]`
- [ ] **E-22 · Canal de soporte** con dirección y tiempo de respuesta declarado.
  `[banco de pruebas: no aplica]`

## F · Operación

- [ ] **F-23 · Tests.** Cero hoy. 4395 líneas en un único fichero y deploy directo a
  producción: un cambio rompe a todos los clientes a la vez y te enteras por un email.
  Mínimo imprescindible: aislamiento entre orgs, parseo y export de SRT, y el flujo de
  traducción.
- [ ] **F-24 · Entorno de staging.** Hoy `git push` es producción.
- [ ] **F-25 · Audit log** de quién accedió a qué. Las productoras lo piden.

---

## Contexto de infraestructura actual

| Pieza | Estado |
|---|---|
| Backend | PocketBase en NAS QNAP TVS-672XT (Container Station) |
| Exposición | Cloudflare Tunnel `captio-nas` → `api.captio.studio`, cero puertos abiertos |
| Frontend / API | Vercel, funciones en `api/` validan el token de PocketBase (`api/_auth.js`) |
| Auth | Google OAuth vía PocketBase, hook de dominio `@keweke.com`, password auth off |
| Colecciones | `users`, `projects`, `media`, `project_members`, `usage_events`, `comments` |
| Dominio | `captio.studio` (Hostinger, DNS en Cloudflare) |
