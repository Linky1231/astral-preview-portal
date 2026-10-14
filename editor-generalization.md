# Base generalizable para el Editor

## Hallazgos de la auditoría

El runtime actual combina una entidad ligera, una escena y scripts por evento. Ya resuelve física y varios bloques específicos, pero la mayor parte de las capacidades está ligada a casos concretos como `setX`, `jump` o `setHazard`. El sistema visual puede añadir bloques lineales y una sola rama condicional, pero no expone una forma uniforme de operar sobre datos, destinatarios, eventos o secuencias anidadas.

## Contrato de extensión

La ampliación mantiene los proyectos existentes y añade una capa de bloques generales. Un bloque puede actuar sobre **este objeto**, el **otro objeto** de una colisión o la **escena**. Las variables pueden ser de entidad o escena. Los mensajes desacoplan emisores y receptores. Las estructuras `si / si no` y `repetir` contienen subbloques, por lo que las combinaciones no dependen de crear una nueva herramienta visual para cada comportamiento.

| Área | Contrato extensible | Ejemplos |
|---|---|---|
| Datos | Variables de objeto y de escena | vidas, misiónActiva, llaveObtenida |
| Estado | Propiedades por nombre y destino | posición, tamaño, visibilidad, física |
| Eventos | Mensajes entre scripts | puertaAbierta, jefeDerrotado |
| Control | Bloques anidables | condiciones, repetición, ramas |
| Compatibilidad | Los bloques existentes siguen vigentes | salto, daño, monedas, meta |

## Límite deliberado de esta iteración

Esta base no intenta simular todos los géneros mediante casos cerrados. Su objetivo es entregar los primitivos combinables sobre los que se pueden construir comportamientos nuevos desde el editor. Los bloques especializados existentes siguen funcionando y pueden transformarse progresivamente en plantillas basadas en los primitivos generales.

## Puntos de integración confirmados

`ScriptEditor` ya centraliza la creación de bloques, la edición de parámetros y el selector de eventos. Por ello, los bloques generales se exponen desde el mismo catálogo y conservan el flujo de guardado de scripts existente. El runtime procesa bloques mediante un único ejecutor, que permite añadir destinos, ámbitos de variables, mensajes y ramas anidadas sin cambios en el formato previo de los proyectos.

Los nuevos bloques se incorporan a través de tres puntos estables: valores iniciales por tipo de bloque, campos de parámetros reutilizables y contenedores anidados para ramas o repeticiones. Esta disposición evita que un comportamiento nuevo requiera una pantalla nueva o un tipo de objeto nuevo.
