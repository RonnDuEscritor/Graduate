import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/store'
import { buildCiteText, lookupDOI, formatRef, cn, friendlyError } from '@/lib/utils'
import type { PBReference, RefType } from '@/types'

const EMPTY_FORM = (): Omit<PBReference, 'id'|'created'|'updated'|'project'> => ({
  author:'', initial:'', year:'', ref_type:'libro', title:'',
  publisher:'', journal:'', volume:'', issue:'', doi:'', url:'', pages:'',
})

export default function ReferencesPanel() {
  const { project, references, citations, norma, activeSectionId, upsertReference, removeReference } = useStore()
  const [showForm, setShowForm] = useState(false)
  const [editId,   setEditId]   = useState<string|null>(null)
  const [form,     setForm]     = useState(EMPTY_FORM())
  const [saving,   setSaving]   = useState(false)
  const [doiQuery, setDoiQuery] = useState('')
  const [doiLoading, setDoiLoading] = useState(false)

  const citedIds = new Set(citations.map(c => c.reference))

  const openNew  = () => { setForm(EMPTY_FORM()); setEditId(null); setShowForm(true) }
  const openEdit = (r: PBReference) => {
    setForm({ author:r.author, initial:r.initial??'', year:r.year, ref_type:r.ref_type,
              title:r.title, publisher:r.publisher??'', journal:r.journal??'',
              volume:r.volume??'', issue:r.issue??'', doi:r.doi??'', url:r.url??'', pages:r.pages??'' })
    setEditId(r.id); setShowForm(true)
  }

  const handleDOI = async () => {
    if (!doiQuery.trim()) return
    setDoiLoading(true)
    const data = await lookupDOI(doiQuery)
    if (data) setForm(f => ({ ...f, ...data }))
    else alert('No se encontró la referencia. Verifica el DOI.')
    setDoiLoading(false)
  }

  const save = async () => {
    if (!project || !form.author || !form.year || !form.title) {
      alert('Autor, año y título son obligatorios.'); return
    }
    setSaving(true)
    try {
      if (editId) {
        const { data: updated, error } = await supabase
          .from('bibliography').update({ project: project.id, ...form })
          .eq('id', editId).select().single<PBReference>()
        if (error) throw error
        upsertReference(updated)
      } else {
        const { data: created, error } = await supabase
          .from('bibliography').insert({ project: project.id, ...form })
          .select().single<PBReference>()
        if (error) throw error
        upsertReference(created)
      }
      setShowForm(false)
    } catch (e) { alert(friendlyError(e, 'No se pudo guardar la referencia. Intenta de nuevo.')) }
    setSaving(false)
  }

  const remove = async (id: string) => {
    if (!confirm('¿Eliminar esta referencia?')) return
    const { error } = await supabase.from('bibliography').delete().eq('id', id)
    if (error) { alert(friendlyError(error, 'No se pudo eliminar la referencia. Intenta de nuevo.')); return }
    removeReference(id)
  }

  const insertCite = async (ref: PBReference) => {
    if (!activeSectionId) { alert('Haz clic en una sección del editor primero.'); return }

    // Audit 2.1 fix (GRAVE): this used to write the `citations` row here,
    // directly, before touching the editor at all -- a second source of
    // truth that could drift from whatever ended up in the document (e.g.
    // the user later deletes the chip by hand, and this row never finds
    // out). Now we only insert the real citation node into the document;
    // SectionEditor's save handler scans the document itself and
    // reconciles the `citations` table to match on every save, so the
    // document is the only thing that has to stay correct.
    const vcMap = useStore.getState().getVancouverOrder()
    const existingNum = vcMap.get(ref.id) ?? vcMap.size + 1
    const citeText = buildCiteText(ref, norma, existingNum)
    window.dispatchEvent(new CustomEvent('insert-cite', {
      detail: { refId: ref.id, citeText, sectionId: activeSectionId, citationStyle: norma }
    }))
  }

  const sorted = [...references].sort((a,b) => a.author.localeCompare(b.author, 'es'))

  return (
    <div className="p-3 flex flex-col gap-2">
      {/* DOI Quick lookup */}
      <div className="flex gap-1">
        <input value={doiQuery} onChange={e=>setDoiQuery(e.target.value)}
          placeholder="DOI para importar…" onKeyDown={e=>e.key==='Enter'&&handleDOI()}
          className="flex-1 bg-brand-800/60 border border-brand-700 rounded-lg px-2 py-1.5 text-xs text-brand-200 outline-none focus:border-brand-500 placeholder:text-brand-600" />
        <button onClick={handleDOI} disabled={doiLoading}
          className="px-2 py-1.5 bg-brand-700 hover:bg-brand-600 rounded-lg text-xs text-brand-300 transition-colors disabled:opacity-50">
          {doiLoading ? '…' : <i className="ti ti-search text-sm" />}
        </button>
      </div>

      <button onClick={openNew}
        className="w-full flex items-center justify-center gap-1.5 border border-dashed border-brand-700 hover:border-brand-500 rounded-lg py-2 text-xs text-brand-500 hover:text-brand-300 transition-all">
        <i className="ti ti-plus text-sm" /> Agregar fuente
      </button>

      {/* Reference list */}
      {sorted.length === 0 ? (
        <p className="text-center text-brand-600 text-xs py-4 italic">Sin referencias aún</p>
      ) : sorted.map(r => (
        <div key={r.id}
          className={cn('rounded-lg border p-2.5 transition-all',
            citedIds.has(r.id) ? 'border-brand-600 bg-brand-800/40' : 'border-brand-700/50 bg-brand-800/20')}>
          <div className="flex items-start justify-between gap-1">
            <button className="text-left flex-1 min-w-0" onClick={() => insertCite(r)} title="Clic para insertar cita">
              <span className="text-brand-200 text-xs font-medium">{r.author}</span>
              <span className="text-gold text-xs ml-1">({r.year})</span>
              <p className="text-brand-500 text-xs italic mt-0.5 line-clamp-2">{r.title}</p>
              {citedIds.has(r.id) && (
                <span className="text-green-500 text-xs">✓ citada</span>
              )}
            </button>
            <div className="flex gap-1 flex-shrink-0">
              <button onClick={() => openEdit(r)} className="text-brand-600 hover:text-brand-300 text-xs p-0.5">
                <i className="ti ti-pencil" />
              </button>
              <button onClick={() => remove(r.id)} className="text-brand-600 hover:text-red-400 text-xs p-0.5">
                <i className="ti ti-trash" />
              </button>
            </div>
          </div>
          {/* APA/Vancouver preview */}
          <p className="text-brand-600 text-xs mt-1 line-clamp-1"
            dangerouslySetInnerHTML={{ __html: formatRef(r, norma, useStore.getState().getVancouverOrder().get(r.id) ?? 1) }} />
        </div>
      ))}

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={e => { if(e.target===e.currentTarget) setShowForm(false) }}>
          <div className="bg-brand-900 border border-brand-700 rounded-2xl p-5 w-full max-w-lg overflow-y-auto max-h-[90vh] animate-fadeIn">
            <h3 className="font-serif text-brand-100 text-base font-medium mb-4">
              {editId ? 'Editar fuente' : 'Agregar fuente bibliográfica'}
            </h3>
            <div className="space-y-3">
              {[
                { label:'Apellido(s) del autor *', key:'author', placeholder:'García López' },
                { label:'Inicial(es) del nombre',  key:'initial', placeholder:'M. J.' },
                { label:'Año *',                   key:'year',    placeholder:'2024', type:'number' },
                { label:'Título *',                key:'title',   placeholder:'Título completo' },
                { label:'Editorial / Institución', key:'publisher', placeholder:'' },
                { label:'Revista',                 key:'journal', placeholder:'' },
                { label:'Volumen',                 key:'volume',  placeholder:'' },
                { label:'Número',                  key:'issue',   placeholder:'' },
                { label:'Páginas',                 key:'pages',   placeholder:'45-67' },
                { label:'DOI',                     key:'doi',     placeholder:'10.xxxx/…' },
                { label:'URL',                     key:'url',     placeholder:'https://…' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs text-brand-400 mb-1">{f.label}</label>
                  <input
                    type={f.type ?? 'text'}
                    value={(form as Record<string,string>)[f.key]}
                    onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="w-full bg-brand-800 border border-brand-600 rounded-lg px-3 py-1.5 text-xs text-brand-100 outline-none focus:border-brand-400" />
                </div>
              ))}
              <div>
                <label className="block text-xs text-brand-400 mb-1">Tipo</label>
                <select value={form.ref_type} onChange={e => setForm(f => ({...f, ref_type: e.target.value as RefType}))}
                  className="w-full bg-brand-800 border border-brand-600 rounded-lg px-3 py-1.5 text-xs text-brand-100 outline-none focus:border-brand-400">
                  {(['libro','articulo','tesis','web','capitulo'] as RefType[]).map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowForm(false)}
                className="flex-1 py-2 rounded-lg text-xs border border-brand-700 text-brand-400 hover:text-brand-200 transition-colors">
                Cancelar
              </button>
              <button onClick={save} disabled={saving}
                className="flex-1 py-2 rounded-lg text-xs bg-green-700 hover:bg-green-600 text-white font-medium transition-colors disabled:opacity-50">
                {saving ? 'Guardando…' : 'Guardar fuente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
