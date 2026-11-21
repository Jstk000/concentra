# Concentra Beta 0.3.5 para navegador

[Abrir la beta pública](https://jstk000.github.io/concentra/). El navegador de referencia para esta revisión es Chrome de escritorio. La beta se puede probar como invitado.

## Empezar un bloque

**Solo temporizador** inicia el reloj con el ramo, la meta y el tiempo elegidos. **Concentración** añade los sitios seleccionados y permite pausar. **Estricto** pide confirmación de entrada y salida. La protección web se aplica en el perfil del navegador que inició el bloque.

Con la extensión conectada, el reloj muestra **Bloqueo activo en este navegador** cuando recibe la confirmación. Si la lista está vacía, se puede elegir Instagram desde el mismo aviso o abrir el selector. Si la extensión tarda en responder, la página solicita una nueva confirmación. También se puede elegir **Empezar solo este bloque sin bloqueo**. Esa decisión conserva la selección de sitios y el modo preferido para el bloque siguiente.

Si la extensión ya figura en Chrome, revisar en sus detalles que **Concentra · Bloqueo de estudio** esté activa en ese perfil y tenga acceso a `https://jstk000.github.io`. Recargar la pestaña después de cambiar ese permiso. Durante la primera instalación también conviene recargar las pestañas abiertas de los sitios elegidos.

## Qué se puede hacer

| Área | Funciones disponibles |
| --- | --- |
| Estudio y descanso | Elegir duración, registrar ramo y meta, iniciar, pausar en los modos que lo permiten, continuar tras recargar y terminar antes. Guardar los minutos enteros estudiados o descartar el intento. Alternar pausas cortas y largas y, opcionalmente, iniciar el intervalo siguiente de forma automática. La pausa larga corresponde al cuarto bloque completo. |
| Avisos | Elegir entre Cerámica, Prisma, Bruma y Brío, probar o detener el sonido, ajustar el volumen y elegir de una a tres reproducciones. El descanso tiene su propio sonido. El final de estudio permite reconocer el aviso y pasar al descanso. El aviso del escritorio depende del permiso del navegador y de la configuración del sistema. |
| Protección | Elegir entre seis dominios incluidos y añadir dominios propios. La extensión bloquea nuevas navegaciones. En los seis sitios incluidos también puede cubrir pestañas ya cargadas por la extensión y restringir sus notificaciones. Pausar o terminar libera las reglas. Para programas de Windows se usa la aplicación instalada. |
| Motivo y Medina | Guardar un motivo personal al iniciar sesión o comenzar el estudio. Durante el bloque, abrir la ayuda de Medina, releer o editar el motivo y retomar la tarea. |
| Horario | Guardar ramos con varios días y franjas, detectar cruces, quitar bloques y preparar estudio antes de la siguiente clase. Se puede activar o revocar una suscripción ICS de solo lectura para Google o Apple Calendar. Las pruebas, entregas y recordatorios académicos siguen en la hoja de ruta. |
| Avance | Consultar minutos de hoy, bloques completos, racha, gráfico de siete días, historial reciente y logros. Las sesiones parciales suman minutos. Los descansos se excluyen del tiempo estudiado. |
| Cuenta | Usar el dispositivo como invitado, crear un usuario con contraseña o acceder mediante Google. La cuenta sincroniza horario, motivo e historial. La importación de los datos de invitado es explícita. El volumen y los demás ajustes de alarma se guardan por dispositivo. |
| Grupo | Con cuenta e invitación, unirse, compartir el enlace, publicar metas, rutinas o logros, consultar el muro y eliminar publicaciones propias. |

## Auditoría del 21 de noviembre de 2026

- Se reprodujo el envío repetido a Ajustes con la extensión instalada y la lista vacía. Se probaron la recuperación con un sitio, la reconexión tardía y la salida voluntaria al temporizador. En la prueba de falta de respuesta se conservó el mismo bloque al continuar una sesión pausada sin protección.
- En Chromium con la extensión distribuida por la beta, Instagram devolvió `ERR_BLOCKED_BY_CLIENT`. Se comprobaron pausa, reanudación, salida de Estricto y retirada de las reglas. La selección activa se conserva si cambia la preferencia durante el estudio. Un bloque estricto pausado en otro dispositivo queda bajo el control del dispositivo de origen.
- En Chrome se probaron alarmas, reconocimiento desde otra pestaña, recuperación al recargar, registro parcial y descanso largo. Se revisaron cinco anchos entre 320 y 1440 píxeles.
- Con el servidor del proyecto y una base temporal, se probaron el registro y el acceso con contraseña desde dos perfiles, el motivo, la recuperación de clases, los cruces, la suscripción ICS y su revocación, la invitación al grupo, la publicación de una rutina y su eliminación. Estas pruebas usaron datos ficticios.
- Las siete pruebas automáticas del proyecto pasaron. Se verificó que el servicio público anuncia el acceso con Google. Quedan sin validar en esta revisión el ingreso interactivo con Google, la actualización de una suscripción desde una cuenta externa real y la alarma en un teléfono físico con la pantalla bloqueada.
