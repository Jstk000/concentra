# Piloto de Windows y Chrome 0.2

**Solo temporizador** es el modo inicial. **Concentración** aplica las restricciones elegidas y las libera en pausa. **Estricto** pide confirmación al empezar y permite salir desde Terminar. El historial admite guardar minutos enteros efectivos de sesiones interrumpidas y conserva los bloques anteriores.

En Windows, **Bloqueo y avisos** selecciona los programas que se minimizan y los sitios que reciben una cubierta. La app lee la dirección de la pestaña activa de Chrome o Edge mediante Accesibilidad de Windows y conserva libre la barra de direcciones. La cubierta actúa sobre el contenido visible. Una descarga, audio en segundo plano o una ventana sin barra de direcciones quedan fuera de esa protección. Para bloquear navegaciones en el perfil de Chrome se puede usar la extensión. Solo temporizador también desactiva sus reglas.

## Pruebas de la candidata

- Chrome con un perfil de prueba. Se iniciaron tres notas en el motor de audio, se recibió la notificación al completar el tiempo desde otra pestaña y el aviso visual permaneció hasta descartarlo. Se comprobó la recuperación del historial al recargar.
- Windows con WebView2. Un bloque de un minuto activó una ventana de aviso con la app minimizada. Se verificaron pausa, reanudación, salida estricta y liberación al terminar.
- Chrome en un escritorio aislado. Con dos pestañas de prueba, la selección de Instagram hizo aparecer la cubierta nativa. Cambiar a YouTube o entrar en pausa la retiró. En esta prueba de la cubierta se suministró la ventana de Chrome al componente para aislarla del escritorio personal.
- Extensión en Chromium. La navegación a Instagram devolvió ERR_BLOCKED_BY_CLIENT durante el modo Concentración. YouTube se mantuvo disponible y la pausa liberó las reglas.
- Persistencia. Se recuperaron minutos parciales junto con el historial previo en otra sesión de la cuenta. Una revisión antigua y un registro parcial inválido fueron rechazados.

## Validación en el equipo de José

1. Abrir **Sonido y avisos → Probar aviso**, con el volumen que se usa para estudiar. La campana web depende del volumen de la pestaña y del mezclador de Windows. Las notificaciones de Chrome requieren permiso del sitio. En Windows, el ejecutable utiliza su propio aviso de escritorio.
2. En **Concentración**, elegir Instagram y dejar YouTube libre. Con Chrome en primer plano, alternar ambas páginas y pausar desde Concentra. Comprobar que la cubierta respeta la escala de la pantalla y que las apps vuelven a estar disponibles.
3. Al terminar antes de tiempo, guardar los minutos parciales y revisar **Mi avance**.

La audibilidad en los parlantes personales, Edge y la suspensión física del PC quedan pendientes de comprobación en esos entornos. La web necesita una pestaña abierta y depende de la ejecución que permita el navegador en segundo plano. El siguiente hito es validar esta fase en el equipo real antes de ampliar el calendario o trasladar los cambios a los móviles.
