const createProject = useCallback(async (
  title: string, tipo: TipoTesis, norma: NormaType, userId: string
) => {
  const proj = await pb.collection('projects').create<PBProject>({
    user: userId,
    title,
    tipo,
    norma,
    word_count: 0,
    settings: { autoSaveInterval: 2, revisionEnabled: true, aiEnabled: true },
  })

  const template = TIPOS_TESIS[tipo]
  let idx = 0
  for (const fase of template.fases) {
    for (const name of fase.items) {
      await pb.collection('sections').create<PBSection>({
        project: proj.id,
        name,
        fase: fase.fase,
        order_index: idx++,
        is_roman: fase.isRoman,
        word_count: 0,
      })
    }
  }
  return proj
}, [])
