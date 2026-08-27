// Rozbalovací panel „Správa kategorií" nad tabulkami úkolů.
import type { Categories, Category, Task } from '../../../types';
import type { CategoryManagerState } from './useCategoryManager';

interface CategoryManagerProps {
  cats: Categories;
  tasks: Task[];
  catMgr: CategoryManagerState;
}

const SWATCH_STYLE: React.CSSProperties = {
  position: 'relative',
  display: 'inline-block',
  width: 22,
  height: 22,
  borderRadius: 4,
  border: '2px solid #2d3748',
  cursor: 'pointer',
  flexShrink: 0,
};

/** Input překrývá vzorek celou plochou — viditelně průhledný, ale fokusovatelný. */
const SWATCH_INPUT_STYLE: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  opacity: 0,
  cursor: 'pointer',
};

export function CategoryManager({ cats, tasks, catMgr }: CategoryManagerProps) {
  return (
    <div
      style={{ border: '1px solid #1e2533', borderRadius: 8, marginBottom: 14, overflow: 'hidden' }}
    >
      {/* Rozbalovací hlavička je disclosure ovládání — `<button>`, ne klikací
          `<div>`: jinak je nedosažitelná klávesnicí a čtečka ji neohlásí. */}
      <button
        type="button"
        onClick={catMgr.toggle}
        aria-expanded={catMgr.open}
        style={{
          background: '#161b27',
          border: 'none',
          width: '100%',
          textAlign: 'left',
          font: 'inherit',
          padding: '8px 14px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          userSelect: 'none',
        }}
      >
        <span
          style={{
            fontSize: 10,
            color: '#64748b',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            fontWeight: 700,
          }}
        >
          Správa kategorií
        </span>
        <div style={{ display: 'flex', gap: 6, marginLeft: 8, flexWrap: 'wrap' }}>
          {Object.entries(cats).map(([k, v]) => (
            <div
              key={k}
              style={{
                width: 10,
                height: 10,
                background: v.bg,
                border: `1px solid ${v.bd}`,
                borderRadius: 2,
                flexShrink: 0,
              }}
            />
          ))}
        </div>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#475569' }}>
          {catMgr.open ? '▲' : '▼'}
        </span>
      </button>
      {catMgr.open && <CategoryManagerBody cats={cats} tasks={tasks} catMgr={catMgr} />}
    </div>
  );
}

interface CategoryRowProps {
  catKey: string;
  cat: Category;
  count: number;
  catMgr: CategoryManagerState;
}

function CategoryRow({ catKey, cat, count, catMgr }: CategoryRowProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 10px',
        background: '#161b27',
        border: `1px solid ${cat.bd}33`,
        borderRadius: 6,
      }}
    >
      <label
        htmlFor={`cp_${catKey}`}
        aria-label={`Barva kategorie ${cat.label}`}
        style={{ ...SWATCH_STYLE, background: cat.bd }}
      >
        {/* Průhledný input leží přesně na vzorku: klik i fokus jdou na
            něj samotný, takže není potřeba přeposílat klik z divu — a
            vzorek zůstane dostupný klávesnicí. */}
        <input
          id={`cp_${catKey}`}
          type="color"
          value={cat.bd.slice(0, 7)}
          onChange={(e) => catMgr.updateCatColor(catKey, e.target.value)}
          style={SWATCH_INPUT_STYLE}
        />
      </label>
      <input
        className="inp"
        value={cat.label}
        onChange={(e) => catMgr.updateCat(catKey, 'label', e.target.value)}
        style={{
          flex: 1,
          minWidth: 120,
          color: cat.tx,
          fontWeight: 600,
          background: cat.bg,
          borderColor: `${cat.bd}44`,
        }}
      />
      <span style={{ fontSize: 9, color: '#334155', minWidth: 40 }}>{count} úkolů</span>
      <button
        type="button"
        onClick={() => catMgr.deleteCat(catKey)}
        style={{
          background: 'none',
          border: 'none',
          color: '#475569',
          cursor: 'pointer',
          fontSize: 13,
          padding: '2px 5px',
          borderRadius: 3,
          transition: 'color .15s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = '#f87171')}
        onMouseLeave={(e) => (e.currentTarget.style.color = '#475569')}
      >
        ✕
      </button>
    </div>
  );
}

function NewCategoryRow({ catMgr }: { catMgr: CategoryManagerState }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 10px',
        background: '#0a1018',
        border: '1px dashed #2d3748',
        borderRadius: 6,
      }}
    >
      <span style={{ fontSize: 10, color: '#475569', flexShrink: 0 }}>Nová:</span>
      <label
        htmlFor="cp_new"
        aria-label="Barva nové kategorie"
        style={{ ...SWATCH_STYLE, background: catMgr.newCatColor }}
      >
        <input
          id="cp_new"
          type="color"
          value={catMgr.newCatColor}
          onChange={(e) => catMgr.setNewCatColor(e.target.value)}
          style={SWATCH_INPUT_STYLE}
        />
      </label>
      <input
        className="inp"
        value={catMgr.newCatLabel}
        onChange={(e) => catMgr.setNewCatLabel(e.target.value)}
        placeholder="Název kategorie…"
        onKeyDown={(e) => e.key === 'Enter' && catMgr.addCat()}
        style={{ flex: 1 }}
      />
      <button
        type="button"
        className="btn"
        onClick={catMgr.addCat}
        style={{
          padding: '3px 12px',
          background: '#0d2210',
          borderColor: '#34d39944',
          color: '#6ee7b7',
          fontSize: 10,
          flexShrink: 0,
        }}
      >
        + Přidat
      </button>
    </div>
  );
}

function CategoryManagerBody({ cats, tasks, catMgr }: CategoryManagerProps) {
  return (
    <div style={{ padding: '12px 14px', background: '#0c1018' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
        {Object.entries(cats).map(([key, cat]) => (
          <CategoryRow
            key={key}
            catKey={key}
            cat={cat}
            count={tasks.filter((t) => t.cat === key).length}
            catMgr={catMgr}
          />
        ))}
      </div>
      <NewCategoryRow catMgr={catMgr} />
    </div>
  );
}
