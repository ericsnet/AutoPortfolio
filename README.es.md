**Idiomas:** [English](README.md) | Español

# AutoPortfolio

**Un archivo estructurado, un sitio web de portafolio completo.**

AutoPortfolio es un generador de portafolios centrado en el contenido. Descríbete una sola vez —nombre, biografía, habilidades, proyectos, experiencia, formación, certificaciones y contacto— en un archivo YAML, JSON o TOML fácil de leer, y AutoPortfolio generará a partir de él un sitio estático rápido, accesible y adaptable. Las plantillas y los temas son independientes: puedes cambiar el aspecto sin tocar ni una palabra del contenido.

**Demo en vivo:** [Ver el portafolio de ejemplo generado](https://ericsnet.github.io/AutoPortfolio/). El flujo de trabajo `.github/workflows/pages.yml` genera el ejemplo y lo publica en GitHub Pages cuando cambian archivos de origen relevantes.

## Uso local frente al uso desde el navegador

AutoPortfolio ofrece actualmente un generador local completo y un **portfolio de ejemplo publicado en GitHub Pages**. La demo es un sitio generado, no un editor web para crear cualquier portfolio.

| | CLI local | Aplicación en el navegador mediante GitHub Pages |
|---|---|---|
| **Ventaja principal** | Ejecuta el generador existente directamente, con acceso a los archivos del proyecto y a plantillas personalizadas. | Permitiría usarlo desde el navegador sin instalar Node.js ni clonar el repositorio. |
| **Ideal para** | Tener control completo de archivos locales, recursos personalizados y compilaciones reproducibles. | Acceder rápidamente desde Chromebooks, móviles y ordenadores donde instalar herramientas resulte incómodo. |
| **Estado actual** | Disponible; consulta las instrucciones de instalación y CLI de abajo. | Todavía no está implementada. GitHub Pages no puede ejecutar el backend de Node.js ni las API del sistema de archivos que usa el generador actual. |
| **Requisito de paridad** | Es la implementación de referencia para las funciones actuales. | No debe presentarse como equivalente hasta que el motor compatible con el navegador admita las mismas plantillas, temas, validaciones, configuración y formatos de exportación. |

**Por qué importa:** GitHub Pages solo aloja archivos estáticos. Una versión real que no requiera instalación debe trasladar al navegador la lógica compatible del generador y sustituir las operaciones del sistema de archivos de Node.js por alternativas web. Hasta completar ese trabajo, el enlace de Pages es solo una demo del resultado generado, no una versión web completa de AutoPortfolio.

```console
$ npx autoportfolio init my-portfolio
$ cd my-portfolio
$ npx autoportfolio dev
  ➜  http://localhost:4173
```

---

## Tabla de contenido

- [Por qué existe AutoPortfolio](#por-qué-existe-autoportfolio)
- [Qué incluye](#qué-incluye)
- [Instalación](#instalación)
- [Inicio rápido](#inicio-rápido)
- [Cómo funciona](#cómo-funciona)
- [Referencia de configuración](#referencia-de-configuración)
- [Referencia de los datos del portafolio](#referencia-de-los-datos-del-portafolio)
- [Plantillas](#plantillas)
- [Temas](#temas)
- [Referencia de la CLI](#referencia-de-la-cli)
- [Publicación](#publicación)
- [Pruebas](#pruebas)
- [Desarrollo](#desarrollo)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Hoja de ruta](#hoja-de-ruta)
- [Licencia](#licencia)

---

## Por qué existe AutoPortfolio

La mayoría de los creadores de portafolios te obligan a elegir entre dos malas opciones: un editor de arrastrar y soltar que encierra tu contenido en un formato propietario, o un sitio escrito a mano donde tu CV, tu `index.html` y tu perfil de LinkedIn se van desactualizando poco a poco.

AutoPortfolio propone una tercera opción. **El contenido es un archivo de datos que te pertenece**, en un formato cuyas diferencias se comparan fácilmente en Git, y la presentación es un programa que lo procesa. Esto te ofrece:

- **Una única fuente de verdad.** Actualiza `portfolio.yaml`, vuelve a generar el sitio y todas las secciones —portada, proyectos, cronología, pie de página— estarán al día.
- **Separación de responsabilidades.** Añadir una plantilla nunca implica editar el contenido, y editar el contenido nunca implica tocar una plantilla.
- **Contenido que perdura más que la herramienta.** YAML, JSON y TOML son formatos que podrás leer dentro de diez años, con AutoPortfolio o sin él.
- **Una compilación real que puedes inspeccionar.** HTML estático, una hoja de estilos y un pequeño script de mejora progresiva. No se envía a tus visitantes ningún entorno de ejecución de un framework.

### Lo que deliberadamente no es

- No es un servicio alojado. Tus archivos permanecen en tu repositorio.
- No es una caja negra. El generador consta de unos 15 módulos que puedes leer en una tarde.
- No es una envoltura de otro generador de sitios estáticos. El motor de plantillas, los analizadores de YAML y TOML, el sistema de temas, la canalización de recursos y la capa de exportación están implementados aquí: **cero dependencias de ejecución**.

---

## Qué incluye

A partir de un único directorio de proyecto, `autoportfolio build` genera:

```
dist/
├── index.html                     # página principal
├── 404.html                       # página de error con estilos
├── projects/
│   ├── your-project/index.html    # una página por proyecto (opcional)
│   └── another-project/index.html
├── assets/
│   ├── css/site.css               # variables del tema + estilos base + estilos de la plantilla
│   └── js/autoportfolio.js        # alternancia del tema, navegación y pequeñas mejoras (~6 kB sin minificar)
├── favicon.svg                    # monograma generado si no proporcionas uno
├── social-card.svg                # imagen Open Graph generada a partir de tus datos
├── manifest.webmanifest           # manifiesto PWA
├── robots.txt
├── sitemap.xml
└── rss.xml                        # opcional
```

Todas las páginas son adaptables, navegables con teclado y están escritas en HTML semántico; incluyen un enlace para saltar al contenido, puntos de referencia correctos, compatibilidad con `prefers-reduced-motion`, datos estructurados JSON-LD y metadatos de Open Graph y Twitter Card. **Las secciones sin contenido se omiten por completo**: una lista de formación vacía no genera un encabezado vacío.

---

## Instalación

AutoPortfolio requiere **Node.js 18.17 o posterior**. No tiene dependencias de ejecución.

```console
# Clonarlo y enlazarlo globalmente
git clone https://github.com/ericsnet/AutoPortfolio.git
cd AutoPortfolio
npm install
npm link          # hace que el comando `autoportfolio` esté disponible en todas partes
```

También puedes ejecutarlo directamente desde una copia del repositorio, sin enlazarlo:

```console
node /path/to/AutoPortfolio/bin/autoportfolio.js build
```

Como biblioteca, todas las capas se pueden importar:

```js
import { loadProject, generateSite, resolveTheme } from './AutoPortfolio/src/index.js';

const project = await loadProject({ cwd: 'my-portfolio' });
const result = await generateSite(project, { outDir: 'public' });
console.log(result.pages.length, 'pages in', result.durationMs, 'ms');
```

---

## Inicio rápido

```console
$ autoportfolio init my-portfolio --template developer --theme terminal --ci
✓ Created 7 files in my-portfolio
    autoportfolio.config.yaml
    portfolio.yaml
    .gitignore
    assets/README.md
    favicon.svg
    .github/workflows/deploy.yml

  Next steps
    autoportfolio dev my-portfolio     start the live preview
    autoportfolio build                write the static site to dist/

$ cd my-portfolio
$ autoportfolio dev
  AutoPortfolio v1.0.0
  http://localhost:4173
  watching for changes — press Ctrl+C to stop
```

Edita `portfolio.yaml`, guarda los cambios y el navegador se actualizará. Cuando esté listo:

```console
$ autoportfolio build --strict
✓ Built 4 pages and 12 assets in 122ms
  output    dist
  template  developer · theme terminal
  size      123.4 kB
```

---

## Cómo funciona

La canalización sigue una secuencia directa, y cada etapa es un módulo independiente que puedes usar por separado:

```
portfolio.yaml ─┐
                ├─► parse ──► validate ──► normalise ──► sections ──► view model
config.yaml ────┘   │          │            │             │            │
                    │          │            │             │            ▼
                    │          │            │             │      template engine
                    │          │            │             │            │
                    │          │            │             └── theme ───┤
                    │          │            │                          ▼
                    └──────────┴────────────┴───────────────────►  generator
                                                                      │
                                                                      ▼
                                                            assets · export target
                                                                      │
                                                                      ▼
                                                                    dist/
```

| Etapa | Módulo | Responsabilidad |
|---|---|---|
| **Análisis** | `src/config/` | Lee YAML, JSON o TOML y lo convierte en un objeto simple, con mensajes de error precisos y números de línea. |
| **Validación** | `src/schema/` | Comprueba el documento según un esquema declarado. Las claves desconocidas, los tipos incorrectos, las fechas inválidas y las URL no válidas se convierten en diagnósticos —errores o advertencias, nunca en una traza de pila—. |
| **Normalización** | `src/model/normalize.js` | Convierte un documento flexible y pensado para personas en un modelo completo y predecible: completa valores predeterminados, normaliza fechas, asigna slugs y ordena listas. |
| **Semántica** | `src/model/semantic.js` | Comprueba relaciones entre campos que un esquema no puede expresar: una fecha de finalización anterior a la de inicio, un proyecto destacado que no existe o una disponibilidad contradictoria. |
| **Secciones** | `src/model/sections.js` | Decide qué secciones tienen contenido, en qué orden y con qué etiquetas. Aquí es donde se aplica la regla «solo mostrar lo que existe». |
| **Modelo de vista** | `src/model/view-model.js` | Construye la estructura exacta que leen las plantillas. Las plantillas nunca acceden al documento original. |
| **Tema** | `src/theme/` | Resuelve una configuración predefinida junto con tus personalizaciones para generar propiedades CSS personalizadas, en modo claro y oscuro. |
| **Plantilla** | `src/template/` | Renderiza plantillas `.html`: variables, `{{#if}}`, `{{#each}}`, parciales, helpers y herencia de diseños. |
| **Generación** | `src/generator/` | Planifica las páginas, calcula hashes y copia recursos, genera datos estructurados, minifica y escribe los archivos. |
| **Exportación** | `src/export/` | Añade lo que necesite cada alojamiento: `netlify.toml`, `vercel.json`, `.nojekyll`, `CNAME`, `_headers`. |

### Diagnósticos, no excepciones

Cualquier problema que pueda haber en tus datos se informa como un diagnóstico con un código, una ruta y, normalmente, una sugerencia:

```console
$ autoportfolio build --strict
error portfolio.yaml — error: Unknown key `headlien`
  hint: Did you mean `headline`?
  at:  profile.headlien
warning portfolio.yaml — warning: No contact details, the Contact section will be hidden
  hint: Add at least `contact.email` or one entry under `social`.
  at:  contact
```

Los códigos tienen espacios de nombres para que puedas localizarlos en el código fuente: `AP1001–AP1005` para configuración, `AP2001–AP2007` para los datos del portafolio, `AP3001–AP3006` para plantillas, `AP4001–AP4002` para temas y `AP5001–AP5004` para recursos y exportación.

---

## Referencia de configuración

`autoportfolio.config.yaml` describe la *compilación*, no el contenido.

```yaml
# Qué archivo contiene los datos del portafolio y qué plantilla los representa.
data: portfolio.yaml
template: developer

theme:
  preset: terminal          # default | minimal | terminal | editorial | nord | sunset | forest
  mode: auto                # auto | light | dark
  accent: "#4ade80"         # reemplaza el color de acento del tema predefinido
  radius: sm                # none | sm | md | lg | xl | full
  spacing: comfortable      # compact | comfortable | spacious
  density: normal           # compact | normal | relaxed
  container: normal         # narrow | normal | wide | full
  animations: true
  typography:
    heading: JetBrains Mono
    body: Inter
    mono: JetBrains Mono
    scale: 1
    headingWeight: 650
    googleFonts: true
    # fontUrl: https://example.com/fonts.css   # para fuentes alojadas por ti
  customProperties:         # variables --ap-* adicionales; el prefijo se añade automáticamente
    space-block: 3rem
  # customCss: custom.css   # se añade al final de la hoja de estilos generada

sections:
  order: [about, skills, projects, experience, education, contact]
  hidden: [testimonials]
  labels:
    technologies: "Tools I reach for"
  nav: true
  navStyle: sticky          # sticky | static | none
  numbered: false

site:
  baseUrl: https://your-domain.example   # habilita el mapa del sitio, los enlaces canónicos y RSS
  trailingSlash: true

assets:
  directory: assets
  copy: true
  hashFilenames: false      # añade un hash de contenido a los archivos CSS y JS generados
  inlineSvg: true

build:
  output: dist
  clean: true
  minify: true
  prettyUrls: true          # /projects/foo/ en lugar de /projects/foo.html
  projectPages: true        # una página por proyecto
  sitemap: true
  robots: true
  rss: false
  analytics:
    provider: none          # none | plausible | umami | fathom | simple
    privacyFriendly: true

content:
  markdown: true
  emailObfuscation: entities   # none | entities
  dateFormat: auto

serve:
  port: 4173
  host: 0.0.0.0

deploy:
  target: static            # static | github-pages | netlify | vercel | cloudflare-pages | s3 | ipfs
  # basePath: /my-repo/     # para páginas de proyecto servidas desde una ruta secundaria
  # files: [CNAME]          # archivos adicionales que se copian a la raíz de salida
```

Todos los valores tienen un valor predeterminado, así que una configuración de dos líneas es válida:

```yaml
data: portfolio.yaml
template: modern
```

Imprime el esquema JSON para habilitar el autocompletado en tu editor:

```console
$ autoportfolio schema config > .autoportfolio.config.schema.json
$ autoportfolio schema portfolio > .autoportfolio.portfolio.schema.json
```

---

## Referencia de los datos del portafolio

`portfolio.yaml` te describe a *ti*. Solo es obligatorio `profile.name`; todo lo demás es opcional y las secciones sin contenido se omiten.

```yaml
version: "1.0"

meta:
  title: Ada Lovelace — Programadora de la máquina analítica
  description: Matemática y escritora, conocida por ser la autora del primer algoritmo publicado.
  siteUrl: https://ada.example.com
  language: en
  themeColor: "#4f46e5"

profile:
  name: Ada Lovelace
  headline: Matemática · Escritora · Primera programadora
  shortBio: Una o dos frases que aparecen debajo de tu nombre.
  about: |
    Aquí se admite Markdown.

    Úsalo para contar tu historia con más detalle: párrafos, listas, enlaces, énfasis e incluso código.
  avatar: assets/avatar.jpg
  location: Londres, Reino Unido
  pronouns: she/her
  availability: open-to-offers    # consulta la lista de valores enumerados más abajo
  yearsOfExperience: 12
  company: Analytical Engines Ltd
  jobTitle: Matemática principal
  resume: https://ada.example.com/cv.pdf   # un archivo alojado para que los enlaces no se rompan

contact:
  email: ada@example.com
  phone: "+44 20 7946 0958"
  location: Londres, Reino Unido
  message: Prefiero el correo electrónico; respondo en un par de días.
  formAction: https://formspree.io/f/xxxx    # opcional; genera un formulario funcional

social:                           # un mapa: cualquier red y cualquier URL
  github: https://github.com/ada
  linkedin: https://linkedin.com/in/ada
  mastodon: https://mastodon.social/@ada

skills:
  - name: Máquinas analíticas
    level: expert                 # beginner | intermediate | advanced | expert
    category: Hardware
    keywords: [mecánica, notación]
    featured: true
  - name: Redacción técnica       # la forma extendida es opcional
    level: advanced

languages:                        # lenguajes de programación
  - name: Ada
    level: expert

spokenLanguages:
  - name: English
    proficiency: native           # native | fluent | professional | intermediate | basic

technologies:                     # también se admiten cadenas simples
  - name: PostgreSQL
    url: https://www.postgresql.org
  - Docker
  - Kubernetes

projects:
  - name: Notas sobre la máquina analítica
    tagline: Una frase que invite a hacer clic.
    description: >
      Dos o tres frases sobre qué hace, quién lo usa
      y cuál fue tu contribución.
    details: |
      La descripción completa, que se muestra en la página propia del proyecto
      cuando `build.projectPages` está habilitado. Admite Markdown.
    technologies: [Ada, Máquina analítica]
    features:
      - Calcula números de Bernoulli
      - Escrito para una máquina que nunca llegó a construirse
    images:
      - src: assets/images/engine.png
        alt: Diagrama de la máquina analítica
        caption: Figura 1 — el molino y el almacén
    cover: assets/images/engine-cover.png
    github: https://github.com/ada/analytical-engine
    liveUrl: https://ada.example.com/engine
    start: "1842-01"
    end: present
    status: active                # consulta la lista de valores enumerados más abajo
    role: Autora
    team: Individual
    featured: true
    tags: [historia, computación]
    metrics:
      - label: Operaciones por minuto
        value: "60"

experience:
  - company: Universidad de Londres
    role: Matemática
    location: Londres, Reino Unido
    employmentType: full-time    # consulta la lista de valores enumerados más abajo
    workMode: hybrid
    start: "1842-01"
    end: present
    summary: Tradujo y anotó el artículo de Menabrea sobre la máquina analítica.
    highlights:
      - Publicó el primer algoritmo concebido para una máquina.
    technologies: [Ada]

education:
  - institution: Clases particulares
    degree: Matemáticas y lógica
    field: Matemáticas
    location: Londres
    start: "1832"
    end: "1840"
    grade: —
    highlights: []
    url: https://example.com

certifications:
  - name: Administradora certificada de Kubernetes
    issuer: CNCF
    date: "2022-03"                     # también se acepta `issued` como alias
    expires: "2025-03"
    credentialId: CKA-123456
    credentialUrl: https://example.com/verify/123456   # también se admite `url`

awards:
  - title: Mejor artículo
    issuer: Sociedad Analítica
    date: "1843"
    summary: Por las notas sobre la máquina analítica.   # también se admite `description`

publications:
  - title: Esbozo de la máquina analítica
    publisher: Scientific Memoirs          # también se admiten `venue` y `journal`
    date: "1843"
    authors: [L. F. Menabrea, A. A. Lovelace]
    url: https://example.com/paper
    doi: 10.1000/xyz

testimonials:
  - quote: Veía más lejos que nadie de su generación.
    author: Charles Babbage
    role: Inventor
    avatar: assets/babbage.jpg

sections:                          # tus propias secciones, que se muestran como las integradas
  - title: Conferencias
    layout: timeline               # prose | cards | timeline | list | links | stats | gallery
    icon: mic
    items:
      - title: Sobre la máquina analítica
        subtitle: Royal Society
        date: "1843"
        description: Una charla sobre notación y máquinas.
        url: https://example.com/talk
  - title: En cifras
    layout: stats
    items:
      - value: "1843"
        label: Año de publicación del primer algoritmo
      - value: "1"
        label: Máquinas en las que se ejecutó

extra:                             # un mapa de nombres y valores para cualquier otro dato
  ORCID: 0000-0000-0000-0000
```

### Campos derivados, no escritos

La lista «de un vistazo» de la sección Acerca de se genera a partir de los datos que ya has escrito: ubicación, empresa, puesto, años de experiencia, disponibilidad, pronombres y CV. No tienes que escribir nada dos veces; basta con proporcionar esos campos para que aparezca la lista. Del mismo modo, los anclajes de las secciones se derivan de `title`, a menos que definas `id`, y las URL de los proyectos se derivan de `id`, a menos que lo definas explícitamente.

### Valores enumerados

| Campo | Valores aceptados |
|---|---|
| `skills[].level`, `languages[].level` | `beginner`, `intermediate`, `advanced`, `expert` |
| `spokenLanguages[].proficiency` | `native`, `fluent`, `professional`, `intermediate`, `basic` |
| `profile.availability` | `available`, `open-to-offers`, `open-to-freelance`, `employed`, `not-available` |
| `projects[].status` | `concept`, `planning`, `in-progress`, `active`, `maintained`, `archived` |
| `experience[].employmentType` | `full-time`, `part-time`, `contract`, `freelance`, `internship`, `apprenticeship`, `self-employed`, `volunteer` |
| `experience[].workMode` | `onsite`, `hybrid`, `remote` |
| `sections[].layout` | `prose`, `cards`, `timeline`, `list`, `links`, `stats`, `gallery` |

### Fechas

El formato de las fechas es flexible. Se entienden y normalizan todos estos ejemplos:

```yaml
start: 2024              # → 2024
start: 2024-03           # → 2024-03
start: March 2024        # → 2024-03
start: 2024-03-15        # → 2024-03-15
start: 2024 Q1           # → 2024-01
end: present             # → present   (también: now, current)
```

Los formatos y las etiquetas se adaptan a `meta.language` y `content.dateFormat`.

### Alias

Se aceptan alternativas habituales para que no tengas que recordar los nombres exactos de las claves:

| Escrito | Se interpreta como |
|---|---|
| `bio`, `tagline` | `profile.shortBio` |
| `slug` | `projects[].id` |
| `repository`, `repo`, `source` | `projects[].github` |
| `url`, `website`, `demo`, `homepage` | `projects[].liveUrl` |
| `organization`, `employer` | `experience[].company` |
| `title`, `position` | `experience[].role` |
| `school`, `university` | `education[].institution` |
| `studyType`, `qualification` | `education[].degree` |
| `area`, `fieldOfStudy`, `major` | `education[].field` |
| `issued`, `issueDate` | `certifications[].date` |
| `verifyUrl`, `url` | `certifications[].credentialUrl` |
| `venue`, `journal` | `publications[].publisher` |
| `abstract` | `publications[].summary` |
| `text` | `testimonials[].quote` |

Las claves desconocidas generan una advertencia con una sugerencia, en lugar de ignorarse en silencio.

---

## Plantillas

Una plantilla es un directorio que contiene un manifiesto `template.json`, plantillas de páginas, parciales y su propio CSS. **Las plantillas consumen únicamente el modelo de vista**, por lo que no quedan acopladas al formato de los datos.

| Plantilla | Características |
|---|---|
| `modern` | Diseño basado en tarjetas, portada con degradado, navegación fija y amplios espacios en blanco. |
| `minimal` | Diseño tipográfico de una sola columna para quienes prefieren que el texto hable por sí mismo. |
| `developer` | Diseño inspirado en una terminal, con tipografía monoespaciada, navegación lateral y tarjetas de proyectos compactas. |

```console
$ autoportfolio templates
  developer  Terminal-inspired layout with a monospace type scale, …
  minimal    Typographic single-column layout for people who want …
  modern     Card-based layout with a gradient hero, sticky navigation …

$ autoportfolio build --template minimal          # prueba una plantilla sin editar la configuración
```

### Crear tu propia plantilla

Añade un directorio en `templates/`, junto a tu configuración, y selecciónalo mediante una ruta:

```yaml
template: ./templates/my-template
```

```
templates/my-template/
├── template.json      # nombre, etiqueta, entrada, diseño y opciones
├── layout.html        # estructura en la que se renderiza cada página
├── page.html          # página principal
├── project.html       # página de detalles de un proyecto (opcional)
├── not-found.html     # página 404 (opcional)
├── styles.css         # CSS específico de la plantilla, añadido a la hoja de estilos
└── partials/
    ├── nav.html
    └── sections/      # reemplaza o añade parciales de sección
        └── about.html
```

La búsqueda de parciales de sección tiene una alternativa automática: si una plantilla define `sections/projects.html`, se usa su propia versión, y cada sección que no defina se obtiene de las secciones integradas compartidas. Añadir una plantilla nunca requiere editar el generador, el esquema ni los datos del portafolio.

---

## Temas

AutoPortfolio incluye siete temas predefinidos. Un tema no es más que un conjunto de propiedades CSS personalizadas, así que basta un cambio de una línea para reemplazar un valor.

```console
$ autoportfolio themes
  default    Neutral surfaces with an indigo accent.                      accent #4f46e5
  minimal    Quiet greys, serif headings and tight corners.               accent #18181b
  terminal   Monospaced green-on-black.                                   accent #17803d
  editorial  Warm paper tones and a strong serif voice.                   accent #b45309
  nord       Cool blue-grey palette with a calm, low-contrast feel.       accent #5e81ac
  sunset     High-energy coral and violet gradients.                      accent #e11d48
  forest     Deep greens and soft neutrals.                               accent #15803d

$ autoportfolio themes nord
Nord — Cool blue-grey palette with a calm, low-contrast feel.
  accent             #5e81ac
  accent (dark)      #88c0d0
  background         #fbfcfd
  background (dark)  #2e3440
  radius             lg
  spacing            comfortable
  typography         Inter / Inter
```

Se generan los modos claro y oscuro. `mode: auto` sigue la configuración de `prefers-color-scheme` y ofrece un selector; `mode: light` y `mode: dark` fijan el modo y eliminan del resultado la paleta que no se usa. Al resolver el tema se comprueba el contraste y se informa si una paleta no cumple WCAG AA.

Todas las variables derivadas están disponibles para las plantillas y para tu propio CSS:

```css
.my-badge {
  background: var(--ap-accent-soft);
  color: var(--ap-accent-ink);
  border-radius: var(--ap-radius-sm);
}
```

`var(--ap-*)` incluye la paleta clara; `dark-ap-*`, la oscura; además de `--ap-radius-*`, `--ap-space-*`, `--ap-font-*`, `--ap-container`, `--ap-animation-duration` y las variables personalizadas de `theme.customProperties`.

---

## Referencia de la CLI

```
autoportfolio <command> [options]

  init [directory]     Create a new project (config, data, assets, CI workflow)
  build [directory]    Generate the static site
  dev [directory]      Live preview with rebuild on change
  validate [directory] Check the configuration and data without building
  info [directory]     Show the resolved project
  templates [name]     List the available templates
  themes [name]        List the available theme presets
  schema [what]        Print the JSON Schema (portfolio | config)
  help <command>       Show help for a command
```

**Opciones globales:** `--help`, `--version`, `--verbose`, `--quiet`, `--no-color`, `--json`.

**Opciones de compilación:** `--config`, `--data`, `--output`, `--template`, `--theme`, `--mode`, `--accent`, `--base-url`, `--minify` / `--no-minify`, `--strict`, `--clean`, `--target`, `--drafts`.

`--json` hace que todos los comandos produzcan una salida legible por máquinas; eso es lo que utiliza el flujo de trabajo de GitHub Actions generado:

```console
$ autoportfolio build --json | jq '.pages | length'
4
```

---

## Publicación

El resultado son archivos estáticos, así que puede alojarlo cualquier servicio que publique el contenido de un directorio.

```yaml
# autoportfolio.config.yaml
site:
  baseUrl: https://ada.example.com

deploy:
  target: github-pages
```

Cada destino añade exactamente lo que necesita el servicio:

| Destino | Añade |
|---|---|
| `static` | Nada: el sitio tal cual. |
| `github-pages` | `.nojekyll` y `CNAME` cuando `site.baseUrl` es un dominio personalizado. |
| `netlify` | `netlify.toml`, `_headers` |
| `vercel` | `vercel.json` |
| `cloudflare-pages` | `_headers`, `_redirects` |
| `s3` | Indicaciones para configurar las cabeceras de caché en `_headers`. |
| `ipfs` | Resultado seguro con rutas relativas. |

Para una página de proyecto publicada bajo una ruta secundaria (como `user.github.io/repo/`), AutoPortfolio obtiene `basePath` de `site.baseUrl` y reescribe los enlaces según corresponda: no hace falta ajustarlos manualmente.

---

## Pruebas

```console
$ npm test
# tests 63
# pass 63
# fail 0
```

La batería de pruebas cubre los aspectos más propensos a fallar sin avisar:

| Área | Qué se comprueba |
|---|---|
| **Análisis de configuración** | YAML (bloques, formato en línea, anclas, comillas y valores multilínea) y TOML frente a archivos de referencia; también una prueba diferencial que analiza **todos los archivos YAML del repositorio** y compara el resultado con el paquete de referencia `yaml`. |
| **Validación de datos** | Campos obligatorios, tipos, valores enumerados, fechas, URL, correos electrónicos, claves desconocidas con sugerencias, alias, modo estricto y detección de duplicados. |
| **Renderizado de plantillas** | Pruebas del propio motor: interpolación, escape, condicionales, bucles, parciales, helpers y herencia de diseños. |
| **Gestión de temas** | Resolución de temas predefinidos, cambios de acento, generación de variables CSS, resultado en modo oscuro y advertencias de contraste. |
| **Generación del portafolio** | Compilaciones de principio a fin con las tres plantillas, planificación de páginas y recursos, omisión de secciones y destinos de exportación. |
| **Gestión de errores** | Diagnósticos en lugar de excepciones, códigos de salida, entradas mal formadas y archivos ausentes. |

La prueba diferencial frente a una implementación independiente es deliberada: que un analizador escrito a mano solo coincida consigo mismo no demuestra nada. Gracias a esa prueba se descubrió la comprobación estricta de dos puntos en valores escalares simples.

---

## Desarrollo

```console
$ npm test              # ejecuta la batería de pruebas
$ npm run test:watch    # vuelve a ejecutarla cuando hay cambios
$ npm run typecheck     # tsc --noEmit en src, bin, test y scripts
$ npm run build:example # genera examples/developer en examples/developer/dist
$ npm run dev:example   # vista previa en vivo del proyecto de ejemplo
$ npm run demo          # genera las tres plantillas e imprime un resumen
```

El código usa módulos ES estándar con tipos JSDoc: no necesita una fase de compilación, un transpilador ni un empaquetador. `npm run typecheck` ejecuta TypeScript en modo `checkJs` sobre el JavaScript; eso permite detectar errores en los editores y en CI.

Añadir una funcionalidad suele consistir en añadir un módulo e integrarlo en una etapa de la canalización. Si un cambio requiere editar más de dos capas, la separación entre módulos está mal ubicada.

---

## Estructura del proyecto

```
AutoPortfolio/
├── bin/autoportfolio.js      # punto de entrada ejecutable
├── src/
│   ├── cli/                  # análisis de argumentos, comandos y creación de proyectos
│   ├── config/               # analizadores YAML y TOML, carga y validación de proyectos
│   ├── schema/               # DSL de campos, esquemas del portafolio y configuración, exportación JSON Schema
│   ├── model/                # normalización, semántica, secciones, URL y modelo de vista
│   ├── theme/                # temas predefinidos y resolución de temas
│   ├── template/             # motor de plantillas y su entorno de ejecución
│   ├── templates/            # modern, minimal, developer y parciales compartidos
│   ├── generator/            # planificación de páginas, recursos, datos estructurados y helpers
│   ├── export/               # destinos de publicación
│   ├── preview/              # servidor de desarrollo
│   ├── assets/               # hoja de estilos base, script de cliente y conjunto de iconos
│   └── util/                 # color, fechas, HTML, Markdown, minificadores y sistema de archivos
├── examples/developer/       # ejemplo completo y práctico
├── test/                     # suites node:test
└── docs/                     # documentación ampliada
```

---

## Hoja de ruta

AutoPortfolio 1.0 se centra deliberadamente en generar sitios estáticos, pero la capa de exportación se diseñó como un punto de extensión, no como un caso especial. Estas líneas de desarrollo encajan sin necesidad de reescribir el proyecto:

- **Más destinos de exportación** — una configuración de servidor Node, una imagen Docker o una API JSON para frameworks que prefieran renderizar bajo demanda.
- **Un sistema de complementos** — la configuración ya reserva una clave `plugins`; desde fuera se pueden registrar generadores, helpers y destinos de exportación.
- **Fuentes de datos adicionales** — se podría consultar el repositorio de GitHub incluido en el archivo del proyecto para obtener estrellas, lenguajes y las versiones más recientes; el esquema ya contempla dónde hacerlo.
- **Plantillas de la comunidad** — como una plantilla es un directorio con un manifiesto, un registro sería una cuestión de distribución, no de arquitectura.
- **Importadores** — leer un `resume.json`, una exportación de LinkedIn o un archivo BibTeX y convertirlo al esquema del portafolio.
- **Portafolios en varios idiomas** — existe la clave `meta.language` y el formato de las fechas ya se adapta a la configuración regional.

---

## Copyright y licencia

Copyright (c) 2026 ericsnet. All rights reserved.

This repository and its original source code, documentation, designs, and assets are proprietary to ericsnet, except for third-party materials expressly identified as such. No permission is granted to use, reproduce, modify, distribute, sublicense, publish, or create derivative works from the original materials without prior written permission from ericsnet, except where applicable law provides otherwise.

Third-party components, dependencies, and materials remain subject to