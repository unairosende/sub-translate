# Arquitectura objetivo — captio

Cómo estaría montada la app si se empezase hoy, sabiendo que las funcionalidades ya
existen, y con intención de venderla. Complementa [ROADMAP.md](ROADMAP.md): el roadmap
dice *qué* falta, este documento dice *dónde va cada cosa* y *en qué orden llegar*.

Estado de partida: `index.html` de 4395 líneas (HTML + CSS + JS en un fichero),
funciones serverless en `api/`, PocketBase en un NAS de oficina.

---

## Premisa: no reescribir de cero

Las features son la parte difícil y ya están construidas. Dentro de `index.html` hay
conocimiento que costó depurar:

- snap a fronteras de frame de 25fps en `secToSrt`
- `normalizeTc` y el CSV con timecodes basados en frames
- el prompt de traducción, que re-segmentaba hasta separar `TRANSLATION_LINE_RULES`
  de `SUBTITLE_TIMING_RULES`
- los umbrales de QC (cps, duración, gaps, solapes) ya calibrados

Una reescritura pierde eso y lo redescubre a base de bugs, con clientes dentro.

Pero el fichero único, sin tipos, sin tests, con estado global mutable (`subtitles`,
`translations`, `activeTab`, `settings`) y deploy directo a producción **sí** es el
techo: un edit malo tumba a todos los clientes a la vez.

**La estrategia es extraer el núcleo puro y reconstruir la carcasa.** La carcasa (auth,
organizaciones, facturación, listado de proyectos) casi no existe hoy, así que ahí no se
tira nada. El editor se porta casi literal.

---

## Estructura de carpetas

```
captio/
├─ app/
│  ├─ (marketing)/          landing · precios · legal (ToS, privacidad, DPA)
│  ├─ (auth)/               login · signup · aceptar-invitación
│  ├─ (app)/
│  │   ├─ projects/         listado, crear, duplicar
│  │   ├─ editor/[id]/      ← la isla cliente pesada
│  │   └─ settings/         org · miembros · facturación · uso
│  └─ api/
│      ├─ translate/  transcribe/  align/
│      ├─ stripe/webhook/
│      └─ jobs/             callbacks de transcripción asíncrona
│
├─ lib/
│  ├─ subtitles/            ← EL ACTIVO. parse · format · qc · timecode · split
│  ├─ ai/                   gemini · groq · openrouter · mistral tras un interfaz
│  ├─ db/                   schema + queries (Drizzle)
│  ├─ auth/                 sesión + org actual + permisos
│  └─ billing/              planes, cuotas, enforcement
│
├─ components/
│  ├─ editor/               timeline · cue-card · transport · waveform
│  └─ ui/
│
└─ tests/
   ├─ subtitles/            unitarios, sin navegador, rápidos
   └─ tenancy/              la org A no puede leer datos de la org B
```

Lo importante de este árbol es **`lib/subtitles/`**: lógica pura, sin DOM, testeable al
100%, y lo único que no se puede comprar ni regenerar con facilidad. Todo lo demás
(auth, orgs, pagos, storage) es commodity.

No convertirlo en paquete npm aparte mientras solo haya un consumidor — una carpeta
basta.

---

## Capas

```
NAVEGADOR
┌─────────────────────────┬──────────────────────────────────┐
│  Shell — server render  │  Editor — isla cliente           │
│  landing · login · org  │  timeline · cards · JKL · atajos │
│  proyectos · ajustes    │  estado local + autosave debounce│
│  facturación · uso      │  consume lib/subtitles           │
└─────────────────────────┴──────────────────────────────────┘
              │                          │
              ▼                          ▼
       ┌──────────────────────────────────────┐
       │  Next.js en Vercel                   │
       │  server actions + /api/*             │
       │  → cada request lleva org_id         │
       └──────────────────────────────────────┘
          │            │            │            │
          ▼            ▼            ▼            ▼
     ┌────────┐  ┌──────────┐  ┌────────┐  ┌─────────┐
     │Postgres│  │ Blob/R2  │  │ Auth   │  │ Stripe  │
     │Neon/Sup│  │ media    │  │ +orgs  │  │         │
     └────────┘  └──────────┘  └────────┘  └─────────┘
                                    │
                       ┌────────────┴─────────────┐
                       ▼                          ▼
                  Gemini/Groq/…            ElevenLabs Scribe
                  (traducción)             (transcripción)
```

