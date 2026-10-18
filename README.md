# PS5 Launcher

Launcher de juegos para PC con una interfaz inspirada en PlayStation 5. Reúne juegos instalados de varias tiendas, permite agregar accesos manuales y ofrece secciones para consultar novedades y promociones.

> Este proyecto es una interfaz para organizar y abrir juegos de PC. No es un emulador de PlayStation y no incluye los juegos.

## Funciones

- Detecta juegos instalados en **Steam** en Windows y Linux.
- Detecta instalaciones de **Epic Games** y **GOG** en Windows.
- Permite agregar juegos o accesos directos desde `games.json`.
- Muestra una biblioteca, una sección Explorar y ofertas/juegos gratis.
- Incluye navegación con teclado, mouse y mandos compatibles con la Gamepad API del navegador.
- Puede ejecutarse en ventana o a pantalla completa.

Las novedades y promociones se consultan en línea desde las tiendas. La disponibilidad y los precios dependen de sus servicios, región y conexión a Internet.

## Requisitos

- Windows 10/11 (plataforma recomendada) o Linux.
- [Node.js](https://nodejs.org/) y npm. Se recomienda una versión LTS vigente.
- Conexión a Internet para instalar dependencias y cargar novedades, promociones y ciertos recursos gráficos.
- En Linux, Steam instalado para que el escáner pueda detectar sus juegos. El escáner de Epic Games y GOG está limitado a Windows.

Electron 33 y `hls.js` se instalan como dependencias del proyecto.

## Instalación y ejecución

Abre una terminal en la carpeta del proyecto y ejecuta:

```bash
npm install
npm start
```

Para iniciar directamente en pantalla completa:

```bash
npm run start:full
```

La ventana se puede alternar entre pantalla completa y ventana con **F11**. El tamaño mínimo de la ventana es 960 × 540.

## Uso

### Navegación

| Acción | Teclado |
| --- | --- |
| Mover el foco | Flechas |
| Seleccionar o abrir | Enter o espacio |
| Volver / cerrar una sección | Escape o Retroceso |
| Cambiar entre Games y Media | Tab |
| Volver a buscar juegos (en Biblioteca) | R |
| Cambiar el orden (en Biblioteca) | S |
| Alternar pantalla completa | F11 |

También puedes seleccionar elementos con el mouse.

Con un mando que el sistema reconozca mediante la Gamepad API:

| Acción | Mando |
| --- | --- |
| Mover el foco | Cruceta o stick izquierdo |
| Aceptar | A |
| Volver | B |
| Actualizar / buscar de nuevo | X |
| Cambiar el orden de la biblioteca | Y |
| Cambiar pestaña de la biblioteca o salir de la sección | LB / RB |

### Secciones principales

- **Games** muestra accesos a Explorar, juegos detectados como instalados, Biblioteca y Tienda.
- **Biblioteca** permite filtrar entre instalados, colección y tiendas; cambiar el orden y volver a escanear.
- **Explorar** muestra novedades y próximos lanzamientos de Steam, Epic Games y GOG.
- **Tienda** muestra promociones de Steam y GOG y juegos gratis actuales o próximos de Epic Games. Los precios pueden mostrarse en USD según los datos de las tiendas.
- **Media**, Capturas y Mandos aparecen como espacios de interfaz; su funcionalidad todavía no está implementada.

Si no se encuentra ningún juego instalado ni agregado manualmente, se muestran juegos de ejemplo desde `games.demo.json`. Estos ejemplos son solo visuales y no se pueden iniciar.

## Agregar o personalizar juegos

Edita `games.json`, que contiene una lista JSON. Puedes agregar un juego manual o usar una entrada para personalizar uno detectado automáticamente. Por ejemplo:

```json
[
  {
    "id": "mi-juego",
    "title": "Mi juego",
    "store": "local",
    "installed": true,
    "exe": "C:\\Juegos\\MiJuego\\MiJuego.exe",
    "args": [],
    "cwd": "C:\\Juegos\\MiJuego",
    "cover": "assets/games/mi-juego-icon.png",
    "hero": "assets/games/mi-juego-hero.jpg",
    "colors": ["#1f6bff", "#18c0ff", "#050a1c"]
  }
]
```

Para iniciar un ejecutable local:

- `exe`: ruta al archivo ejecutable. En JSON, las barras invertidas de Windows se escriben como `\\`.
- `args`: argumentos opcionales, como una lista de cadenas.
- `cwd`: carpeta de trabajo opcional; si se omite, se usa la carpeta del ejecutable.

También puedes iniciar un juego mediante el protocolo de su tienda, por ejemplo:

```json
[
  {
    "id": "mi-juego-steam",
    "title": "Mi juego de Steam",
    "store": "steam",
    "installed": true,
    "uri": "steam://rungameid/123456"
  }
]
```

Los protocolos de inicio aceptados son `steam:`, `com.epicgames.launcher:` y `goggalaxy:`. Para abrir un acceso manual, la aplicación debe estar instalada y su launcher correspondiente debe estar disponible.

Campos opcionales de presentación:

- `cover`: imagen de portada.
- `hero`: imagen de fondo del juego.
- `colors`: arreglo de tres colores CSS para fondos de reserva.
- `video`: URL de video compatible para el fondo del juego; puede estar sujeta a los orígenes permitidos por la política de seguridad de contenido.
- `hidden`: usa `true` para ocultar un juego de la lista.
- `installed`: usa `false` para mostrarlo en la colección, pero impedir que se intente iniciar.

Los campos de imagen pueden apuntar a archivos del proyecto, por ejemplo `assets/games/mi-juego-hero.jpg`. Crea las carpetas necesarias dentro de `assets/games`.

### Personalizar una instalación detectada

El launcher combina `games.json` con los juegos detectados. Si una entrada manual coincide por `id`, título o identificador de Epic Games, sus campos pueden personalizar el juego detectado en lugar de duplicarlo. Mantén el mismo `id` o título para actualizar la ficha existente.

Tras guardar cambios en `games.json`, usa **Biblioteca → Actualizar** o pulsa **R** en la biblioteca. La aplicación vuelve a leer la configuración cuando realiza el escaneo.

## Personalizar la interfaz

`system.json` contiene títulos, descripciones, colores y rutas de recursos para las secciones Biblioteca, Explorar y Tienda. Las rutas del archivo se resuelven desde la raíz del proyecto. Los recursos actuales —iconos, imágenes, sonidos, fuentes y arte de juegos— están dentro de `assets/`.

No cambies la estructura de `system.json` sin actualizar el código que la consume. Asegúrate de que cualquier recurso que configures exista en la ruta indicada.

## Estructura del proyecto

```text
ps5-launcher/
├── assets/             # Imágenes, fuentes, sonidos e iconos
├── games.json          # Juegos manuales y ajustes sobre juegos detectados
├── games.demo.json     # Biblioteca de ejemplo si no hay juegos disponibles
├── system.json         # Contenido y recursos de la interfaz
├── index.html          # Estructura de la interfaz
├── styles.css          # Estilos
├── renderer.js         # Interfaz, navegación y controles
├── main.js             # Ventanas, IPC, escaneo y lanzamiento
├── preload.js          # API segura entre la interfaz y Electron
├── scanner.js          # Detección de juegos instalados
└── package.json        # Dependencias y comandos npm
```

## Datos y privacidad

- `games.json`, `games.demo.json` y `system.json` son archivos de configuración del proyecto.
- La última fecha de inicio se guarda en el directorio de datos de usuario de Electron, no en `games.json`.
- Parte del arte descargado puede guardarse en la caché de datos de usuario.
- Explorar, las promociones y la consulta de algunos recursos gráficos requieren conexión a servicios de Steam, Epic Games o GOG.
- La aplicación no solicita credenciales de esas tiendas para escanear instalaciones locales. Las páginas de tienda se abren en una ventana propia y mantienen su sesión local de navegador.

## Solución de problemas

### La biblioteca solo muestra ejemplos

Instala un juego compatible o agrega una entrada válida a `games.json`. En Windows se buscan instalaciones de Steam, Epic Games y GOG; en Linux, Steam. Después, vuelve a Biblioteca y pulsa **R** o usa el botón de actualizar.

### El juego no inicia

Verifica que `installed` no sea `false`, que `exe` apunte a un archivo existente o que `uri` use uno de los protocolos permitidos. Comprueba además que el launcher del juego esté instalado. Los juegos de ejemplo no se pueden iniciar.

### Explorar o las promociones no cargan

Comprueba la conexión a Internet y vuelve a pulsar **Actualizar** en la sección. Si una tienda no responde o cambia su API, la sección puede mostrar resultados parciales o un error para esa tienda.

### Un recurso visual no aparece

Comprueba que la ruta sea correcta respecto a la raíz del proyecto y que el archivo exista. Los recursos remotos también pueden depender de la conexión o de las políticas de seguridad del contenido.

## Desarrollo

Los comandos definidos en `package.json` son:

```bash
npm start
npm run start:full
```

No hay comandos de pruebas, empaquetado o distribución configurados en este momento.
