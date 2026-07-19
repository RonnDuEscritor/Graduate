// Extended TIPOS_TESIS with sub-sections per section
// Each section now has guided sub-items that appear as prompts in the editor

export interface SubItem {
  key:         string   // unique identifier
  label:       string   // display name
  placeholder: string   // what to write here
  required:    boolean  // academically required
  minWords:    number   // minimum recommended words
}

export interface TesisSection {
  name:      string
  subItems:  SubItem[]
}

export interface TesisFase {
  fase:     string
  isRoman:  boolean
  items:    string[]
  sections: TesisSection[]
}

export const TIPOS_TESIS_EXTENDED = [
  {
    nombre: 'Investigacion cientifica',
    fases: [
      {
        fase: 'Fase preliminar', isRoman: true,
        items: [
          'Portada oficial',
          'Aprobacion del jurado',
          'Dedicatoria y agradecimientos',
          'Resumen / Abstract',
          'Palabras clave / Keywords',
          'Indice general',
          'Indice de tablas',
          'Indice de figuras',
        ],
        sections: [
          {
            name: 'Portada oficial',
            subItems: [
              { key:'inst',    label:'Institucion',           placeholder:'Nombre de la universidad o institucion', required:true,  minWords:3  },
              { key:'titulo',  label:'Titulo de la tesis',    placeholder:'Titulo completo y descriptivo del trabajo de investigacion', required:true,  minWords:5  },
              { key:'autor',   label:'Autor(es)',             placeholder:'Nombres completos del autor o autores',   required:true,  minWords:2  },
              { key:'tutor',   label:'Tutor / Director',      placeholder:'Nombre completo del tutor academico',     required:true,  minWords:2  },
              { key:'fecha',   label:'Fecha y lugar',         placeholder:'Ciudad, pais y ano de presentacion',      required:true,  minWords:3  },
            ]
          },
          {
            name: 'Resumen / Abstract',
            subItems: [
              { key:'contexto',   label:'Contexto del problema',  placeholder:'Describe brevemente el contexto en que surge el problema de investigacion', required:true, minWords:30 },
              { key:'objetivo',   label:'Objetivo principal',     placeholder:'Indica el objetivo principal del estudio en una oracion clara', required:true, minWords:20 },
              { key:'metodo',     label:'Metodologia',            placeholder:'Describe el metodo utilizado: tipo de investigacion, muestra, instrumentos', required:true, minWords:30 },
              { key:'resultados', label:'Resultados principales', placeholder:'Menciona los hallazgos mas relevantes del estudio', required:true, minWords:30 },
              { key:'concl',      label:'Conclusion principal',   placeholder:'Indica la conclusion mas importante y su aporte al campo', required:true, minWords:20 },
            ]
          },
        ]
      },
      {
        fase: 'Cuerpo de la tesis', isRoman: false,
        items: [
          'Introduccion',
          'Cap. I -- El problema',
          'Cap. II -- Marco teorico',
          'Cap. III -- Marco metodologico',
          'Cap. IV -- Analisis de resultados',
          'Cap. V -- Discusion de resultados',
          'Conclusiones y recomendaciones',
        ],
        sections: [
          {
            name: 'Introduccion',
            subItems: [
              { key:'contexto',    label:'Contexto general',        placeholder:'Presenta el area de conocimiento y su importancia actual', required:true,  minWords:50  },
              { key:'relevancia',  label:'Relevancia del tema',     placeholder:'Explica por que este tema es importante en el momento actual', required:true,  minWords:40  },
              { key:'proposito',   label:'Proposito del estudio',   placeholder:'Indica que se busca lograr con esta investigacion', required:true,  minWords:30  },
              { key:'estructura',  label:'Estructura del documento', placeholder:'Describe brevemente como esta organizado el trabajo capitulo por capitulo', required:false, minWords:30  },
            ]
          },
          {
            name: 'Cap. I -- El problema',
            subItems: [
              { key:'antecedentes',  label:'Antecedentes del problema',     placeholder:'Presenta investigaciones previas relacionadas con el problema, incluyendo autores, fechas y hallazgos relevantes (minimo 3 antecedentes)', required:true, minWords:150 },
              { key:'planteamiento', label:'Planteamiento del problema',     placeholder:'Describe el problema de investigacion de forma clara y especifica. Incluye datos, estadisticas o evidencias que demuestren la existencia del problema', required:true, minWords:100 },
              { key:'formulacion',   label:'Formulacion del problema',       placeholder:'Redacta la pregunta principal de investigacion. Ejemplo: Como influye X en Y en el contexto Z?', required:true, minWords:15  },
              { key:'obj_general',   label:'Objetivo general',               placeholder:'Redacta el objetivo general usando un verbo en infinitivo (Analizar, Determinar, Establecer...). Debe responder directamente a la pregunta de investigacion', required:true, minWords:20  },
              { key:'obj_especificos', label:'Objetivos especificos',        placeholder:'Lista los objetivos especificos (minimo 3). Cada uno debe ser medible y alcanzable. Usa verbos especificos: Identificar, Describir, Comparar, Evaluar...', required:true, minWords:60  },
              { key:'hipotesis',     label:'Hipotesis',                      placeholder:'Redacta la hipotesis de trabajo: supuesto que se pretende demostrar. Debe relacionar la variable independiente con la dependiente', required:true, minWords:30  },
              { key:'variables',     label:'Variables de investigacion',     placeholder:'Define las variables del estudio: Variable independiente (causa) y Variable dependiente (efecto). Incluye su definicion conceptual y operacional', required:true, minWords:60  },
              { key:'justificacion', label:'Justificacion',                  placeholder:'Explica por que es importante realizar esta investigacion: justificacion teorica, practica y metodologica', required:true, minWords:80  },
              { key:'delimitacion',  label:'Delimitacion',                   placeholder:'Establece los limites del estudio: espacial (donde), temporal (cuando) y tematico (que aspectos se incluyen y excluyen)', required:true, minWords:40  },
            ]
          },
          {
            name: 'Cap. II -- Marco teorico',
            subItems: [
              { key:'bases_teoricas',   label:'Bases teoricas',              placeholder:'Desarrolla las teorias, modelos y conceptos principales que sustentan la investigacion. Cita autores relevantes con referencias APA/Vancouver', required:true, minWords:300 },
              { key:'bases_legales',    label:'Bases legales',               placeholder:'Menciona las leyes, decretos, normas o reglamentos que tienen relacion con el tema de investigacion', required:false, minWords:100 },
              { key:'marco_conceptual', label:'Marco conceptual',            placeholder:'Define los terminos y conceptos clave utilizados en la investigacion. Ejemplo: Inteligencia artificial: segun Autor (ano) es...', required:true, minWords:150 },
              { key:'estado_arte',      label:'Estado del arte',             placeholder:'Describe el nivel actual del conocimiento sobre el tema. Que se ha investigado? Que falta por investigar? Donde encaja este estudio?', required:true, minWords:200 },
            ]
          },
          {
            name: 'Cap. III -- Marco metodologico',
            subItems: [
              { key:'tipo_inv',    label:'Tipo de investigacion',    placeholder:'Indica el tipo: descriptiva, explicativa, correlacional, exploratoria. Justifica la eleccion con autores', required:true, minWords:50  },
              { key:'diseno',      label:'Diseno de investigacion',  placeholder:'Especifica el diseno: experimental, cuasi-experimental, no experimental, de campo, documental. Justifica', required:true, minWords:50  },
              { key:'poblacion',   label:'Poblacion',                placeholder:'Describe la poblacion objeto de estudio: quienes son, cuantos son, donde estan, que caracteristicas tienen', required:true, minWords:50  },
              { key:'muestra',     label:'Muestra y muestreo',       placeholder:'Indica el tamano de la muestra y el tipo de muestreo utilizado (aleatorio, estratificado, intencional). Incluye el calculo si aplica', required:true, minWords:60  },
              { key:'tecnicas',    label:'Tecnicas e instrumentos',  placeholder:'Describe las tecnicas (encuesta, entrevista, observacion) e instrumentos (cuestionario, guia de entrevista) de recoleccion de datos', required:true, minWords:80  },
              { key:'validez',     label:'Validez y confiabilidad',  placeholder:'Explica como se garantiza la validez y confiabilidad de los instrumentos. Incluye el juicio de expertos o prueba piloto realizada', required:true, minWords:60  },
              { key:'procedimiento', label:'Procedimiento',          placeholder:'Describe paso a paso como se llevara a cabo la investigacion: desde la recoleccion hasta el analisis de datos', required:true, minWords:80  },
            ]
          },
          {
            name: 'Cap. IV -- Analisis de resultados',
            subItems: [
              { key:'presentacion',  label:'Presentacion de resultados',  placeholder:'Presenta los datos obtenidos de forma organizada. Usa tablas, graficos y estadisticas. Cada elemento debe tener titulo, numero y fuente segun normas APA', required:true, minWords:200 },
              { key:'analisis',      label:'Analisis de cada objetivo',   placeholder:'Analiza los resultados en relacion con cada objetivo especifico planteado en el Cap. I. Que revelan los datos?', required:true, minWords:150 },
              { key:'contrastacion', label:'Contrastacion con hipotesis', placeholder:'Indica si los resultados confirman, rechazan o modifican la hipotesis planteada. Justifica con los datos obtenidos', required:true, minWords:80  },
            ]
          },
          {
            name: 'Cap. V -- Discusion de resultados',
            subItems: [
              { key:'discusion',     label:'Discusion de hallazgos',      placeholder:'Interpreta los resultados en profundidad. Que significan? Por que ocurrieron? Que factores los explican?', required:true, minWords:150 },
              { key:'comparacion',   label:'Comparacion con antecedentes', placeholder:'Compara tus resultados con los de investigaciones previas citadas en el Cap. I. En que coinciden? En que difieren?', required:true, minWords:100 },
              { key:'implicaciones', label:'Implicaciones del estudio',    placeholder:'Que aporta este estudio al campo? Cuales son las implicaciones teoricas y practicas de los hallazgos?', required:true, minWords:80  },
            ]
          },
          {
            name: 'Conclusiones y recomendaciones',
            subItems: [
              { key:'conclusiones',     label:'Conclusiones',         placeholder:'Redacta una conclusion por cada objetivo especifico. Deben responder directamente a cada objetivo planteado. No introduzcas informacion nueva', required:true, minWords:100 },
              { key:'recomendaciones',  label:'Recomendaciones',      placeholder:'Propone acciones concretas basadas en los resultados. Dirigidas a: investigadores, instituciones, profesionales del area. Minimo 3 recomendaciones', required:true, minWords:80  },
              { key:'lineas_futuras',   label:'Lineas de investigacion futuras', placeholder:'Sugiere temas o aspectos que quedaron fuera del alcance de este estudio y que podrian investigarse en el futuro', required:false, minWords:40  },
            ]
          },
        ]
      },
      {
        fase: 'Fase final', isRoman: false,
        items: ['Referencias bibliograficas', 'Anexos'],
        sections: [
          {
            name: 'Referencias bibliograficas',
            subItems: [
              { key:'refs', label:'Lista de referencias', placeholder:'Las referencias se generan automaticamente desde el panel de Referencias. Aqui puedes agregar fuentes adicionales en formato manual', required:true, minWords:10 },
            ]
          },
          {
            name: 'Anexos',
            subItems: [
              { key:'instrumentos', label:'Instrumentos de recoleccion', placeholder:'Incluye los instrumentos utilizados: cuestionarios, guias de entrevista, fichas de observacion, etc.', required:false, minWords:0 },
              { key:'datos_brutos', label:'Datos brutos',                placeholder:'Tablas con los datos originales obtenidos antes del procesamiento estadistico', required:false, minWords:0 },
              { key:'otros',        label:'Otros anexos',                placeholder:'Cartas de autorizacion, fotografias, mapas, codigos de programas u otros documentos de soporte', required:false, minWords:0 },
            ]
          },
        ]
      },
    ]
  },
]

export default TIPOS_TESIS_EXTENDED