Cambio clave frente a hoy: **el NAS sale del camino crítico.** Pasa a ser, como mucho,
archivo frío. Hoy un corte de luz en la oficina deja caídos a todos los clientes.

El reparto server/cliente encaja bien con este producto: la carcasa es contenido
navegable y renderizable en servidor; el editor es una única isla cliente pesada
(canvas de timeline, transporte JKL, atajos de teclado) que no gana nada con SSR.

---

## Modelo de datos

```
organizations ─┬─< org_members >─ users
               ├─< subscriptions      (stripe_customer, plan, estado)
               ├─< usage_events       (kind, model, units_in/out, cost)
               └─< projects ─┬─< media
                             ├─< comments
                             └─< project_versions   (histórico / undo)
```

`projects.data` sigue siendo **jsonb** (subtítulos + traducciones como blob). Funciona
hoy y no se vende colaboración en tiempo real. Normalizar a fila-por-cue solo si algún
día se vende.

Lo que sí conviene añadir desde el principio: `project_versions`. "Un cliente borró tres
horas de trabajo" es una llamada de soporte garantizada.

La organización es la unidad de facturación **y** de permisos. Cada consulta se filtra
por `org_id`; esa invariante se cubre con los tests de `tests/tenancy/`.

---

## Comprar vs construir

| Pieza | Decisión | Por qué |
|---|---|---|
| Auth + orgs + invitaciones + SSO | **Comprar** (Clerk / WorkOS / Better Auth self-host) | Resuelve A-1, A-2 y A-4 del roadmap de golpe. Construir orgs a mano son semanas, y es justo donde aparecen los fallos de aislamiento |
| Facturación | **Comprar** (Stripe) | Obvio |
| Base de datos | **Gestionada** (Neon / Supabase) | Backups y point-in-time recovery incluidos → B-6 resuelto |
| Media | **Blob / R2** | Elimina el tope de 100 MB de Cloudflare free |
| Núcleo de subtítulos | **Construir** | Es el producto |
| Prompts y reglas de QC | **Construir** | Es el producto |

Verificar tarifas de Clerk / WorkOS antes de elegir: cambian a menudo.

---

## Pasos, en orden

**1 · Decidir el modelo de tenencia.** Organización como unidad de facturación y de
permisos. Todo lo demás depende de esto, y cambiarlo con datos dentro es una migración
dolorosa.

**2 · Extraer `lib/subtitles/` del `index.html` actual, con tests.** Se puede hacer
**hoy**, sin tocar nada más, sobre el repo que ya existe. Es el puente: el mismo módulo
sirve a la app vieja y a la nueva. Empezar por parse/format de SRT y `qcIssues` — son
puros y ya están aislados conceptualmente.

**3 · Levantar el shell nuevo en paralelo**, en `app.captio.studio`, con auth+orgs
comprado y Postgres. Sin editor todavía: solo login, organización y listado de proyectos
vacío. Se despliega y lo prueba la oficina.

**4 · Portar el editor como isla cliente.** Copia bastante literal del JS actual,
consumiendo `lib/subtitles`. Aquí es donde paga TypeScript: las estructuras de cue y el
estado global se tipan y dejan de romperse en silencio.

**5 · Migrar los datos** de PocketBase a Postgres (script único: proyectos + media). La
oficina valida con proyectos reales.

**6 · Facturación y legal**, y apagar la app vieja.

Estrangulamiento, no big bang: la app actual sigue sirviendo a la oficina hasta el
paso 5.

---

## Lo que NO hacer

- **No microservicios.** Todo cabe en un despliegue de Next.js durante mucho tiempo.
- **No paquete npm separado** para el núcleo de subtítulos mientras haya un solo
  consumidor.
- **No normalizar los cues a filas** hasta que se venda edición en tiempo real.
- **No reescribir el editor desde cero.** Portarlo.
